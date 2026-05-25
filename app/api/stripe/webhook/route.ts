import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/src/lib/prisma"
import { stripe } from "@/src/lib/stripe/stripe"
import { verifyWebhookSignature } from "@/src/lib/stripe/webhook-handler"
import Stripe from "stripe"
import { Prisma } from "@prisma/client"
import { sendRefundUserMail } from "@/src/lib/mail/refundUserMail"
import { sendIncidentAdminMail } from "@/src/lib/mail/incidentAdminMail"

type RefundFailure = {
  artworkId: string
  artworkTitle: string
  amountCents: number
}

// Handles the Stripe refund call + DB marker + user/admin notifications.
// Idempotent: safe to call multiple times for the same session thanks to
// Stripe's idempotency key (refund is deduplicated server-side).
async function handleRefunds(args: {
  sessionId: string
  paymentIntentId: string | null
  userId: string
  userEmail: string | null
  failures: RefundFailure[]
}) {
  const { sessionId, paymentIntentId, userId, userEmail, failures } = args
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

  // Mark the invoices as refunded in DB. This must happen AFTER the Stripe
  // refund succeeds so that "REFUNDED in DB without stripeRefundId" is a
  // reliable signal that we crashed and need to retry.
  if (refundOutcome === "issued" && stripeRefundId) {
    await prisma.invoice.updateMany({
      where: {
        stripeSessionId: sessionId,
        status: "REFUNDED",
        stripeRefundId: null,
      },
      data: { stripeRefundId },
    })
  }

  if (refundOutcome === "issued" && userEmail) {
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

      // Smart idempotence: check if invoices already exist for this session.
      // - If they exist and all REFUNDED ones have stripeRefundId → fully
      //   processed, return 200.
      // - If they exist but some REFUNDED ones have stripeRefundId === null →
      //   crash recovery: the original webhook committed the DB transaction
      //   but did not finish the Stripe refund. Replay the refund (Stripe
      //   dedupes via idempotency key).
      const existingInvoices = await prisma.invoice.findMany({
        where: { stripeSessionId: session.id },
        include: { artwork: { select: { title: true } } },
      })

      if (existingInvoices.length > 0) {
        const pendingRefunds = existingInvoices.filter(
          (i) => i.status === "REFUNDED" && !i.stripeRefundId
        )
        if (pendingRefunds.length === 0) {
          return NextResponse.json({ received: true })
        }

        console.warn("[webhook] recovery: REFUNDED invoices without stripeRefundId, replaying refund", {
          sessionId: session.id,
          count: pendingRefunds.length,
        })

        const recoveryFailures: RefundFailure[] = pendingRefunds.map((inv) => ({
          artworkId: inv.artworkId,
          artworkTitle: inv.artwork.title,
          amountCents: Math.round(Number(inv.amount) * 100),
        }))

        await handleRefunds({
          sessionId: session.id,
          paymentIntentId,
          userId,
          userEmail: user.email,
          failures: recoveryFailures,
        })

        return NextResponse.json({ received: true })
      }

      const failures: RefundFailure[] = []

      try {
        await prisma.$transaction(async (tx) => {
          for (const artworkId of artworkIds) {
            const artwork = await tx.artwork.findUnique({ where: { id: artworkId } })
            if (!artwork) continue

            const transferred = await tx.artwork.updateMany({
              where: { id: artworkId, ownerId: null },
              data: { ownerId: userId },
            })

            const status = transferred.count > 0 ? "PAID" : "REFUNDED"

            await tx.invoice.create({
              data: {
                buyerId: userId,
                artworkId,
                amount: artwork.price,
                status,
                stripeSessionId: session.id,
                stripePaymentIntentId: paymentIntentId,
              },
            })

            if (status === "REFUNDED") {
              failures.push({
                artworkId,
                artworkTitle: artwork.title,
                amountCents: Math.round(Number(artwork.price) * 100),
              })
            }
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
      })
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session

      await prisma.invoice.deleteMany({
        where: {
          stripeSessionId: session.id,
          status: "PENDING",
        },
      })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Error processing webhook:", error)
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    )
  }
}
