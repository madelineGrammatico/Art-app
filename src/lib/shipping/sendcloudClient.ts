// Client Sendcloud — câblé sur l'API réelle :
//  - devis  : v3 `shipping-options` (POST, `calculate_quotes: true`) — gratuit/sans quota ;
//  - colis  : v3 `shipments/announce-with-shipping-rules` (POST) — génère l'étiquette ;
//  - annul. : v2 `parcels/{id}/cancel` (POST) — best-effort (spec §3.E, décisions #4/#6).
// Clés + adresse expéditeur via getSendcloudConfig (validé au boot). SHIPPING_TEST_MODE
// force l'option gratuite `sendcloud:letter` (validation sans facturation).
//
// Les tests d'orchestration (cartShipping.test.ts) mockent ce module ; les parties de
// parsing pures sont testées à part (parseShippingOptions, parseCreatedParcelId).

import { getSendcloudConfig } from "./sendcloudConfig"

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

const SENDCLOUD_BASE = "https://panel.sendcloud.sc/api"

function authHeader(): string {
  const { publicKey, secretKey } = getSendcloudConfig()
  return "Basic " + Buffer.from(`${publicKey}:${secretKey}`).toString("base64")
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
  const from = getSendcloudConfig().from
  const res = await fetch(`${SENDCLOUD_BASE}/v3/shipping-options`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      calculate_quotes: true,
      from_address: {
        country_code: from.countryCode,
        postal_code: from.postalCode,
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

// Adresse expéditeur (origine des colis) au format Sendcloud, depuis la config validée.
function senderAddressPayload() {
  const from = getSendcloudConfig().from
  return {
    name: from.name,
    address_line_1: from.addressLine1,
    house_number: from.houseNumber ?? undefined,
    postal_code: from.postalCode,
    city: from.city,
    country_code: from.countryCode,
  }
}

type CreatedShipmentResponse = {
  data?: { parcels?: { id?: number | string }[] }
}

/** Extrait l'id de colis de la réponse v3 « announce ». Pur → testable sans réseau. */
export function parseCreatedParcelId(json: CreatedShipmentResponse): string {
  const id = json?.data?.parcels?.[0]?.id
  if (id === undefined || id === null || id === "") {
    throw new Error("Réponse Sendcloud sans id de colis")
  }
  return String(id) // l'API renvoie un nombre ; on stocke en String (shippingParcelId)
}

/**
 * Création + annonce du colis réel (génère l'étiquette = le coût) — appelée APRÈS
 * paiement (webhook, EPIC 3bis), jamais au devis. Réutilise le `shipping_option_code`
 * gelé. SHIPPING_TEST_MODE=true force l'option gratuite `sendcloud:letter` (validation
 * du pipeline sans facturation).
 */
export async function createParcel(args: {
  shippingMethodId: string
  toName: string
  toAddress: AddressInput
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}): Promise<{ parcelId: string }> {
  const testMode = process.env.SHIPPING_TEST_MODE === "true"
  const shippingOptionCode = testMode ? "sendcloud:letter" : args.shippingMethodId

  const res = await fetch(`${SENDCLOUD_BASE}/v3/shipments/announce-with-shipping-rules`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      from_address: senderAddressPayload(),
      to_address: {
        name: args.toName,
        address_line_1: args.toAddress.street,
        postal_code: args.toAddress.postalCode,
        city: args.toAddress.city,
        country_code: toCountryCode(args.toAddress.country),
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
      ship_with: {
        type: "shipping_option_code",
        properties: { shipping_option_code: shippingOptionCode },
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Sendcloud announce ${res.status}: ${body.slice(0, 300)}`)
  }

  return { parcelId: parseCreatedParcelId(await res.json()) }
}

/**
 * Annulation d'une étiquette réservée — appelée par refundSale sur remboursement avant
 * expédition, best-effort, pour récupérer le coût (spec §3.E, #6). 200 = annulé,
 * 202 = annulation asynchrone acceptée ; tout autre code lève (le best-effort amont gère).
 */
export async function cancelParcel(parcelId: string): Promise<{ cancelled: boolean }> {
  const res = await fetch(`${SENDCLOUD_BASE}/v2/parcels/${parcelId}/cancel`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
  })
  if (res.status === 200 || res.status === 202) return { cancelled: true }
  const body = await res.text().catch(() => "")
  throw new Error(`Sendcloud cancel ${res.status}: ${body.slice(0, 300)}`)
}
