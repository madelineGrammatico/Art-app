// Client Sendcloud — devis (gratuit/sans quota), création et annulation de colis.
//
// Devis (`getShippingRates`) : CÂBLÉ sur l'API v3 « shipping options » (POST, avec
// `calculate_quotes: true`). Création/annulation : DIFFÉRÉES (stub `NOT_WIRED`) — à câbler
// sur v3 shipments (createParcel, pour réutiliser le `shipping_option_code`) et v2
// `/parcels/{id}/cancel` (cancelParcel). Décisions #4/#6 tranchées (cf. spec §3.E / table).
//
// Les tests d'orchestration (cartShipping.test.ts) mockent ce module ; la logique de
// parsing des offres est isolée et testée à part (parseShippingOptions, pur).

export type AddressInput = {
  street: string
  postalCode: string
  city: string
  country: string
}

// Une offre transporteur renvoyée par le devis.
export type ShippingRate = {
  shippingMethodId: string // = shipping_option_code Sendcloud (ex. "colissimo:home")
  label: string
  priceHTCents: number
}

const NOT_WIRED =
  "Client Sendcloud non câblé (cf. docs/B14-shipping-spec.md §7)"

const SENDCLOUD_BASE = "https://panel.sendcloud.sc/api"

function authHeader(): string {
  const pub = process.env.SENDCLOUD_PUBLIC_KEY
  const secret = process.env.SENDCLOUD_SECRET_KEY
  if (!pub || !secret) {
    throw new Error("SENDCLOUD_PUBLIC_KEY / SENDCLOUD_SECRET_KEY manquants")
  }
  return "Basic " + Buffer.from(`${pub}:${secret}`).toString("base64")
}

// Sendcloud attend un code pays ISO 3166-1 alpha-2 ; nos adresses stockent le pays en
// clair (ex. "France"). Mapping minimal (lancement FR) — lève sur pays inconnu plutôt
// que d'envoyer une valeur fausse au transporteur.
const COUNTRY_TO_ISO: Record<string, string> = {
  france: "FR",
  belgique: "BE",
  belgium: "BE",
  luxembourg: "LU",
  suisse: "CH",
  allemagne: "DE",
  espagne: "ES",
  italie: "IT",
}

function toCountryCode(country: string): string {
  const trimmed = country.trim()
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase()
  const iso = COUNTRY_TO_ISO[trimmed.toLowerCase()]
  if (!iso) {
    throw new Error(`Pays non géré pour la livraison : "${country}"`)
  }
  return iso
}

// --- Parsing pur de la réponse v3 shipping-options ---

type SendcloudQuote = {
  price?: { total?: { value?: string; currency?: string } }
}
type SendcloudOption = {
  code?: string
  name?: string
  carrier?: { code?: string }
  requirements?: { is_service_point_required?: boolean }
  quotes?: SendcloudQuote[]
}

/**
 * Transforme la réponse v3 `shipping-options` en offres exploitables. Filtrage MVP
 * **home-delivery only** :
 *  - exclut les offres exigeant un point relais (`is_service_point_required`) — pas d'UI
 *    de sélection de relais au lancement ;
 *  - exclut le transporteur de test `sendcloud` (« Unstamped letter ») ;
 *  - ne garde que les offres avec un prix (`quotes[0].price.total`) — jamais d'offre à 0 €.
 */
export function parseShippingOptions(data: { data?: SendcloudOption[] }): ShippingRate[] {
  const options = data?.data ?? []
  const rates: ShippingRate[] = []
  for (const opt of options) {
    if (opt.requirements?.is_service_point_required) continue
    if (opt.carrier?.code === "sendcloud") continue
    const total = opt.quotes?.[0]?.price?.total
    if (!opt.code || !total?.value) continue
    const cents = Math.round(Number(total.value) * 100)
    if (!Number.isFinite(cents) || cents <= 0) continue
    rates.push({
      shippingMethodId: opt.code,
      label: opt.name ?? opt.code,
      priceHTCents: cents,
    })
  }
  return rates
}

/**
 * Devis transporteur pour un colis (1 œuvre = 1 colis). Renvoie 0..n offres
 * home-delivery avec prix. Gratuit/sans quota côté Sendcloud (US2.1).
 */
export async function getShippingRates(args: {
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
  toAddress: AddressInput
}): Promise<ShippingRate[]> {
  const res = await fetch(`${SENDCLOUD_BASE}/v3/shipping-options`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      calculate_quotes: true,
      from_address: {
        country_code: process.env.SENDCLOUD_FROM_COUNTRY || "FR",
        postal_code: process.env.SENDCLOUD_FROM_POSTAL_CODE || undefined,
      },
      to_address: {
        country_code: toCountryCode(args.toAddress.country),
        postal_code: args.toAddress.postalCode,
        city: args.toAddress.city,
        address_line_1: args.toAddress.street,
      },
      parcels: [
        {
          weight: { value: String(args.weightKg), unit: "kg" },
          dimensions: {
            length: String(args.lengthCm),
            width: String(args.widthCm),
            height: String(args.heightCm),
            unit: "cm",
          },
        },
      ],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Sendcloud shipping-options ${res.status}: ${body.slice(0, 300)}`)
  }

  return parseShippingOptions(await res.json())
}

/**
 * Création du colis réel (consomme le quota/coût) — appelée APRÈS confirmation du
 * paiement (webhook, EPIC 3bis), jamais au devis. À câbler sur l'API v3 shipments
 * (réutilise le `shipping_option_code` gelé) + SHIPPING_TEST_MODE.
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
 * À câbler sur v2 `POST /parcels/{id}/cancel`.
 */
export async function cancelParcel(_parcelId: string): Promise<{ cancelled: boolean }> {
  throw new Error(NOT_WIRED)
}
