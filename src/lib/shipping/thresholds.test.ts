import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"
import { exceedsStandardThresholds, computeRequiresSpecialistCarrier, artworkBlocksDelivery } from "./thresholds"
import type { ShippingConfig } from "./shippingConfig"

// US1.1 — Détection « hors standard » : true si le poids OU la somme des dimensions
// (L+l+h) dépasse strictement les seuils. Seuils de départ = plus restrictif des
// transporteurs standards (Mondial Relay : 25 kg / 150 cm — cf. recherche). Pur.

const config: ShippingConfig = { maxWeightKg: 25, maxDimensionSumCm: 150 }

const dims = (weightKg: number, l: number, w: number, h: number) => ({
  weightKg: new Prisma.Decimal(weightKg),
  lengthCm: new Prisma.Decimal(l),
  widthCm: new Prisma.Decimal(w),
  heightCm: new Prisma.Decimal(h),
})

describe("exceedsStandardThresholds", () => {
  it("œuvre dans les seuils → false (éligible livraison standard)", () => {
    expect(exceedsStandardThresholds(dims(5, 40, 30, 20), config)).toBe(false) // 5 kg, somme 90
  })

  it("poids au-dessus du seuil → true", () => {
    expect(exceedsStandardThresholds(dims(26, 40, 30, 20), config)).toBe(true)
  })

  it("somme des dimensions au-dessus du seuil → true", () => {
    expect(exceedsStandardThresholds(dims(5, 80, 50, 30), config)).toBe(true) // somme 160
  })

  it("exactement au seuil (poids ET dimensions) → false (limite inclusive)", () => {
    expect(exceedsStandardThresholds(dims(25, 60, 50, 40), config)).toBe(false) // 25 kg, somme 150
  })

  it("juste au-dessus du seuil de poids → true", () => {
    expect(exceedsStandardThresholds(dims(25.01, 10, 10, 10), config)).toBe(true)
  })

  it("juste au-dessus du seuil de dimensions → true", () => {
    expect(exceedsStandardThresholds(dims(1, 60, 50, 40.01), config)).toBe(true) // somme 150.01
  })

  it("le dépassement d'un seul critère suffit (dimensions OK mais poids KO)", () => {
    expect(exceedsStandardThresholds(dims(30, 10, 10, 10), config)).toBe(true)
  })
})

describe("computeRequiresSpecialistCarrier", () => {
  it("dimensions complètes hors seuils → true", () => {
    expect(
      computeRequiresSpecialistCarrier({ weightKg: 40, lengthCm: 10, widthCm: 10, heightCm: 10 }, config)
    ).toBe(true)
  })

  it("dimensions complètes dans les seuils → false", () => {
    expect(
      computeRequiresSpecialistCarrier({ weightKg: 5, lengthCm: 40, widthCm: 30, heightCm: 20 }, config)
    ).toBe(false)
  })

  it("une dimension manquante → false (donnée incomplète, on ne conclut pas)", () => {
    expect(
      computeRequiresSpecialistCarrier({ weightKg: 40, lengthCm: null, widthCm: 10, heightCm: 10 }, config)
    ).toBe(false)
  })

  it("accepte des Decimal aussi bien que des nombres", () => {
    expect(
      computeRequiresSpecialistCarrier(
        {
          weightKg: new Prisma.Decimal(40),
          lengthCm: new Prisma.Decimal(10),
          widthCm: new Prisma.Decimal(10),
          heightCm: new Prisma.Decimal(10),
        },
        config
      )
    ).toBe(true)
  })
})

describe("artworkBlocksDelivery", () => {
  // Dimensions du COLIS (celles qui comptent) dans les seuils.
  const pkg = (weightKg: number, l: number, w: number, h: number) => ({
    packageWeightKg: new Prisma.Decimal(weightKg),
    packageLengthCm: new Prisma.Decimal(l),
    packageWidthCm: new Prisma.Decimal(w),
    packageHeightCm: new Prisma.Decimal(h),
  })
  const complete = pkg(5, 40, 30, 20)

  it("dimensions colis complètes, rien de coché → false (livraison possible)", () => {
    expect(
      artworkBlocksDelivery({ pickupOnly: false, requiresSpecialistCarrier: false, ...complete })
    ).toBe(false)
  })

  it("pickupOnly coché manuellement → true, même dans les seuils", () => {
    expect(
      artworkBlocksDelivery({ pickupOnly: true, requiresSpecialistCarrier: false, ...complete })
    ).toBe(true)
  })

  it("requiresSpecialistCarrier (hors seuils auto-détecté) → true", () => {
    expect(
      artworkBlocksDelivery({ pickupOnly: false, requiresSpecialistCarrier: true, ...complete })
    ).toBe(true)
  })

  it("une dimension colis manquante → true (jamais de devis possible, cf. US0.2)", () => {
    expect(
      artworkBlocksDelivery({
        pickupOnly: false,
        requiresSpecialistCarrier: false,
        packageWeightKg: null,
        packageLengthCm: complete.packageLengthCm,
        packageWidthCm: complete.packageWidthCm,
        packageHeightCm: complete.packageHeightCm,
      })
    ).toBe(true)
  })
})
