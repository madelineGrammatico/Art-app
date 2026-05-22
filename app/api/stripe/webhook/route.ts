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

      const alreadyProcessed = await prisma.invoice.findFirst({
        where: { stripeSessionId: session.id },
      })
      if (alreadyProcessed) {
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

      if (failures.length > 0 && paymentIntentId) {
        const totalRefundCents = failures.reduce((sum, f) => sum + f.amountCents, 0)

        let refundOutcome: "issued" | "failed" = "issued"
        let refundErrorMessage: string | undefined

        try {
          await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: totalRefundCents,
          })
          console.warn("[webhook] partial refund issued", {
            sessionId: session.id,
            userId,
            failures,
            totalRefundCents,
          })
        } catch (refundErr) {
          refundOutcome = "failed"
          refundErrorMessage =
            refundErr instanceof Error ? refundErr.message : String(refundErr)
          console.error("[webhook] Stripe refund failed", {
            sessionId: session.id,
            userId,
            failures,
            error: refundErrorMessage,
          })
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        })

        const affectedItems = failures.map((f) => ({
          artworkId: f.artworkId,
          title: f.artworkTitle,
          amountEur: f.amountCents / 100,
        }))

        if (refundOutcome === "issued" && user?.email) {
          try {
            const userMailRes = await sendRefundUserMail({
              to: user.email,
              refundedItems: affectedItems.map((item) => ({
                title: item.title,
                amountEur: item.amountEur,
              })),
              totalRefundEur: totalRefundCents / 100,
              sessionId: session.id,
            })
            if (!userMailRes.ok) {
              console.error("[webhook] refund email to user failed", {
                sessionId: session.id,
                error: userMailRes.error,
              })
            }
          } catch (err) {
            console.error("[webhook] refund email to user threw", {
              sessionId: session.id,
              error: err instanceof Error ? err.message : err,
            })
          }
        }

        try {
          const adminMailRes = await sendIncidentAdminMail({
            sessionId: session.id,
            userId,
            userEmail: user?.email,
            affectedItems,
            refundOutcome,
            refundError: refundErrorMessage,
          })
          if (!adminMailRes.ok) {
            console.error("[webhook] admin alert email failed", {
              sessionId: session.id,
              error: adminMailRes.error,
            })
          }
        } catch (err) {
          console.error("[webhook] admin alert email threw", {
            sessionId: session.id,
            error: err instanceof Error ? err.message : err,
          })
        }
      }
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
