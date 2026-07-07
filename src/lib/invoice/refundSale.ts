import { createHash } from "node:crypto"
import { type Invoice, type InvoiceLineItem } from "@prisma/client"
import { prisma } from "@/src/lib/prisma"
import { stripe } from "@/src/lib/stripe/stripe"
import { emitCreditNote } from "./emitCreditNote"
import { invoiceViewModel } from "./invoiceViewModel"
import { renderInvoicePdf } from "./invoicePdf"
import { sendCreditNoteUserMail } from "@/src/lib/mail/creditNoteUserMail"
import { cancelParcel } from "@/src/lib/shipping/sendcloudClient"
import { sendShippingIncidentAdminMail } from "@/src/lib/mail/shippingIncidentAdminMail"

export class RefundSaleError extends Error {}

/**
 * Flux de remboursement APRÈS-VENTE (EPIC 5) : rembourse tout ou partie d'une
 * facture de vente, émet l'avoir correspondant et remet l'œuvre en vente.
 *
 * Déclencheur : action admin (l'UI est différée — cette fonction reste le point
 * d'entrée appelable/testable ; le wrapper server action devra vérifier le RBAC
 * `refund:invoice` avant de l'appeler).
 *
 * Ordre (robustesse crash + concurrence) :
 *  1. Validations (facture, lignes ciblées dédupliquées, montant).
 *  2. Transaction sérialisée par un verrou advisory sur la facture source
 *     (`pg_advisory_xact_lock`) englobant : garde anti-double-remboursement
 *     ré-évaluée sous verrou → `stripe.refunds.create` (clé d'idempotence
 *     déterministe) → `emitCreditNote` (montants négatifs, n° CN gapless) → remise
 *     en vente (`ownerId: null`). Le verrou empêche deux demandes concurrentes sur
 *     la même facture d'émettre deux remboursements Stripe distincts (double débit).
 *  3. Email avoir au client (best-effort, ne bloque pas le remboursement).
 */
