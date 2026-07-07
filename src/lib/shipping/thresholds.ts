import { Prisma } from "@prisma/client"
import type { ShippingConfig } from "./shippingConfig"

// Dimensions physiques d'une œuvre — non-null requis (la validation « donnée manquante »
// est faite en amont par computeCartShipping, US0.2).
export type ArtworkDimensions = {
  weightKg: Prisma.Decimal
  lengthCm: Prisma.Decimal
  widthCm: Prisma.Decimal
  heightCm: Prisma.Decimal
}

/**
 * Vrai si l'œuvre dépasse **strictement** au moins un seuil standard (poids OU somme
 * L+l+h). Limite inclusive : exactement au seuil → false (US1.1). Un seul critère
 * dépassé suffit. Décimal-safe (pas de conversion Number, on compare en Decimal).
 */
export function exceedsStandardThresholds(
  artwork: ArtworkDimensions,
  config: ShippingConfig
): boolean {
  const dimensionSum = artwork.lengthCm.plus(artwork.widthCm).plus(artwork.heightCm)
  return (
    artwork.weightKg.greaterThan(config.maxWeightKg) ||
    dimensionSum.greaterThan(config.maxDimensionSumCm)
  )
}

type MaybeDimension = Prisma.Decimal | number | string | null | undefined

/**
 * Recalcule le flag `Artwork.requiresSpecialistCarrier` (US0.1), appelé à chaque
 * create/update admin. Si une dimension manque (donnée physique incomplète) → false :
 * on ne peut pas conclure « hors standard » sans mesures complètes, et le flag ne sert
 * qu'à l'affichage admin (la décision argent se fait en live au checkout, spec §2).
 */
export function computeRequiresSpecialistCarrier(
  dims: {
    weightKg: MaybeDimension
    lengthCm: MaybeDimension
    widthCm: MaybeDimension
    heightCm: MaybeDimension
  },
  config: ShippingConfig
): boolean {
  const { weightKg, lengthCm, widthCm, heightCm } = dims
  if (
    weightKg === null ||
    weightKg === undefined ||
    lengthCm === null ||
    lengthCm === undefined ||
    widthCm === null ||
    widthCm === undefined ||
    heightCm === null ||
    heightCm === undefined
  ) {
    return false
  }
  return exceedsStandardThresholds(
    {
      weightKg: new Prisma.Decimal(weightKg),
      lengthCm: new Prisma.Decimal(lengthCm),
      widthCm: new Prisma.Decimal(widthCm),
      heightCm: new Prisma.Decimal(heightCm),
    },
    config
  )
}

/**
 * Règle unique « cette œuvre bloque la livraison » (retrait sur place obligatoire),
 * utilisée à la fois par l'UX checkout (US1bis.2) et la garde serveur (cartShipping) :
 * override manuel admin, hors-gabarit auto-détecté, ou dimensions de COLIS incomplètes
 * (sans elles, aucun devis transporteur possible, US0.2 — les dimensions descriptives
 * de l'œuvre, elles, n'entrent jamais en compte).
 */
export function artworkBlocksDelivery(artwork: {
  pickupOnly: boolean
  requiresSpecialistCarrier: boolean
  packageWeightKg: MaybeDimension
  packageLengthCm: MaybeDimension
  packageWidthCm: MaybeDimension
  packageHeightCm: MaybeDimension
}): boolean {
  return (
    artwork.pickupOnly ||
    artwork.requiresSpecialistCarrier ||
    artwork.packageWeightKg === null ||
    artwork.packageWeightKg === undefined ||
    artwork.packageLengthCm === null ||
    artwork.packageLengthCm === undefined ||
    artwork.packageWidthCm === null ||
    artwork.packageWidthCm === undefined ||
    artwork.packageHeightCm === null ||
    artwork.packageHeightCm === undefined
  )
}
