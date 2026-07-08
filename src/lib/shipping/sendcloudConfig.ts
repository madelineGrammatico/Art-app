import { z } from "zod"

// Config Sendcloud : clés API + adresse expéditeur (origine des colis). Validée au boot
// (instrumentation.ts) pour échouer tôt si incomplète, plutôt qu'au premier devis/colis.
// Même pattern que sellerConfig/shippingConfig. Non requise en test (Sendcloud mocké).
export type SendcloudConfig = {
  publicKey: string
  secretKey: string
  from: {
    // Pas de nom ici : le nom d'expéditeur = SELLER_NAME (source unique, cf. sendcloudClient).
    // Numéro de voie inclus dans addressLine1 (comme les adresses client, texte libre).
    addressLine1: string
    postalCode: string
    city: string
    countryCode: string
  }
}

const schema = z.object({
  SENDCLOUD_PUBLIC_KEY: z.string().min(1, "SENDCLOUD_PUBLIC_KEY manquant"),
  SENDCLOUD_SECRET_KEY: z.string().min(1, "SENDCLOUD_SECRET_KEY manquant"),
  SENDCLOUD_FROM_ADDRESS_LINE_1: z.string().min(1, "SENDCLOUD_FROM_ADDRESS_LINE_1 manquant"),
  SENDCLOUD_FROM_POSTAL_CODE: z.string().min(1, "SENDCLOUD_FROM_POSTAL_CODE manquant"),
  SENDCLOUD_FROM_CITY: z.string().min(1, "SENDCLOUD_FROM_CITY manquant"),
  SENDCLOUD_FROM_COUNTRY: z
    .string()
    .regex(/^[A-Za-z]{2}$/, "SENDCLOUD_FROM_COUNTRY doit être un code ISO alpha-2 (ex. FR)"),
})

/** Parse + valide la config Sendcloud. Lève (ZodError) si incomplète. Pure → testable. */
export function parseSendcloudConfig(env: Record<string, string | undefined>): SendcloudConfig {
  const parsed = schema.parse(env)
  return {
    publicKey: parsed.SENDCLOUD_PUBLIC_KEY,
    secretKey: parsed.SENDCLOUD_SECRET_KEY,
    from: {
      addressLine1: parsed.SENDCLOUD_FROM_ADDRESS_LINE_1,
      postalCode: parsed.SENDCLOUD_FROM_POSTAL_CODE,
      city: parsed.SENDCLOUD_FROM_CITY,
      countryCode: parsed.SENDCLOUD_FROM_COUNTRY.toUpperCase(),
    },
  }
}

let cached: SendcloudConfig | null = null

/** Config Sendcloud du process (mémoïsée). Appeler tôt (boot) pour fail-fast. */
export function getSendcloudConfig(): SendcloudConfig {
  if (!cached) {
    try {
      cached = parseSendcloudConfig(process.env)
    } catch (err) {
      // Rethrow en Error simple : le message de ZodError est un getter en lecture seule,
      // que Next tente de réécrire au boot → TypeError cryptique qui masque la vraie cause.
      if (err instanceof z.ZodError) {
        throw new Error(
          "Configuration Sendcloud invalide : " +
            err.issues.map((i) => `${i.path.join(".") || "?"} (${i.message})`).join(" ; ")
        )
      }
      throw err
    }
  }
  return cached
}
