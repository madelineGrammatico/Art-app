import type { ShippingRate } from "./sendcloudClient"

// Défaut curé (B14, décision produit) : quand plusieurs offres home-delivery existent,
// on privilégie une option fiable avec suivi + signature (œuvres fragiles/de valeur),
// sans faire choisir l'acheteur. Liste ordonnée de préférence, par préfixe de
// shipping_option_code Sendcloud. Surchargeable sans redéploiement via env (cf. route).
export const DEFAULT_PREFERRED_OPTION_CODES = [
  "colissimo:home/signature",
  "colissimo:home",
]

/**
 * Choisit une offre parmi celles disponibles selon l'ordre de préférence (match exact
 * ou par préfixe de code). Si aucune offre préférée ne correspond, **repli sur la moins
 * chère** pour ne jamais bloquer la vente. `undefined` seulement si la liste est vide.
 */
export function selectPreferredRate(
  rates: ShippingRate[],
  preferredCodes: string[] = DEFAULT_PREFERRED_OPTION_CODES
): ShippingRate | undefined {
  if (rates.length === 0) return undefined
  for (const code of preferredCodes) {
    const match = rates.find(
      (r) => r.shippingMethodId === code || r.shippingMethodId.startsWith(code)
    )
    if (match) return match
  }
  return rates.reduce((min, r) => (r.priceHTCents < min.priceHTCents ? r : min))
}
