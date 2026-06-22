import { z } from "zod"

// Config Sendcloud : clés API + adresse expéditeur (origine des colis). Validée au boot
// (instrumentation.ts) pour échouer tôt si incomplète, plutôt qu'au premier devis/colis.
// Même pattern que sellerConfig/shippingConfig. Non requise en test (Sendcloud mocké).
export type SendcloudConfig = {
  publicKey: string
  secretKey: string
  from: {
    name: string
    addressLine1: string
    houseNumber: string | null
    postalCode: string
    city: string
    countryCode: string
  }
}

const schema = z.object({
  SENDCLOUD_PUBLIC_KEY: z.string().min(1, "SENDCLOUD_PUBLIC_KEY manquant"),
  SENDCLOUD_SECRET_KEY: z.string().min(1, "SENDCLOUD_SECRET_KEY manquant"),
  SENDCLOUD_FROM_NAME: z.string().min(1, "SENDCLOUD_FROM_NAME manquant"),
  SENDCLOUD_FROM_ADDRESS_LINE_1: z.string().min(1, "SENDCLOUD_FROM_ADDRESS_LINE_1 manquant"),
  SENDCLOUD_FROM_HOUSE_NUMBER: z.string().min(1).optional(),
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
      name: parsed.SENDCLOUD_FROM_NAME,
      addressLine1: parsed.SENDCLOUD_FROM_ADDRESS_LINE_1,
      houseNumber: parsed.SENDCLOUD_FROM_HOUSE_NUMBER ?? null,
      postalCode: parsed.SENDCLOUD_FROM_POSTAL_CODE,
      city: parsed.SENDCLOUD_FROM_CITY,
      countryCode: parsed.SENDCLOUD_FROM_COUNTRY.toUpperCase(),
    },
  }
}

let cached: SendcloudConfig | null = null

/** Config Sendcloud du process (mémoïsée). Appeler tôt (boot) pour fail-fast. */
export function getSendcloudConfig(): SendcloudConfig {
  if (!cached) cached = parseSendcloudConfig(process.env)
  return cached
}
