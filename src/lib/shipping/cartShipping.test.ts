import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

// EPIC 1bis/2 — Orchestration des devis au checkout. Le client Sendcloud et la config
// de seuils sont mockés (la logique de seuil pure est testée dans thresholds.test.ts) ;
// ici on vérifie l'orchestration : éligibilité, devis par œuvre, et les garanties
// « jamais de calcul à 0 € » (US0.2 données manquantes, US2.1 échec transporteur).
vi.mock("./sendcloudClient", () => ({
  getShippingRates: vi.fn(),
  createParcel: vi.fn(),
}))
vi.mock("./shippingConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shippingConfig")>()
  return { ...actual, getShippingConfig: vi.fn() }
})

import { computeCartShipping } from "./cartShipping"
import { getShippingRates } from "./sendcloudClient"
import { getShippingConfig } from "./shippingConfig"

const mockedRates = vi.mocked(getShippingRates)
const mockedConfig = vi.mocked(getShippingConfig)

const TO_ADDRESS = { street: "10 av Foch", postalCode: "75116", city: "Paris", country: "France" }

// Item du panier ; valeurs par défaut dans les seuils (5 kg, somme 90 cm). Passer
// `null` sur un champ simule une donnée physique manquante (US0.2).
const item = (
  artworkId: string,
  opts: {
    weightKg?: number | null
    l?: number | null
    w?: number | null
    h?: number | null
    pickupOnly?: boolean
  } = {}
) => ({
  artworkId,
  pickupOnly: opts.pickupOnly ?? false,
  weightKg: opts.weightKg === null ? null : new Prisma.Decimal(opts.weightKg ?? 5),
  lengthCm: opts.l === null ? null : new Prisma.Decimal(opts.l ?? 40),
  widthCm: opts.w === null ? null : new Prisma.Decimal(opts.w ?? 30),
  heightCm: opts.h === null ? null : new Prisma.Decimal(opts.h ?? 20),
})

beforeEach(() => {
  mockedConfig.mockReset()
  mockedConfig.mockReturnValue({ maxWeightKg: 25, maxDimensionSumCm: 150 })
  mockedRates.mockReset()
  mockedRates.mockResolvedValue([
    { shippingMethodId: "sc_1", label: "Colissimo Domicile", priceHTCents: 990 },
  ])
})

describe("computeCartShipping", () => {
  it("panier dans les seuils : eligible, un devis par œuvre (1 œuvre = 1 colis)", async () => {
    const res = await computeCartShipping({
      items: [item("a1"), item("a2")],
      toAddress: TO_ADDRESS,
    })

    expect(res.eligible).toBe(true)
    if (!res.eligible) throw new Error("attendu : eligible")
    expect(res.quotesByArtwork.size).toBe(2)
    expect(res.quotesByArtwork.get("a1")).toHaveLength(1)
    expect(res.quotesByArtwork.get("a2")).toHaveLength(1)
    expect(mockedRates).toHaveBeenCalledTimes(2)
  })

  it("plusieurs offres pour une œuvre : toutes renvoyées pour sélection (US2.4)", async () => {
    mockedRates.mockResolvedValue([
      { shippingMethodId: "sc_1", label: "Colissimo", priceHTCents: 990 },
      { shippingMethodId: "sc_2", label: "Mondial Relay", priceHTCents: 590 },
    ])

    const res = await computeCartShipping({ items: [item("a1")], toAddress: TO_ADDRESS })

    if (!res.eligible) throw new Error("attendu : eligible")
    expect(res.quotesByArtwork.get("a1")).toHaveLength(2)
  })

  it("interroge le transporteur avec poids, dimensions et adresse de livraison (US2.1)", async () => {
    await computeCartShipping({
      items: [item("a1", { weightKg: 8, l: 50, w: 40, h: 10 })],
      toAddress: TO_ADDRESS,
    })

    expect(mockedRates).toHaveBeenCalledWith(
      expect.objectContaining({
        weightKg: 8,
        lengthCm: 50,
        widthCm: 40,
        heightCm: 10,
        toAddress: TO_ADDRESS,
      })
    )
  })

  it("œuvre hors seuils : eligible=false, aucun appel transporteur (US1bis.2)", async () => {
    const res = await computeCartShipping({
      items: [item("big", { weightKg: 40 })],
      toAddress: TO_ADDRESS,
    })

    expect(res.eligible).toBe(false)
    if (res.eligible) throw new Error("attendu : non eligible")
    expect(res.blockingArtworkIds).toContain("big")
    expect(mockedRates).not.toHaveBeenCalled()
  })

  it("panier mixte (1 standard + 1 hors seuils) : bascule toute la commande, pas de devis", async () => {
    const res = await computeCartShipping({
      items: [item("std"), item("big", { l: 200, w: 100, h: 50 })],
      toAddress: TO_ADDRESS,
    })

    expect(res.eligible).toBe(false)
    if (res.eligible) throw new Error("attendu : non eligible")
    expect(res.blockingArtworkIds).toEqual(["big"])
    // Décision : choix livraison/retrait au niveau commande → aucun devis même pour l'œuvre standard.
    expect(mockedRates).not.toHaveBeenCalled()
  })

  it("pickupOnly coché : non éligible même dans les seuils, aucun appel transporteur", async () => {
    const res = await computeCartShipping({
      items: [item("forced", { pickupOnly: true })],
      toAddress: TO_ADDRESS,
    })

    expect(res.eligible).toBe(false)
    if (res.eligible) throw new Error("attendu : non eligible")
    expect(res.blockingArtworkIds).toEqual(["forced"])
    expect(mockedRates).not.toHaveBeenCalled()
  })

  it("œuvre sans poids/dimensions : rejette explicitement, jamais un calcul à 0 € (US0.2)", async () => {
    await expect(
      computeCartShipping({ items: [item("a1", { weightKg: null })], toAddress: TO_ADDRESS })
    ).rejects.toThrow()
    expect(mockedRates).not.toHaveBeenCalled()
  })

  it("échec/timeout du devis transporteur : propage l'erreur, pas de fallback 0 € (US2.1)", async () => {
    mockedRates.mockRejectedValue(new Error("Sendcloud timeout"))

    await expect(
      computeCartShipping({ items: [item("a1")], toAddress: TO_ADDRESS })
    ).rejects.toThrow()
  })
})
