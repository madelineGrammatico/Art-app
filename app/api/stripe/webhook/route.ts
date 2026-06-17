import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/src/lib/prisma"
import { stripe } from "@/src/lib/stripe/stripe"
import { verifyWebhookSignature } from "@/src/lib/stripe/webhook-handler"
import Stripe from "stripe"
import { Prisma } from "@prisma/client"
import { sendRefundUserMail } from "@/src/lib/mail/refundUserMail"
import { sendIncidentAdminMail } from "@/src/lib/mail/incidentAdminMail"
import { emitSaleInvoice, type SoldItem } from "@/src/lib/invoice/emitSaleInvoice"

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
      const adminMailRes = await sendIncidentAdminMail({
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
        select: { email: true },
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
        select: { id: true },
      })
      const existingRecoveries = await prisma.refundRecovery.findMany({
        where: { stripeSessionId: session.id },
        include: { artwork: { select: { title: true } } },
      })

      if (existingInvoice || existingRecoveries.length > 0) {
        const pendingRecoveries = existingRecoveries.filter((r) => !r.stripeRefundId)
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

      try {
        await prisma.$transaction(async (tx) => {
          const soldItems: SoldItem[] = []

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
            await emitSaleInvoice(tx, {
              buyerId: userId,
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
            })
          }

          const basket = await tx.basket.findUnique({ where: { userId } })
          if (basket) {
            await tx.basketItem.deleteMany({ where: { basketId: basket.id } })
          }
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
