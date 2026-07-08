import { describe, it, expect } from "vitest"
import { parseShippingConfig } from "./shippingConfig"

// US1.1 — Seuils transporteur standard configurables (pas en dur dans le code métier),
// validés au boot via instrumentation.ts (même pattern que sellerConfig). Pur, sans DB.

const base = {
  SHIPPING_MAX_WEIGHT_KG: "25",
  SHIPPING_MAX_DIMENSION_SUM_CM: "150",
}

describe("parseShippingConfig", () => {
  it("accepte une config valide et coerce les seuils en nombres", () => {
    const cfg = parseShippingConfig(base)
    expect(cfg.maxWeightKg).toBe(25)
    expect(cfg.maxDimensionSumCm).toBe(150)
  })

  it("rejette SHIPPING_MAX_WEIGHT_KG manquant", () => {
    const { SHIPPING_MAX_WEIGHT_KG, ...rest } = base
    void SHIPPING_MAX_WEIGHT_KG
    expect(() => parseShippingConfig(rest)).toThrow()
  })

  it("rejette SHIPPING_MAX_DIMENSION_SUM_CM manquant", () => {
    const { SHIPPING_MAX_DIMENSION_SUM_CM, ...rest } = base
    void SHIPPING_MAX_DIMENSION_SUM_CM
    expect(() => parseShippingConfig(rest)).toThrow()
  })

  it("rejette une valeur non numérique", () => {
    expect(() => parseShippingConfig({ ...base, SHIPPING_MAX_WEIGHT_KG: "abc" })).toThrow()
  })

  it("rejette un seuil de poids ≤ 0 (jamais un seuil absurde)", () => {
    expect(() => parseShippingConfig({ ...base, SHIPPING_MAX_WEIGHT_KG: "0" })).toThrow()
    expect(() => parseShippingConfig({ ...base, SHIPPING_MAX_WEIGHT_KG: "-5" })).toThrow()
  })

  it("rejette un seuil de dimensions ≤ 0", () => {
    expect(() => parseShippingConfig({ ...base, SHIPPING_MAX_DIMENSION_SUM_CM: "0" })).toThrow()
  })
})
