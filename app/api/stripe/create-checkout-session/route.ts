import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { stripe, CURRENCY } from "@/src/lib/stripe/stripe"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || !session.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }

    const userId = session.user.id

    // Récupérer toutes les invoices PENDING de l'utilisateur
    const invoices = await prisma.invoice.findMany({
      where: {
        buyerId: userId,
        status: "PENDING"
      },
      include: {
        artwork: true
      }
    })

    if (invoices.length === 0) {
      return NextResponse.json({ error: "Aucune commande en attente" }, { status: 400 })
    }

    // Vérifier que tous les artworks sont encore disponibles
    const unavailableArtworks = invoices.filter(inv => inv.artwork.ownerId !== null)
    if (unavailableArtworks.length > 0) {
      return NextResponse.json(
        { error: `${unavailableArtworks.length} oeuvre${unavailableArtworks.length > 1 ? 's' : ''} n'est plus disponible` },
        { status: 400 }
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")

    // Créer les line items pour Stripe Checkout
    const lineItems = invoices.map(invoice => ({
      price_data: {
        currency: CURRENCY,
        product_data: {
          name: invoice.artwork.title,
          description: `Oeuvre d'art - ${invoice.artwork.title}`
        },
        unit_amount: Math.round(Number(invoice.amount) * 100) // Convertir en centimes
      },
      quantity: 1
    }))

    // Calculer le total
    const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.amount), 0)

    // Créer la session Stripe Checkout
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${appUrl}/profile/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/profile/checkout/cancel`,
      customer_email: session.user.email || undefined,
      metadata: {
        userId: userId,
        invoiceIds: invoices.map(inv => inv.id).join(",")
      }
    })

    // Mettre à jour les invoices avec le stripeSessionId
    await prisma.invoice.updateMany({
      where: {
        id: { in: invoices.map(inv => inv.id) }
      },
      data: {
        stripeSessionId: checkoutSession.id
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
