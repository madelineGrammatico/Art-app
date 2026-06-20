import { z } from "zod"

// Seuils du/des transporteur(s) standard, configurables sans redéploiement (US1.1).
// Même pattern que sellerConfig : Zod + parse pur + getter mémoïsé validé au boot
// (instrumentation.ts). Valeurs de départ alignées sur le plus restrictif des
// transporteurs standards visés (Mondial Relay : 25 kg / 150 cm — cf. recherche).
export type ShippingConfig = {
  maxWeightKg: number
  maxDimensionSumCm: number // L + l + h
}

const shippingEnvSchema = z.object({
  SHIPPING_MAX_WEIGHT_KG: z.coerce
    .number({ invalid_type_error: "SHIPPING_MAX_WEIGHT_KG doit être numérique" })
    .positive("SHIPPING_MAX_WEIGHT_KG doit être > 0"),
  SHIPPING_MAX_DIMENSION_SUM_CM: z.coerce
    .number({ invalid_type_error: "SHIPPING_MAX_DIMENSION_SUM_CM doit être numérique" })
    .positive("SHIPPING_MAX_DIMENSION_SUM_CM doit être > 0"),
})

/**
 * Parse + valide les seuils transporteur depuis un objet d'env. Lève (ZodError) si
 * absents / non numériques / ≤ 0. Pur → testable avec des envs arbitraires.
 */
export function parseShippingConfig(env: Record<string, string | undefined>): ShippingConfig {
  const parsed = shippingEnvSchema.parse(env)
  return {
    maxWeightKg: parsed.SHIPPING_MAX_WEIGHT_KG,
    maxDimensionSumCm: parsed.SHIPPING_MAX_DIMENSION_SUM_CM,
  }
}

let cached: ShippingConfig | null = null

/**
 * Seuils transporteur du process (mémoïsés). Appeler tôt (boot) pour faire échouer
 * le démarrage si la config est absente/invalide — même posture que getSellerConfig.
 */
export function getShippingConfig(): ShippingConfig {
  if (!cached) cached = parseShippingConfig(process.env)
  return cached
}
