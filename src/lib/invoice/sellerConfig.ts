import { z } from "zod"

// Mention légale obligatoire tant que le vendeur est en franchise en base de TVA.
export const FRANCHISE_VAT_MENTION = "TVA non applicable, art. 293 B du CGI"

export type SellerConfig = {
  name: string
  legalForm: string
  address: string
  siret: string
  rcs: string | null
  vatNumber: string | null
  vatRegime: "FRANCHISE" | "ASSUJETTIE"
  vatRate: number // fraction : 0 en franchise, ex. 0.055 en assujetti 5,5 %
  legalMention: string | null
}

const sellerEnvSchema = z
  .object({
    SELLER_NAME: z.string().min(1, "SELLER_NAME manquant"),
    SELLER_LEGAL_FORM: z.string().min(1, "SELLER_LEGAL_FORM manquant"),
    SELLER_ADDRESS: z.string().min(1, "SELLER_ADDRESS manquant"),
    SELLER_SIRET: z.string().regex(/^\d{14}$/, "SELLER_SIRET doit faire 14 chiffres"),
    SELLER_RCS: z.string().min(1).optional(),
    SELLER_VAT_NUMBER: z.string().min(1).optional(),
    SELLER_VAT_REGIME: z.enum(["FRANCHISE", "ASSUJETTIE"]),
    SELLER_VAT_RATE: z.coerce.number().nonnegative().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.SELLER_VAT_REGIME === "ASSUJETTIE") {
      if (env.SELLER_VAT_RATE === undefined || env.SELLER_VAT_RATE <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SELLER_VAT_RATE"],
          message: "SELLER_VAT_RATE > 0 requis quand SELLER_VAT_REGIME=ASSUJETTIE",
        })
      }
    } else if (env.SELLER_VAT_RATE !== undefined && env.SELLER_VAT_RATE !== 0) {
      // Incohérent : franchise = pas de TVA, donc pas de taux.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SELLER_VAT_RATE"],
        message: "SELLER_VAT_RATE doit être absent ou 0 quand SELLER_VAT_REGIME=FRANCHISE",
      })
    }
  })

/**
 * Parse + valide la config vendeur depuis un objet d'env. Lève (ZodError) si
 * absente/incohérente. Pure → testable avec des envs arbitraires.
 */
export function parseSellerConfig(env: Record<string, string | undefined>): SellerConfig {
  const parsed = sellerEnvSchema.parse(env)
  const isFranchise = parsed.SELLER_VAT_REGIME === "FRANCHISE"
  return {
    name: parsed.SELLER_NAME,
    legalForm: parsed.SELLER_LEGAL_FORM,
    address: parsed.SELLER_ADDRESS,
    siret: parsed.SELLER_SIRET,
    rcs: parsed.SELLER_RCS ?? null,
    vatNumber: parsed.SELLER_VAT_NUMBER ?? null,
    vatRegime: parsed.SELLER_VAT_REGIME,
    vatRate: isFranchise ? 0 : (parsed.SELLER_VAT_RATE as number),
    legalMention: isFranchise ? FRANCHISE_VAT_MENTION : null,
  }
}

let cached: SellerConfig | null = null

/**
 * Config vendeur du process (mémoïsée). Appeler tôt (boot) pour faire échouer
 * le démarrage si la config est absente/incohérente — US0.1.
 */
export function getSellerConfig(): SellerConfig {
  if (!cached) {
    try {
      cached = parseSellerConfig(process.env)
    } catch (err) {
      // Message ZodError = getter en lecture seule → rethrow en Error simple lisible.
      if (err instanceof z.ZodError) {
        throw new Error(
          "Configuration vendeur invalide : " +
            err.issues.map((i) => `${i.path.join(".") || "?"} (${i.message})`).join(" ; ")
        )
      }
      throw err
    }
  }
  return cached
}
