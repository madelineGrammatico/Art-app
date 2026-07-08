import { describe, it, expect } from "vitest"
import { parseShippingOptions, parseCreatedParcelId } from "./sendcloudClient"

// Fixture calquée sur la vraie réponse v3 `shipping-options` (calculate_quotes: true).
// On vérifie le filtrage MVP home-delivery + le mapping prix → centimes.
const response = {
  data: [
    {
      // Point relais → exclu (pas d'UI de sélection de relais en MVP), même avec prix.
      code: "mondial_relay:service_point,dualapi/size=l,c2c",
      name: "Mondial Relay Point Relais",
      carrier: { code: "mondial_relay" },
      requirements: { is_service_point_required: true },
      quotes: [{ price: { total: { value: "4.39", currency: "EUR" } } }],
    },
    {
      // Transporteur de test gratuit → exclu.
      code: "sendcloud:letter",
      name: "Unstamped letter",
      carrier: { code: "sendcloud" },
      requirements: { is_service_point_required: false },
      quotes: [],
    },
    {
      // Home-delivery avec prix → gardé.
      code: "colissimo:home",
      name: "Colissimo Home",
      carrier: { code: "colissimo" },
      requirements: { is_service_point_required: false },
      quotes: [{ price: { total: { value: "6.50", currency: "EUR" } } }],
    },
    {
      // Home-delivery SANS prix (pas de quote) → exclu (jamais d'offre à 0 €).
      code: "colissimo:home-no-price",
      name: "Colissimo Home (sans tarif)",
      carrier: { code: "colissimo" },
      requirements: { is_service_point_required: false },
      quotes: [],
    },
  ],
}

describe("parseShippingOptions", () => {
  it("ne garde que les offres home-delivery tarifées", () => {
    const rates = parseShippingOptions(response)
    expect(rates).toHaveLength(1)
    expect(rates[0]).toEqual({
      shippingMethodId: "colissimo:home",
      label: "Colissimo Home",
      priceHTCents: 650, // 6.50 € → centimes
    })
  })

  it("exclut les offres point relais (is_service_point_required)", () => {
    const rates = parseShippingOptions(response)
    expect(rates.find((r) => r.shippingMethodId.startsWith("mondial_relay"))).toBeUndefined()
  })

  it("exclut le transporteur de test sendcloud (Unstamped letter)", () => {
    const rates = parseShippingOptions(response)
    expect(rates.find((r) => r.shippingMethodId === "sendcloud:letter")).toBeUndefined()
  })

  it("gère une réponse vide sans casser", () => {
    expect(parseShippingOptions({ data: [] })).toEqual([])
    expect(parseShippingOptions({})).toEqual([])
  })
})

describe("parseCreatedParcelId", () => {
  it("extrait l'id du colis et le convertit en String", () => {
    // L'API renvoie un id numérique (cf. sonde réelle).
    expect(parseCreatedParcelId({ data: { parcels: [{ id: 674993226 }] } })).toBe("674993226")
  })

  it("lève si la réponse n'a pas d'id de colis", () => {
    expect(() => parseCreatedParcelId({ data: { parcels: [] } })).toThrow()
    expect(() => parseCreatedParcelId({})).toThrow()
  })
})
