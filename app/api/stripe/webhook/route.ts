import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/src/lib/prisma"
import { stripe } from "@/src/lib/stripe/stripe"
import { verifyWebhookSignature } from "@/src/lib/stripe/webhook-handler"
import Stripe from "stripe"
import { Prisma } from "@prisma/client"
import { sendRefundUserMail } from "@/src/lib/mail/refundUserMail"
import { sendCheckoutRaceIncidentAdminMail } from "@/src/lib/mail/checkoutRaceIncidentAdminMail"
import { sendInvoiceUserMail } from "@/src/lib/mail/invoiceUserMail"
import { sendShippingIncidentAdminMail } from "@/src/lib/mail/shippingIncidentAdminMail"
import { sendPickupCoordinationUserMail } from "@/src/lib/mail/pickupCoordinationUserMail"
import {
  emitSaleInvoice,
  type SoldItem,
  type ShippingSelection,
} from "@/src/lib/invoice/emitSaleInvoice"
import { createParcel } from "@/src/lib/shipping/sendcloudClient"
import { invoiceViewModel } from "@/src/lib/invoice/invoiceViewModel"
import { renderInvoicePdf } from "@/src/lib/invoice/invoicePdf"

type RefundFailure = {
  artworkId: string
  artworkTitle: string
  amountCents: number
}

type AddressFromMetadata = {
  id: string
  street: string
  postalCode: string
  city: string
  country: string
}

// The snapshot of the address comes from Stripe metadata (frozen at checkout
// session creation), so we don't need to query PostalAddress to fill snapshot
// columns. We only query to decide whether the FK can be set: if the user
// deleted the address between checkout and webhook, the row is gone and the
// FK must be null (insert with a stale FK would violate the constraint).
function parseAddressBlob(raw: string | undefined): AddressFromMetadata | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.id === "string" &&
      typeof parsed.street === "string" &&
      typeof parsed.postalCode === "string" &&
      typeof parsed.city === "string" &&
      typeof parsed.country === "string"
    ) {
      return parsed as AddressFromMetadata
    }
    return null
  } catch {
    return null
  }
}

// Devis transporteur gelé au checkout, transporté dans les metadata Stripe (spec §3.B).
// Prix en centimes (unité Sendcloud) ; converti en euros au moment de bâtir la ligne.
type ShippingSelectionFromMetadata = {
  artworkId: string
  shippingMethodId: string
  label: string
  unitPriceHTCents: number
}

function parseShippingSelections(raw: string | undefined): ShippingSelectionFromMetadata[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is ShippingSelectionFromMetadata =>
        s &&
        typeof s.artworkId === "string" &&
        typeof s.shippingMethodId === "string" &&
        typeof s.label === "string" &&
        typeof s.unitPriceHTCents === "number"
    )
  } catch {
    return []
  }
}

