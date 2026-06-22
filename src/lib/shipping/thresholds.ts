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
