import { describe, it, expect } from "vitest"
import { parseSellerConfig, FRANCHISE_VAT_MENTION } from "./sellerConfig"

// US0.1 — Config vendeur validée (pure, sans DB).

const baseFranchise = {
  SELLER_NAME: "Madeline Grammatico",
  SELLER_LEGAL_FORM: "Entreprise individuelle",
  SELLER_ADDRESS: "1 rue de l'Art, 75001 Paris",
  SELLER_SIRET: "12345678901234",
  SELLER_VAT_REGIME: "FRANCHISE",
}

describe("parseSellerConfig", () => {
  it("accepte une config franchise : taux 0 + mention 293 B", () => {
    const cfg = parseSellerConfig(baseFranchise)
    expect(cfg.vatRegime).toBe("FRANCHISE")
    expect(cfg.vatRate).toBe(0)
    expect(cfg.legalMention).toBe(FRANCHISE_VAT_MENTION)
    expect(cfg.rcs).toBeNull()
    expect(cfg.vatNumber).toBeNull()
  })

  it("accepte une config assujettie 5,5 % : taux 0.055, pas de mention 293 B", () => {
    const cfg = parseSellerConfig({
      ...baseFranchise,
      SELLER_VAT_REGIME: "ASSUJETTIE",
      SELLER_VAT_RATE: "0.055",
      SELLER_VAT_NUMBER: "FR12345678901",
    })
    expect(cfg.vatRegime).toBe("ASSUJETTIE")
    expect(cfg.vatRate).toBeCloseTo(0.055)
    expect(cfg.legalMention).toBeNull()
    expect(cfg.vatNumber).toBe("FR12345678901")
  })

  it("rejette une config sans SELLER_NAME", () => {
    const { SELLER_NAME, ...withoutName } = baseFranchise
    void SELLER_NAME
    expect(() => parseSellerConfig(withoutName)).toThrow()
  })

  it("rejette un SIRET qui ne fait pas 14 chiffres", () => {
    expect(() => parseSellerConfig({ ...baseFranchise, SELLER_SIRET: "123" })).toThrow()
  })

  it("rejette ASSUJETTIE sans taux", () => {
    expect(() =>
      parseSellerConfig({ ...baseFranchise, SELLER_VAT_REGIME: "ASSUJETTIE" })
    ).toThrow()
  })

  it("rejette ASSUJETTIE avec un taux à 0", () => {
    expect(() =>
      parseSellerConfig({
        ...baseFranchise,
        SELLER_VAT_REGIME: "ASSUJETTIE",
        SELLER_VAT_RATE: "0",
      })
    ).toThrow()
  })

  it("rejette FRANCHISE avec un taux positif (incohérent)", () => {
    expect(() =>
      parseSellerConfig({ ...baseFranchise, SELLER_VAT_RATE: "0.2" })
    ).toThrow()
  })

  it("rejette un régime inconnu", () => {
    expect(() =>
      parseSellerConfig({ ...baseFranchise, SELLER_VAT_REGIME: "AUTRE" })
    ).toThrow()
  })
})
