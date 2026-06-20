import type { Prisma } from "@prisma/client"
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
