import type { Prisma } from "@prisma/client"
import { getShippingConfig } from "./shippingConfig"
import { exceedsStandardThresholds } from "./thresholds"
import { getShippingRates, type AddressInput, type ShippingRate } from "./sendcloudClient"

// Item de panier pour le devis — dimensions du COLIS (celles qui pilotent le devis et
// les seuils), nullable (donnée physique potentiellement absente, gérée explicitement,
// US0.2). Les dimensions descriptives de l'œuvre n'entrent jamais dans le calcul.
export type CartShippingItem = {
  artworkId: string
  pickupOnly: boolean
  packageWeightKg: Prisma.Decimal | null
  packageLengthCm: Prisma.Decimal | null
  packageWidthCm: Prisma.Decimal | null
  packageHeightCm: Prisma.Decimal | null
}

export type CartShippingResult =
  | { eligible: true; quotesByArtwork: Map<string, ShippingRate[]> }
  | { eligible: false; blockingArtworkIds: string[] } // hors seuils → DELIVERY indisponible (US1bis.2)

/**
 * Orchestration des devis au checkout (EPIC 1bis/2). Pour chaque œuvre du panier :
 *  1. dimensions manquantes → lève (US0.2, jamais un calcul à 0 €) ;
 *  2. si au moins une œuvre dépasse les seuils standard OU est marquée pickupOnly (override
 *     manuel admin, indépendant des dimensions) → toute la commande bascule en retrait
 *     (eligible=false), AUCUN devis transporteur n'est demandé (US1bis.2 — choix
 *     livraison/retrait au niveau commande, pas par œuvre) ;
 *  3. sinon, devis Sendcloud en parallèle (1 colis = 1 œuvre) ; un échec/timeout propage
 *     l'erreur, jamais de fallback 0 € (US2.1).
 */
export async function computeCartShipping(args: {
  items: CartShippingItem[]
  toAddress: AddressInput
}): Promise<CartShippingResult> {
  const config = getShippingConfig()

  // 1. Validation « donnée colis présente » sur tout le panier avant tout appel réseau.
  for (const item of args.items) {
    if (
      item.packageWeightKg === null ||
      item.packageLengthCm === null ||
      item.packageWidthCm === null ||
      item.packageHeightCm === null
    ) {
      throw new Error(
        `Dimensions du colis manquantes pour l'œuvre ${item.artworkId} : devis transporteur impossible.`
      )
    }
  }

  // 2. Éligibilité livraison standard — calcul live (le flag stocké peut être stale, spec §2),
  //    plus l'override manuel pickupOnly (jamais recalculé, donc jamais stale par nature).
  const blockingArtworkIds = args.items
    .filter(
      (item) =>
        item.pickupOnly ||
        exceedsStandardThresholds(
          {
            weightKg: item.packageWeightKg!,
            lengthCm: item.packageLengthCm!,
            widthCm: item.packageWidthCm!,
            heightCm: item.packageHeightCm!,
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
        weightKg: item.packageWeightKg!.toNumber(),
        lengthCm: item.packageLengthCm!.toNumber(),
        widthCm: item.packageWidthCm!.toNumber(),
        heightCm: item.packageHeightCm!.toNumber(),
        toAddress: args.toAddress,
      })
      return [item.artworkId, rates] as const
    })
  )

  // Une œuvre sans aucune offre home-delivery (toutes filtrées : point-relais, sans prix ;
  // ou destination hors grille) → livraison impossible pour la commande, on bascule en
  // retrait comme pour un hors-gabarit (jamais un panier bloqué sans explication, US1bis.2).
  const unquoted = quotes.filter(([, rates]) => rates.length === 0).map(([id]) => id)
  if (unquoted.length > 0) {
    return { eligible: false, blockingArtworkIds: unquoted }
  }

  return { eligible: true, quotesByArtwork: new Map(quotes) }
}