// Handles the Stripe refund call + DB marker + user/admin notifications.
// Idempotent on the Stripe side (idempotency key dedupes refunds).
// Set `isRecovery: true` when called from the crash-recovery path: emails are
// skipped because we cannot tell if they were already sent before the crash,
// and re-sending would spam. Stripe's own refund receipt still reaches the
// buyer, and the recovery itself is logged for admin visibility.
async function handleRefunds(args: {
  sessionId: string
  paymentIntentId: string | null
  userId: string
  userEmail: string | null
  failures: RefundFailure[]
  isRecovery: boolean
}) {
  const { sessionId, paymentIntentId, userId, userEmail, failures, isRecovery } = args
  if (failures.length === 0) return

  const totalRefundCents = failures.reduce((sum, f) => sum + f.amountCents, 0)
  const affectedItems = failures.map((f) => ({
    artworkId: f.artworkId,
    title: f.artworkTitle,
    amountEur: f.amountCents / 100,
  }))

  let refundOutcome: "issued" | "failed" = "issued"
  let refundErrorMessage: string | undefined
  let stripeRefundId: string | undefined

  if (paymentIntentId) {
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: totalRefundCents,
        },
        { idempotencyKey: `refund-${sessionId}` }
      )
      stripeRefundId = refund.id
      console.warn("[webhook] partial refund issued", {
        sessionId,
        userId,
        failures,
        totalRefundCents,
        refundId: refund.id,
      })
    } catch (refundErr) {
      refundOutcome = "failed"
      refundErrorMessage =
        refundErr instanceof Error ? refundErr.message : String(refundErr)
      console.error("[webhook] Stripe refund failed", {
        sessionId,
        userId,
        failures,
        error: refundErrorMessage,
      })
    }
  } else {
    refundOutcome = "failed"
    refundErrorMessage = "Stripe payment_intent missing on session"
    console.error("[webhook] cannot refund: payment_intent missing", {
      sessionId,
      userId,
      failures,
    })
  }

  // Stamp the recovery markers. This must happen AFTER the Stripe refund
  // succeeds so that "RefundRecovery without stripeRefundId" is a reliable
  // signal that we crashed and need to retry.
  if (refundOutcome === "issued" && stripeRefundId) {
    await prisma.refundRecovery.updateMany({
      where: {
        stripeSessionId: sessionId,
        stripeRefundId: null,
      },
      data: { stripeRefundId },
    })
  }

  if (refundOutcome === "issued" && userEmail && !isRecovery) {
    try {
      const userMailRes = await sendRefundUserMail({
        to: userEmail,
        refundedItems: affectedItems.map((item) => ({
          title: item.title,
          amountEur: item.amountEur,
        })),
        totalRefundEur: totalRefundCents / 100,
        sessionId,
      })
      if (!userMailRes.ok) {
        console.error("[webhook] refund email to user failed", {
          sessionId,
          error: userMailRes.error,
        })
      }
    } catch (err) {
      console.error("[webhook] refund email to user threw", {
        sessionId,
        error: err instanceof Error ? err.message : err,
      })
    }
  }

  if (!isRecovery) {
    try {
      const adminMailRes = await sendCheckoutRaceIncidentAdminMail({
        sessionId,
        userId,
        userEmail,
        affectedItems,
        refundOutcome,
        refundError: refundErrorMessage,
      })
      if (!adminMailRes.ok) {
        console.error("[webhook] admin alert email failed", {
          sessionId,
          error: adminMailRes.error,
        })
      }
    } catch (err) {
      console.error("[webhook] admin alert email threw", {
        sessionId,
        error: err instanceof Error ? err.message : err,
      })
    }
  }
}

// Envoie l'email facture (PDF joint) puis pose emailSentAt — marqueur d'idempotence :
// tant qu'il est null, l'envoi n'est pas confirmé et sera rejoué au prochain passage du
// webhook (crash entre le commit DB et l'envoi). Best-effort : un échec n'est pas stampé.
async function sendInvoiceEmail(
  invoice: Awaited<ReturnType<typeof emitSaleInvoice>>,
  email: string,
  sessionId: string
) {
  try {
    const vm = invoiceViewModel(invoice)
    // PDF best-effort : un échec de rendu ne doit pas priver le client de l'email.
    let pdf: Buffer | undefined
    try {
      pdf = await renderInvoicePdf(vm)
    } catch (pdfErr) {
      console.error("[webhook] invoice pdf render failed", {
        sessionId,
        error: pdfErr instanceof Error ? pdfErr.message : pdfErr,
      })
    }
    const mailRes = await sendInvoiceUserMail({ to: email, invoice: vm, pdf })
    if (mailRes.ok) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { emailSentAt: new Date() },
      })
    } else {
      console.error("[webhook] invoice email failed", { sessionId, error: mailRes.error })
    }
  } catch (err) {
    console.error("[webhook] invoice email threw", {
      sessionId,
      error: err instanceof Error ? err.message : err,
    })
  }
}

type EmittedInvoice = Awaited<ReturnType<typeof emitSaleInvoice>>