export async function refundSale(args: {
  invoiceId: string
  artworkIds?: string[] // omis ⇒ remboursement total (toutes les lignes)
}): Promise<Invoice & { lineItems: InvoiceLineItem[] }> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: args.invoiceId },
    include: {
      lineItems: true,
      buyer: { select: { email: true } },
    },
  })

  if (!invoice) {
    throw new RefundSaleError(`Facture introuvable : ${args.invoiceId}`)
  }
  if (invoice.type !== "SALE") {
    throw new RefundSaleError("Seule une facture de vente peut être remboursée")
  }
  if (!invoice.stripePaymentIntentId) {
    throw new RefundSaleError("Remboursement impossible : payment_intent Stripe absent")
  }
  const paymentIntentId = invoice.stripePaymentIntentId

  // Lignes ciblées : sous-ensemble demandé (dédupliqué), sinon toutes.
  // `artworkIds` omis ⇒ remboursement total ; `[]` explicite ⇒ rejet (jamais un
  // remboursement total accidentel). Dédup : un doublon doublerait le montant Stripe
  // puis ferait échouer l'insert de l'avoir (@@unique) → Stripe et DB désynchronisés.
  // Multimap : une œuvre peut porter 2 lignes (ARTWORK + SHIPPING, B14). Rembourser un
  // artworkId embarque TOUTES ses lignes (l'aller est remboursé avec l'œuvre, L221-24).
  const linesByArtwork = new Map<string, typeof invoice.lineItems>()
  for (const l of invoice.lineItems) {
    const arr = linesByArtwork.get(l.artworkId) ?? []
    arr.push(l)
    linesByArtwork.set(l.artworkId, arr)
  }
  const targetIds =
    args.artworkIds !== undefined
      ? Array.from(new Set(args.artworkIds))
      : Array.from(linesByArtwork.keys())
  if (args.artworkIds !== undefined && targetIds.length === 0) {
    throw new RefundSaleError("Aucune œuvre à rembourser")
  }

  const targetLines = targetIds.flatMap((artworkId) => {
    const lines = linesByArtwork.get(artworkId)
    if (!lines || lines.length === 0) {
      throw new RefundSaleError(`L'œuvre ${artworkId} n'est pas sur la facture ${invoice.number}`)
    }
    return lines
  })

  const totalRefundCents = targetLines.reduce(
    (sum, l) => sum + Math.round(Number(l.lineTTC) * 100),
    0
  )

  // Clé d'idempotence déterministe par (facture, sélection d'œuvres), bornée :
  // hash des ids triés (la concaténation brute dépasse les 255 car. de Stripe dès ~6 œuvres).
  const sortedIds = [...targetIds].sort()
  const idempotencyKey = `credit-${invoice.id}-${createHash("sha256")
    .update(sortedIds.join("|"))
    .digest("hex")
    .slice(0, 16)}`

  // Transaction sérialisée par facture : le verrou advisory empêche deux demandes
  // concurrentes sur la même facture de passer toutes deux la garde puis d'émettre
  // deux remboursements Stripe distincts (double débit). L'appel Stripe est DANS la
  // transaction pour que le verrou couvre garde → Stripe → écriture ; durée négligeable
  // au volume galerie. Timeout relevé pour absorber la latence réseau Stripe.
  const creditNote = await prisma.$transaction(
    async (tx) => {
      // $executeRaw (et non $queryRaw) : pg_advisory_xact_lock renvoie `void`, que
      // $queryRaw ne sait pas désérialiser. $executeRaw exécute sans lire de colonnes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${invoice.id}, 0::bigint))`

      // Garde anti-double-remboursement, ré-évaluée SOUS verrou (source de vérité) :
      // une œuvre déjà créditée par un avoir ne peut pas l'être à nouveau.
      const priorCredits = await tx.invoice.findMany({
        where: { type: "CREDIT_NOTE", creditedInvoiceId: invoice.id },
        select: { lineItems: { select: { artworkId: true } } },
      })
      const alreadyCredited = new Set(
        priorCredits.flatMap((cn) => cn.lineItems.map((l) => l.artworkId))
      )
      const dup = targetIds.find((id) => alreadyCredited.has(id))
      if (dup) {
        throw new RefundSaleError(`L'œuvre ${dup} a déjà été remboursée (avoir existant)`)
      }

      const refund = await stripe.refunds.create(
        { payment_intent: paymentIntentId, amount: totalRefundCents },
        { idempotencyKey }
      )

      const cn = await emitCreditNote(tx, {
        originalInvoiceId: invoice.id,
        items: targetIds.map((artworkId) => ({ artworkId })),
        stripeRefundId: refund.id,
        saleDate: new Date(),
      })
      // Remise en vente : uniquement si l'œuvre appartient encore à l'acheteur
      // (un transfert ultérieur ne doit pas être écrasé).
      await tx.artwork.updateMany({
        where: { id: { in: targetIds }, ownerId: invoice.buyerId },
        data: { ownerId: null },
      })
      return cn
    },
    { timeout: 20_000 }
  )

  // Annulation des étiquettes réservées (spec §3.E, décision #6), HORS transaction et
  // best-effort : si le colis a été réservé (shippingParcelId) mais pas encore expédié,
  // on récupère le coût. Un échec (colis déjà remis au transporteur) ne doit JAMAIS
  // annuler le remboursement déjà dû au client (l'aller reste remboursé, L221-24) → on
  // logue + alerte l'admin, perte assumée. Idempotence : la garde anti-double-remboursement
  // empêche de re-créditer (donc re-annuler) la même œuvre, pas de marqueur dédié nécessaire.
  const parcelsToCancel = targetLines.filter(
    (l) => l.type === "SHIPPING" && l.shippingParcelId
  )
  for (const line of parcelsToCancel) {
    try {
      await cancelParcel(line.shippingParcelId as string)
    } catch (err) {
      console.error("[refundSale] parcel cancellation failed", {
        invoiceId: invoice.id,
        lineId: line.id,
        error: err instanceof Error ? err.message : err,
      })
      try {
        // Titre de l'œuvre = label de la ligne ARTWORK (celui de la ligne SHIPPING est le
        // nom du transporteur). Fallback défensif improbable (1 œuvre = 1 ligne ARTWORK).
        const artworkTitle =
          targetLines.find(
            (l) => l.type === "ARTWORK" && l.artworkId === line.artworkId
          )?.label ?? line.label
        await sendShippingIncidentAdminMail({
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          artworkId: line.artworkId,
          artworkTitle,
          shippingMethodId: line.shippingMethodId,
          error: err instanceof Error ? err.message : String(err),
        })
      } catch (mailErr) {
        console.error("[refundSale] parcel cancellation incident mail threw", {
          invoiceId: invoice.id,
          error: mailErr instanceof Error ? mailErr.message : mailErr,
        })
      }
    }
  }

  // Email avoir (best-effort) : un échec d'envoi ne doit pas annuler le remboursement.
  if (invoice.buyer?.email) {
    try {
      const vm = invoiceViewModel(creditNote)
      let pdf: Buffer | undefined
      try {
        pdf = await renderInvoicePdf(vm)
      } catch (pdfErr) {
        console.error("[refundSale] credit note pdf render failed", {
          creditNote: creditNote.number,
          error: pdfErr instanceof Error ? pdfErr.message : pdfErr,
        })
      }
      const mailRes = await sendCreditNoteUserMail({
        to: invoice.buyer.email,
        creditNoteNumber: creditNote.number,
        originalInvoiceNumber: invoice.number,
        // Montants négatifs sur l'avoir → on présente le remboursement en positif.
        refundedItems: creditNote.lineItems.map((l) => ({
          title: l.label,
          amountEur: Math.abs(Number(l.lineTTC)),
        })),
        totalRefundEur: Math.abs(Number(creditNote.totalTTC)),
        pdf,
      })
      if (!mailRes.ok) {
        console.error("[refundSale] credit note email failed", {
          creditNote: creditNote.number,
          error: mailRes.error,
        })
      }
    } catch (err) {
      console.error("[refundSale] credit note email threw", {
        creditNote: creditNote.number,
        error: err instanceof Error ? err.message : err,
      })
    }
  }

  return creditNote
}
