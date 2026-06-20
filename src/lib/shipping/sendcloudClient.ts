// Client Sendcloud — devis (gratuit/sans quota), création et annulation de colis.
//
// ⚠️ Implémentation réelle DIFFÉRÉE (prérequis hors-code, spec §7) : compte Sendcloud à
// créer + clés API + lecture de la doc pour trancher les décisions ouvertes #4 (price-lock)
// et #6 (cancelParcel réel). Tant que c'est non câblé, on lève explicitement plutôt que de
// renvoyer un faux devis — JAMAIS de fallback 0 € (US2.1/US0.2).
//
// Les tests de la couche orchestration (cartShipping.test.ts) mockent ce module : la logique
// au-dessus est donc testable sans compte Sendcloud.

export type AddressInput = {
  street: string
  postalCode: string
  city: string
  country: string
}

// Une offre transporteur renvoyée par le devis.
export type ShippingRate = {
  shippingMethodId: string
  label: string
  priceHTCents: number
}

const NOT_WIRED =
  "Client Sendcloud non câblé (prérequis hors-code, cf. docs/B14-shipping-spec.md §7)"

/**
 * Devis transporteur pour un colis (1 œuvre = 1 colis). Renvoie 0..n offres.
 * Gratuit/sans quota côté Sendcloud — utilisé au checkout pour figer le prix (US2.1).
 */
export async function getShippingRates(_args: {
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
  toAddress: AddressInput
}): Promise<ShippingRate[]> {
  throw new Error(NOT_WIRED)
}

/**
 * Création du colis réel (consomme le quota/coût) — appelée APRÈS confirmation du
 * paiement (webhook, EPIC 3bis), jamais au devis. Idempotence gérée par l'appelant
 * via InvoiceLineItem.shippingParcelId.
 */
export async function createParcel(_args: {
  shippingMethodId: string
  toAddress: AddressInput
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}): Promise<{ parcelId: string }> {
  throw new Error(NOT_WIRED)
}

/**
 * Annulation d'une étiquette réservée (miroir de createParcel) — appelée par refundSale
 * sur remboursement avant expédition, best-effort, pour récupérer le coût (spec §3.E, #6).
 */
export async function cancelParcel(_parcelId: string): Promise<{ cancelled: boolean }> {
  throw new Error(NOT_WIRED)
}
