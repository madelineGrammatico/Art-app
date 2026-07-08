import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { stripe, CURRENCY } from "@/src/lib/stripe/stripe"
import { computeCartShipping } from "@/src/lib/shipping/cartShipping"
import { selectPreferredRate } from "@/src/lib/shipping/selectRate"

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
        { error: "Requête invalide : body JSON malformé" },
        { status: 400 }
      )
    }
    const {
      billingAddressId,
      shippingAddressId,
      fulfillmentMode: fulfillmentModeRaw,
      shippingSelections: shippingSelectionsRaw,
    } = (body ?? {}) as {
      billingAddressId?: unknown
      shippingAddressId?: unknown
      fulfillmentMode?: unknown
      shippingSelections?: unknown
    }

    // Mode de remise (B14). Défaut DELIVERY. En PICKUP, pas d'adresse de livraison
    // requise (US1bis) ; l'adresse de facturation reste obligatoire dans les deux cas.
    const fulfillmentMode = fulfillmentModeRaw === "PICKUP" ? "PICKUP" : "DELIVERY"

    if (typeof billingAddressId !== "string" || !billingAddressId) {
      return NextResponse.json(
        { error: "Adresse de facturation requise" },
        { status: 400 }
      )
    }
    if (
      fulfillmentMode === "DELIVERY" &&
      (typeof shippingAddressId !== "string" || !shippingAddressId)
    ) {
      return NextResponse.json(
        { error: "Adresse de livraison requise" },
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
    const idsToValidate =
      fulfillmentMode === "DELIVERY"
        ? [billingAddressId, shippingAddressId as string]
        : [billingAddressId]
    const uniqueIds = Array.from(new Set(idsToValidate))
    const ownedAddresses = await prisma.postalAddress.findMany({
      where: { id: { in: uniqueIds }, userId },
    })
    const ownedById = new Map(ownedAddresses.map((a) => [a.id, a]))
    const billing = ownedById.get(billingAddressId)
    const shipping =
      fulfillmentMode === "DELIVERY"
        ? ownedById.get(shippingAddressId as string)
        : undefined
    if (!billing || (fulfillmentMode === "DELIVERY" && !shipping)) {
      return NextResponse.json(
        { error: "Adresse invalide ou inaccessible" },
        { status: 400 }
      )
    }

    // Devis transporteur (DELIVERY uniquement) : gelé maintenant pour facturer au webhook
    // exactement le montant montré ici (spec §3). Jamais de calcul à 0 € : données
    // physiques manquantes ou échec transporteur → 400 explicite (US0.2 / US2.1).
    type FrozenSelection = {
      artworkId: string
      shippingMethodId: string
      label: string
      unitPriceHTCents: number
    }
    const frozenShipping: FrozenSelection[] = []

    if (fulfillmentMode === "DELIVERY") {
      const shippingAddr = shipping!
      let cart: Awaited<ReturnType<typeof computeCartShipping>>
      try {
        cart = await computeCartShipping({
          items: basket.items.map((item) => ({
            artworkId: item.artworkId,
            pickupOnly: item.artwork.pickupOnly,
            packageWeightKg: item.artwork.packageWeightKg,
            packageLengthCm: item.artwork.packageLengthCm,
            packageWidthCm: item.artwork.packageWidthCm,
            packageHeightCm: item.artwork.packageHeightCm,
          })),
          toAddress: {
            street: shippingAddr.street,
            postalCode: shippingAddr.postalCode,
            city: shippingAddr.city,
            country: shippingAddr.country,
          },
        })
      } catch (shippingErr) {
        return NextResponse.json(
          {
            error: `Frais de livraison indisponibles : ${
              shippingErr instanceof Error ? shippingErr.message : "erreur transporteur"
            }`,
          },
          { status: 400 }
        )
      }

      if (!cart.eligible) {
        return NextResponse.json(
          {
            error:
              "Certaines œuvres sont trop volumineuses ou lourdes pour la livraison standard : seul le retrait sur place est possible pour cette commande.",
            blockingArtworkIds: cart.blockingArtworkIds,
          },
          { status: 400 }
        )
      }

      // Sélection client par œuvre (quand plusieurs offres). Une seule offre → auto-choisie.
      const clientSelections = new Map<string, string>()
      if (Array.isArray(shippingSelectionsRaw)) {
        for (const sel of shippingSelectionsRaw) {
          if (
            sel &&
            typeof sel.artworkId === "string" &&
            typeof sel.shippingMethodId === "string"
          ) {
            clientSelections.set(sel.artworkId, sel.shippingMethodId)
          }
        }
      }

      // Préférence transporteur surchargeable sans redéploiement (sinon défaut curé).
      const preferredCodes = process.env.SHIPPING_PREFERRED_OPTION_CODES
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean)

      for (const [artworkId, rates] of cart.quotesByArtwork) {
        if (rates.length === 0) {
          return NextResponse.json(
            { error: `Aucune offre de livraison disponible pour l'œuvre ${artworkId}.` },
            { status: 400 }
          )
        }
        // Si l'acheteur a choisi (US2.4, non utilisé en MVP) on l'honore ; sinon défaut curé.
        const selectedId = clientSelections.get(artworkId)
        const chosen = selectedId
          ? rates.find((r) => r.shippingMethodId === selectedId)
          : selectPreferredRate(rates, preferredCodes)
        if (!chosen) {
          return NextResponse.json(
            { error: `Option de livraison invalide pour l'œuvre ${artworkId}.` },
            { status: 400 }
          )
        }
        frozenShipping.push({
          artworkId,
          shippingMethodId: chosen.shippingMethodId,
          label: chosen.label,
          unitPriceHTCents: chosen.priceHTCents,
        })
      }
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

    const artworkLineItems = basket.items.map(item => ({
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
    // Frais de port = lignes Stripe additionnelles (le client paie le devis gelé).
    const shippingLineItems = frozenShipping.map((s) => ({
      price_data: {
        currency: CURRENCY,
        product_data: { name: s.label },
        unit_amount: s.unitPriceHTCents,
      },
      quantity: 1,
    }))
    const lineItems = [...artworkLineItems, ...shippingLineItems]

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
    const shippingAddressBlob = shipping
      ? JSON.stringify({
          id: shipping.id,
          street: shipping.street,
          postalCode: shipping.postalCode,
          city: shipping.city,
          country: shipping.country,
        })
      : null

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
        fulfillmentMode,
        ...(shippingAddressBlob ? { shippingAddress: shippingAddressBlob } : {}),
        ...(frozenShipping.length
          ? { shippingSelections: JSON.stringify(frozenShipping) }
          : {}),
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
