import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"
import { exceedsStandardThresholds } from "./thresholds"
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
