import { type Invoice, type InvoiceLineItem } from "@prisma/client"
import { prisma } from "@/src/lib/prisma"
import { stripe } from "@/src/lib/stripe/stripe"
import { emitCreditNote } from "./emitCreditNote"
import { invoiceViewModel } from "./invoiceViewModel"
import { renderInvoicePdf } from "./invoicePdf"
import { sendCreditNoteUserMail } from "@/src/lib/mail/creditNoteUserMail"

export class RefundSaleError extends Error {}

/**
 * Flux de remboursement APRÈS-VENTE (EPIC 5) : rembourse tout ou partie d'une
 * facture de vente, émet l'avoir correspondant et remet l'œuvre en vente.
 *
 * Déclencheur : action admin (l'UI est différée — cette fonction reste le point
 * d'entrée appelable/testable ; le wrapper server action devra vérifier le RBAC
 * `refund:invoice` avant de l'appeler).
 *
 * Ordre (robustesse crash, cf. webhook) :
 *  1. Validations + garde anti-double-remboursement AVANT tout appel Stripe.
 *  2. `stripe.refunds.create` avec clé d'idempotence déterministe → si on rejoue
 *     la même demande, Stripe renvoie le même remboursement (pas de double débit).
 *  3. Transaction : `emitCreditNote` (montants négatifs, numéro CN gapless) + remise
 *     en vente (`ownerId: null`). L'avoir porte `stripeRefundId` (@@unique) → un
 *     rejeu ne peut pas créer 2 avoirs.
 *  4. Email avoir au client (best-effort, ne bloque pas le remboursement).
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
      creditNotes: { include: { lineItems: true } },
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

  // Lignes ciblées : sous-ensemble demandé, sinon toutes.
  const lineByArtwork = new Map(invoice.lineItems.map((l) => [l.artworkId, l]))
  const targetIds = args.artworkIds?.length ? args.artworkIds : invoice.lineItems.map((l) => l.artworkId)

  const targetLines = targetIds.map((artworkId) => {
    const line = lineByArtwork.get(artworkId)
    if (!line) {
      throw new RefundSaleError(`L'œuvre ${artworkId} n'est pas sur la facture ${invoice.number}`)
    }
    return line
  })

  // Garde anti-double-remboursement : une œuvre déjà créditée par un avoir existant
  // ne peut pas l'être à nouveau.
  const alreadyCredited = new Set(
    invoice.creditNotes.flatMap((cn) => cn.lineItems.map((l) => l.artworkId))
  )
  const dup = targetIds.find((id) => alreadyCredited.has(id))
  if (dup) {
    throw new RefundSaleError(`L'œuvre ${dup} a déjà été remboursée (avoir existant)`)
  }

  const totalRefundCents = targetLines.reduce(
    (sum, l) => sum + Math.round(Number(l.lineTTC) * 100),
    0
  )

  const sortedIds = [...targetIds].sort()
  const refund = await stripe.refunds.create(
    {
      payment_intent: invoice.stripePaymentIntentId,
      amount: totalRefundCents,
    },
    { idempotencyKey: `credit-${invoice.id}-${sortedIds.join("-")}` }
  )

  const creditNote = await prisma.$transaction(async (tx) => {
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
  })

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
