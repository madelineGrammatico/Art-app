import type { Prisma } from "@prisma/client"
import { getShippingConfig } from "./shippingConfig"
import { exceedsStandardThresholds } from "./thresholds"
import { getShippingRates, type AddressInput, type ShippingRate } from "./sendcloudClient"

// Item de panier pour le devis — dimensions nullable (donnée physique potentiellement
// absente, gérée explicitement, US0.2).
export type CartShippingItem = {
  artworkId: string
  weightKg: Prisma.Decimal | null
  lengthCm: Prisma.Decimal | null
  widthCm: Prisma.Decimal | null
  heightCm: Prisma.Decimal | null
}

export type CartShippingResult =
  | { eligible: true; quotesByArtwork: Map<string, ShippingRate[]> }
  | { eligible: false; blockingArtworkIds: string[] } // hors seuils → DELIVERY indisponible (US1bis.2)

/**
 * Orchestration des devis au checkout (EPIC 1bis/2). Pour chaque œuvre du panier :
 *  1. dimensions manquantes → lève (US0.2, jamais un calcul à 0 €) ;
 *  2. si au moins une œuvre dépasse les seuils standard → toute la commande bascule en
 *     retrait (eligible=false), AUCUN devis transporteur n'est demandé (US1bis.2 — choix
 *     livraison/retrait au niveau commande, pas par œuvre) ;
 *  3. sinon, devis Sendcloud en parallèle (1 colis = 1 œuvre) ; un échec/timeout propage
 *     l'erreur, jamais de fallback 0 € (US2.1).
 */
export async function computeCartShipping(args: {
  items: CartShippingItem[]
  toAddress: AddressInput
}): Promise<CartShippingResult> {
  const config = getShippingConfig()

  // 1. Validation « donnée physique présente » sur tout le panier avant tout appel réseau.
  for (const item of args.items) {
    if (
      item.weightKg === null ||
      item.lengthCm === null ||
      item.widthCm === null ||
      item.heightCm === null
    ) {
      throw new Error(
        `Poids/dimensions manquants pour l'œuvre ${item.artworkId} : devis transporteur impossible.`
      )
    }
  }

  // 2. Éligibilité livraison standard — calcul live (le flag stocké peut être stale, spec §2).
  const blockingArtworkIds = args.items
    .filter((item) =>
      exceedsStandardThresholds(
        {
          weightKg: item.weightKg!,
          lengthCm: item.lengthCm!,
          widthCm: item.widthCm!,
          heightCm: item.heightCm!,
        },
        config
      )
    )
    .map((item) => item.artworkId)

  if (blockingArtworkIds.length > 0) {
    return { eligible: false, blockingArtworkIds }
  }

  // 3. Devis par œuvre en parallèle ; toute erreur remonte (pas de fallback 0 €).
  const quotes = await Promise.all(
    args.items.map(async (item) => {
      const rates = await getShippingRates({
        weightKg: item.weightKg!.toNumber(),
        lengthCm: item.lengthCm!.toNumber(),
        widthCm: item.widthCm!.toNumber(),
        heightCm: item.heightCm!.toNumber(),
        toAddress: args.toAddress,
      })
      return [item.artworkId, rates] as const
    })
  )

  return { eligible: true, quotesByArtwork: new Map(quotes) }
}
