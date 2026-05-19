import { NextResponse } from "next/server"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { stripe, CURRENCY } from "@/src/lib/stripe/stripe"

export async function POST() {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }

    const userId = session.user.id

    const basket = await prisma.basket.findUnique({
      where: { userId },
      include: {
        items: {
          include: { artwork: true }
        }
      }
    })

    if (!basket || basket.items.length === 0) {
      return NextResponse.json({ error: "Aucune commande en attente" }, { status: 400 })
    }

    const unavailableArtworks = basket.items.filter(item => item.artwork.ownerId !== null)
    if (unavailableArtworks.length > 0) {
      return NextResponse.json(
        { error: `${unavailableArtworks.length} oeuvre${unavailableArtworks.length > 1 ? 's' : ''} n'est plus disponible` },
        { status: 400 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

    const lineItems = basket.items.map(item => ({
      price_data: {
        currency: CURRENCY,
        product_data: {
          name: item.artwork.title,
          description: `Oeuvre d'art - ${item.artwork.title}`
        },
        unit_amount: Math.round(Number(item.artwork.price) * 100)
      },
      quantity: 1
    }))

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${appUrl}/profile/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/profile/checkout/cancel`,
      customer_email: session.user.email || undefined,
      metadata: {
        userId,
        artworkIds: basket.items.map(item => item.artworkId).join(",")
      }
    })

    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id
    })
  } catch (error) {
    console.error("Error creating checkout session:", error)
    return NextResponse.json(
      { error: "Erreur lors de la création de la session de paiement" },
      { status: 500 }
    )
  }
}
