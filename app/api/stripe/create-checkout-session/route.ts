import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { stripe, CURRENCY } from "@/src/lib/stripe/stripe"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }

    const userId = session.user.id

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Adresses de facturation et livraison requises" },
        { status: 400 }
      )
    }
    const { billingAddressId, shippingAddressId } = (body ?? {}) as {
      billingAddressId?: unknown
      shippingAddressId?: unknown
    }
    if (
      typeof billingAddressId !== "string" ||
      typeof shippingAddressId !== "string" ||
      !billingAddressId ||
      !shippingAddressId
    ) {
      return NextResponse.json(
        { error: "Adresses de facturation et livraison requises" },
        { status: 400 }
      )
    }

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

    // Validate addresses: must exist AND belong to the session user.
    // Single query handles both "unknown id" and "id of another user".
    const uniqueIds = Array.from(new Set([billingAddressId, shippingAddressId]))
    const ownedAddresses = await prisma.postalAddress.findMany({
      where: { id: { in: uniqueIds }, userId },
    })
    const ownedById = new Map(ownedAddresses.map((a) => [a.id, a]))
    const billing = ownedById.get(billingAddressId)
    const shipping = ownedById.get(shippingAddressId)
    if (!billing || !shipping) {
      return NextResponse.json(
        { error: "Adresse invalide ou inaccessible" },
        { status: 400 }
      )
    }

    const configuredAppUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    if (!configuredAppUrl && process.env.NODE_ENV === "production") {
      throw new Error(
        "App URL is not configured: NEXT_PUBLIC_APP_URL or VERCEL_URL must be set in production"
      )
    }
    const appUrl = configuredAppUrl ?? "http://localhost:3000"

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

    // Snapshot the addresses into metadata at session creation. Two upsides
    // over fetching at webhook time: (1) zero race if the user deletes the
    // address between checkout and webhook, (2) the address shown on the
    // checkout page IS the one frozen on the invoice — single source of truth.
    const billingAddressBlob = JSON.stringify({
      id: billing.id,
      street: billing.street,
      postalCode: billing.postalCode,
      city: billing.city,
      country: billing.country,
    })
    const shippingAddressBlob = JSON.stringify({
      id: shipping.id,
      street: shipping.street,
      postalCode: shipping.postalCode,
      city: shipping.city,
      country: shipping.country,
    })

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${appUrl}/profile/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/profile/checkout/cancel`,
      customer_email: session.user.email || undefined,
      payment_intent_data: {
        receipt_email: session.user.email || undefined,
      },
      metadata: {
        userId,
        artworkIds: basket.items.map(item => item.artworkId).join(","),
        billingAddress: billingAddressBlob,
        shippingAddress: shippingAddressBlob,
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
