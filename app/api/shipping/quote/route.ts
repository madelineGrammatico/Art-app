import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { computeCartShipping } from "@/src/lib/shipping/cartShipping"

/**
 * Devis transporteur pour le panier courant, à afficher AVANT paiement (US2.4) : le
 * checkout montre les offres par œuvre + le prix, pour que le montant affiché corresponde
 * à ce que Stripe facturera (incohérences #6/#7). Lecture seule / gratuit côté Sendcloud.
 *
 * Le prix figé qui sera réellement facturé est re-calculé côté create-checkout-session
 * (le prix serveur fait foi, jamais le prix client) — ce devis sert l'affichage et le
 * choix du transporteur ; la sélection est transmise ensuite via `shippingSelections`.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
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
    const { shippingAddressId } = (body ?? {}) as { shippingAddressId?: unknown }
    if (typeof shippingAddressId !== "string" || !shippingAddressId) {
      return NextResponse.json(
        { error: "Adresse de livraison requise" },
        { status: 400 }
      )
    }

    const shippingAddr = await prisma.postalAddress.findFirst({
      where: { id: shippingAddressId, userId },
    })
    if (!shippingAddr) {
      return NextResponse.json(
        { error: "Adresse invalide ou inaccessible" },
        { status: 400 }
      )
    }

    const basket = await prisma.basket.findUnique({
      where: { userId },
      include: { items: { include: { artwork: true } } },
    })
    if (!basket || basket.items.length === 0) {
      return NextResponse.json({ error: "Aucune commande en attente" }, { status: 400 })
    }

    const titleByArtwork = new Map(
      basket.items.map((item) => [item.artworkId, item.artwork.title])
    )

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
      return NextResponse.json({
        eligible: false,
        blockingArtworkIds: cart.blockingArtworkIds,
      })
    }

    const quotes = Array.from(cart.quotesByArtwork.entries()).map(
      ([artworkId, rates]) => ({
        artworkId,
        artworkTitle: titleByArtwork.get(artworkId) ?? "",
        rates,
      })
    )

    return NextResponse.json({ eligible: true, quotes })
  } catch (error) {
    console.error("Error computing shipping quote:", error)
    return NextResponse.json(
      { error: "Erreur lors du calcul des frais de livraison" },
      { status: 500 }
    )
  }
}
