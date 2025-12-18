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

    // Gérer les différents types d'événements
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session

      // Récupérer les invoices associées à cette session
      const invoices = await prisma.invoice.findMany({
        where: {
          stripeSessionId: session.id,
          status: "PENDING"
        },
        include: {
          artwork: true
        }
      })

      if (invoices.length > 0) {
        // Mettre à jour le statut des invoices à PAID
        await prisma.invoice.updateMany({
          where: {
            id: { in: invoices.map(inv => inv.id) }
          },
          data: {
            status: "PAID",
            stripePaymentIntentId: session.payment_intent as string | null
          }
        })

        // Assigner les artworks à l'acheteur
        for (const invoice of invoices) {
          // Vérifier que l'artwork est toujours disponible
          if (invoice.artwork.ownerId === null) {
            await prisma.artwork.update({
              where: { id: invoice.artworkId },
              data: { ownerId: invoice.buyerId }
            })
          }
        }

        // Vider le panier de l'utilisateur après paiement réussi
        const userId = invoices[0].buyerId
        const basket = await prisma.basket.findUnique({
          where: { userId }
        })

        if (basket) {
          await prisma.basketItem.deleteMany({
            where: { basketId: basket.id }
          })
        }
      }
    } else if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent

      // Mettre à jour les invoices avec le payment intent ID si nécessaire
      await prisma.invoice.updateMany({
        where: {
          stripePaymentIntentId: paymentIntent.id
        },
        data: {
          status: "PAID"
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
