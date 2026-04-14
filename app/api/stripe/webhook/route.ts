import { NextRequest, NextResponse } from "next/server"
import { stripe } from "@/src/lib/stripe/stripe"
import { prisma } from "@/src/lib/prisma"
import { verifyWebhookSignature } from "@/src/lib/stripe/webhook-handler"
import Stripe from "stripe"

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

      await prisma.$transaction(async (tx) => {
        const updated = await tx.invoice.updateMany({
          where: {
            stripeSessionId: session.id,
            status: "PENDING"
          },
          data: {
            status: "PAID",
            stripePaymentIntentId: session.payment_intent as string | null
          }
        })
        if (updated.count === 0) return

        const invoices = await tx.invoice.findMany({
          where : {
            stripeSessionId:session.id,
            status: "PAID"
          }
        })

        for (const invoice of invoices) {
          await tx.artwork.updateMany({
            where: {
              id: invoice.artworkId,
              ownerId: null
            },
            data: { ownerId: invoice.buyerId}
          })
        }
        const basket = await tx.basket.findUnique({
          where: { userId: invoices[0].buyerId }
        })
        if (basket) {
          await tx.basketItem.deleteMany({
            where: {basketId: basket.id}
          })
        }
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