// Réservation des étiquettes réelles APRÈS le commit (EPIC 3bis) — pattern sendInvoiceEmail.
// Idempotent : on ne traite que les lignes SHIPPING sans shippingParcelId (pas encore créé)
// ni shippingParcelFailedAt (déjà tenté et échoué → trace pour traitement manuel, pas de
// re-spam de l'API). Best-effort : un échec marque la ligne + alerte admin, sans crash du
// webhook (qui doit répondre 200 à Stripe).
async function createParcelsForInvoice(invoice: EmittedInvoice, sessionId: string) {
  if (invoice.fulfillmentMode !== "DELIVERY") return
  const shippingLines = invoice.lineItems.filter(
    (li) => li.type === "SHIPPING" && !li.shippingParcelId && !li.shippingParcelFailedAt
  )
  for (const line of shippingLines) {
    try {
      const artwork = await prisma.artwork.findUnique({
        where: { id: line.artworkId },
        select: {
          packageWeightKg: true,
          packageLengthCm: true,
          packageWidthCm: true,
          packageHeightCm: true,
        },
      })
      if (
        !line.shippingMethodId ||
        !artwork?.packageWeightKg ||
        !artwork.packageLengthCm ||
        !artwork.packageWidthCm ||
        !artwork.packageHeightCm ||
        !invoice.shippingStreet ||
        !invoice.shippingPostalCode ||
        !invoice.shippingCity ||
        !invoice.shippingCountry
      ) {
        throw new Error("Données de colis incomplètes (dimensions ou adresse de livraison manquantes)")
      }
      const { parcelId } = await createParcel({
        shippingMethodId: line.shippingMethodId,
        toName: invoice.buyerName,
        toAddress: {
          street: invoice.shippingStreet,
          postalCode: invoice.shippingPostalCode,
          city: invoice.shippingCity,
          country: invoice.shippingCountry,
        },
        weightKg: Number(artwork.packageWeightKg),
        lengthCm: Number(artwork.packageLengthCm),
        widthCm: Number(artwork.packageWidthCm),
        heightCm: Number(artwork.packageHeightCm),
      })
      await prisma.invoiceLineItem.update({
        where: { id: line.id },
        data: { shippingParcelId: parcelId },
      })
    } catch (err) {
      await prisma.invoiceLineItem.update({
        where: { id: line.id },
        data: { shippingParcelFailedAt: new Date() },
      })
      console.error("[webhook] shipping parcel creation failed", {
        sessionId,
        invoiceId: invoice.id,
        lineId: line.id,
        error: err instanceof Error ? err.message : err,
      })
      try {
        await sendShippingIncidentAdminMail({
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          artworkId: line.artworkId,
          artworkTitle: line.label,
          shippingMethodId: line.shippingMethodId,
          error: err instanceof Error ? err.message : String(err),
        })
      } catch (mailErr) {
        console.error("[webhook] shipping incident mail threw", {
          sessionId,
          error: mailErr instanceof Error ? mailErr.message : mailErr,
        })
      }
    }
  }
}

