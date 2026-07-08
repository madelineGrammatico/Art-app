import { describe, it, expect } from "vitest"
import { selectPreferredRate } from "./selectRate"
import type { ShippingRate } from "./sendcloudClient"

const rate = (shippingMethodId: string, priceHTCents: number): ShippingRate => ({
  shippingMethodId,
  label: shippingMethodId,
  priceHTCents,
})

describe("selectPreferredRate", () => {
  it("privilégie l'offre signature même si plus chère", () => {
    const chosen = selectPreferredRate([
      rate("mondial_relay:home_domestic,dualapi/c2c", 603),
      rate("colissimo:home/fr", 1070),
      rate("colissimo:home/signature,fr", 1189),
    ])
    expect(chosen?.shippingMethodId).toBe("colissimo:home/signature,fr")
  })

  it("retombe sur colissimo home si pas de signature", () => {
    const chosen = selectPreferredRate([
      rate("mondial_relay:home_domestic,dualapi/c2c", 603),
      rate("colissimo:home/fr", 1070),
    ])
    expect(chosen?.shippingMethodId).toBe("colissimo:home/fr")
  })

  it("repli sur la moins chère si aucune offre préférée", () => {
    const chosen = selectPreferredRate([rate("sc_1", 990), rate("sc_2", 590)])
    expect(chosen?.shippingMethodId).toBe("sc_2")
  })

  it("respecte une liste de préférence personnalisée", () => {
    const chosen = selectPreferredRate(
      [rate("mondial_relay:home_domestic,dualapi/c2c", 603), rate("colissimo:home/fr", 1070)],
      ["mondial_relay:home"]
    )
    expect(chosen?.shippingMethodId).toBe("mondial_relay:home_domestic,dualapi/c2c")
  })

  it("renvoie undefined sur une liste vide", () => {
    expect(selectPreferredRate([])).toBeUndefined()
  })
})