// Email de coordination retrait (PICKUP, US1bis.3) après le commit. pickupEmailSentAt =
// marqueur d'idempotence (symétrique de emailSentAt) : rejoué si null au prochain passage.
async function sendPickupCoordinationEmail(
  invoice: EmittedInvoice,
  email: string,
  sessionId: string
) {
  if (invoice.fulfillmentMode !== "PICKUP" || invoice.pickupEmailSentAt) return
  try {
    const artworkTitles = invoice.lineItems
      .filter((li) => li.type === "ARTWORK")
      .map((li) => li.label)
    const res = await sendPickupCoordinationUserMail({
      to: email,
      invoiceNumber: invoice.number,
      artworkTitles,
    })
    if (res.ok) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { pickupEmailSentAt: new Date() },
      })
    } else {
      console.error("[webhook] pickup coordination email failed", {
        sessionId,
        error: res.error,
      })
    }
  } catch (err) {
    console.error("[webhook] pickup coordination email threw", {
      sessionId,
      error: err instanceof Error ? err.message : err,
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get("stripe-signature")

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 })
    }

    const event = await verifyWebhookSignature(body, signature)

    if (!event) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      const artworkIdsRaw = session.metadata?.artworkIds

      if (!userId || !artworkIdsRaw) {
        console.error("[webhook] checkout.session.completed missing metadata", {
          sessionId: session.id,
        })
        return NextResponse.json({ received: true })
      }

      const artworkIds = artworkIdsRaw.split(",").filter(Boolean)
      const paymentIntentId = (session.payment_intent as string | null) ?? null

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true, firstName: true, lastName: true },
      })
      if (!user) {
        console.error("[webhook] buyer not found in DB", {
          sessionId: session.id,
          userId,
        })
        return NextResponse.json({ received: true })
      }

      // Smart idempotence: a processed session has either a SALE invoice and/or
      // RefundRecovery rows.
      // - Already processed (invoice present and no pending recovery) → 200.
      // - RefundRecovery without stripeRefundId → crash recovery: the DB
      //   transaction committed but the Stripe refund never finished. Replay it
      //   (Stripe dedupes via the idempotency key).
      const existingInvoice = await prisma.invoice.findFirst({
        where: { type: "SALE", stripeSessionId: session.id },
        select: { id: true, emailSentAt: true },
      })
      const existingRecoveries = await prisma.refundRecovery.findMany({
        where: { stripeSessionId: session.id },
        include: { artwork: { select: { title: true } } },
      })

      if (existingInvoice || existingRecoveries.length > 0) {
        const pendingRecoveries = existingRecoveries.filter((r) => !r.stripeRefundId)

        // Rejeu post-commit (crash après commit, avant les effets de bord). Chaque effet
        // a son marqueur d'idempotence : emailSentAt (email facture), shippingParcelId/
        // shippingParcelFailedAt (colis), pickupEmailSentAt (email retrait).
        if (existingInvoice) {
          const full = await prisma.invoice.findUnique({
            where: { id: existingInvoice.id },
            include: { lineItems: true },
          })
          if (full) {
            if (!full.emailSentAt && user.email) {
              await sendInvoiceEmail(full, user.email, session.id)
            }
            await createParcelsForInvoice(full, session.id)
            if (user.email) await sendPickupCoordinationEmail(full, user.email, session.id)
          }
        }

        if (pendingRecoveries.length === 0) {
          return NextResponse.json({ received: true })
        }

        console.warn("[webhook] recovery: RefundRecovery without stripeRefundId, replaying refund", {
          sessionId: session.id,
          count: pendingRecoveries.length,
        })

        const recoveryFailures: RefundFailure[] = pendingRecoveries.map((rec) => ({
          artworkId: rec.artworkId,
          artworkTitle: rec.artwork.title,
          amountCents: Math.round(Number(rec.amount) * 100),
        }))

        await handleRefunds({
          sessionId: session.id,
          paymentIntentId,
          userId,
          userEmail: user.email,
          failures: recoveryFailures,
          isRecovery: true,
        })

        return NextResponse.json({ received: true })
      }

      const failures: RefundFailure[] = []

      const billingAddress = parseAddressBlob(session.metadata?.billingAddress)
      const shippingAddress = parseAddressBlob(session.metadata?.shippingAddress)
      const candidateAddressIds = [billingAddress?.id, shippingAddress?.id].filter(
        (id): id is string => !!id
      )
      const stillExisting = candidateAddressIds.length
        ? await prisma.postalAddress.findMany({
            where: { id: { in: candidateAddressIds } },
            select: { id: true },
          })
        : []
      const stillExistingIds = new Set(stillExisting.map((a) => a.id))
      const billingAddressFk =
        billingAddress && stillExistingIds.has(billingAddress.id) ? billingAddress.id : null
      const shippingAddressFk =
        shippingAddress && stillExistingIds.has(shippingAddress.id) ? shippingAddress.id : null

      // Mode de remise + devis gelé (B14). Défaut DELIVERY (cohérent avec les commandes
      // d'avant le shipping). Les sélections sont en centimes dans les metadata → euros ici.
      const fulfillmentMode =
        session.metadata?.fulfillmentMode === "PICKUP" ? "PICKUP" : "DELIVERY"
      const shippingSelections: ShippingSelection[] = parseShippingSelections(
        session.metadata?.shippingSelections
      ).map((s) => ({
        artworkId: s.artworkId,
        shippingMethodId: s.shippingMethodId,
        label: s.label,
        unitPriceHT: s.unitPriceHTCents / 100,
      }))

      let emittedInvoice: Awaited<ReturnType<typeof emitSaleInvoice>> | null = null
      try {
        emittedInvoice = await prisma.$transaction(async (tx) => {
          const soldItems: SoldItem[] = []
          let invoice: Awaited<ReturnType<typeof emitSaleInvoice>> | null = null

          for (const artworkId of artworkIds) {
            const artwork = await tx.artwork.findUnique({ where: { id: artworkId } })
            if (!artwork) continue

            const transferred = await tx.artwork.updateMany({
              where: { id: artworkId, ownerId: null },
              data: { ownerId: userId },
            })

            if (transferred.count > 0) {
              // Vendue → ligne de facture.
              soldItems.push({
                artworkId,
                label: artwork.title,
                unitPriceHT: artwork.price,
              })
            } else {
              // Déjà vendue (race) : pas de vente → marqueur de récupération + remboursement.
              await tx.refundRecovery.create({
                data: {
                  stripeSessionId: session.id,
                  buyerId: userId,
                  artworkId,
                  amount: artwork.price,
                },
              })
              failures.push({
                artworkId,
                artworkTitle: artwork.title,
                amountCents: Math.round(Number(artwork.price) * 100),
              })
            }
          }

          // Une seule facture pour la commande, uniquement si au moins une œuvre vendue.
          if (soldItems.length > 0) {
            const buyerName =
              [user.firstName, user.lastName].filter(Boolean).join(" ") ||
              user.name ||
              user.email ||
              "Client"
            invoice = await emitSaleInvoice(tx, {
              buyerId: userId,
              buyerName,
              stripeSessionId: session.id,
              stripePaymentIntentId: paymentIntentId,
              soldItems,
              saleDate: new Date(),
              billing: {
                fk: billingAddressFk,
                street: billingAddress?.street ?? null,
                postalCode: billingAddress?.postalCode ?? null,
                city: billingAddress?.city ?? null,
                country: billingAddress?.country ?? null,
              },
              shipping: {
                fk: shippingAddressFk,
                street: shippingAddress?.street ?? null,
                postalCode: shippingAddress?.postalCode ?? null,
                city: shippingAddress?.city ?? null,
                country: shippingAddress?.country ?? null,
              },
              fulfillmentMode,
              shippingSelections,
            })
          }

          const basket = await tx.basket.findUnique({ where: { userId } })
          if (basket) {
            await tx.basketItem.deleteMany({ where: { basketId: basket.id } })
          }

          return invoice
        })
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          return NextResponse.json({ received: true })
        }
        throw err
      }

      await handleRefunds({
        sessionId: session.id,
        paymentIntentId,
        userId,
        userEmail: user.email,
        failures,
        isRecovery: false,
      })

      // Email facture au client. emailSentAt (posé dans sendInvoiceEmail) garantit
      // l'unicité ; un crash après commit mais avant l'envoi est rejoué au prochain
      // passage du webhook (cf. branche existingInvoice). Remplace l'intérim reçu Stripe.
      if (emittedInvoice) {
        if (user.email) {
          await sendInvoiceEmail(emittedInvoice, user.email, session.id)
        }
        // Effets de bord transporteur après le commit (idempotents via marqueurs).
        await createParcelsForInvoice(emittedInvoice, session.id)
        if (user.email) {
          await sendPickupCoordinationEmail(emittedInvoice, user.email, session.id)
        }
      }
    }
    // checkout.session.expired : rien à faire — aucune facture/recovery n'est
    // créée avant la confirmation de paiement (plus de brouillon PENDING).

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Error processing webhook:", error)
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    )
  }
}
