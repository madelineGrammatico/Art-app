// Vérifie la config d'environnement AVANT le build (hook `prebuild`) → un build échoué
// bloque le déploiement, l'ancienne version prod reste en ligne. C'est le garde-fou qui
// remplace le crash-au-boot pour la config de feature (cf. docs/B14-shipping-spec.md §2).
//
// Réutilise les VRAIS validateurs Zod (SELLER/SHIPPING/SENDCLOUD) → zéro divergence de
// règles ; présence simple pour les autres variables.
import { config as loadEnv } from "dotenv"
import { parseSellerConfig } from "../src/lib/invoice/sellerConfig"
import { parseShippingConfig } from "../src/lib/shipping/shippingConfig"
import { parseSendcloudConfig } from "../src/lib/shipping/sendcloudConfig"

// Charge .env.local puis .env (comme Next : .env.local prioritaire, dotenv n'écrase pas).
// Sur Vercel il n'y a pas de fichier .env → process.env est déjà peuplé (no-op inoffensif).
loadEnv({ path: ".env.local", quiet: true })
loadEnv({ path: ".env", quiet: true })

const errors: string[] = []

// 1. Configs à schéma Zod — validation exacte (formats, conditions TVA, code pays…).
const schemaChecks: Array<[string, () => unknown]> = [
  ["Vendeur (SELLER_*)", () => parseSellerConfig(process.env)],
  ["Shipping seuils (SHIPPING_MAX_*)", () => parseShippingConfig(process.env)],
  ["Sendcloud (clés + expéditeur)", () => parseSendcloudConfig(process.env)],
]
for (const [label, run] of schemaChecks) {
  try {
    run()
  } catch (err) {
    const issues =
      err && typeof err === "object" && "issues" in err
        ? (err as { issues: { path: (string | number)[]; message: string }[] }).issues
            .map((i) => `${i.path.join(".") || "?"} (${i.message})`)
            .join(" ; ")
        : String((err as Error)?.message ?? err)
    errors.push(`${label} : ${issues}`)
  }
}

// 2. Variables requises sans schéma dédié — présence simple.
// (Ajuste cette liste si tes noms diffèrent, ex. le secret NextAuth.)
const required = [
  "DATABASE_URL",
  "AUTH_SECRET", // secret NextAuth v5 — renomme ici si le tien est différent
  "AUTH_GOOGLE_ID", // provider Google (convention v5) — retirer si tu abandonnes Google
  "AUTH_GOOGLE_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_KEY",
  "ADMIN_EMAIL",
  "BLOB_READ_WRITE_TOKEN", // Vercel Blob (B15) — sans lui l'upload d'images admin est mort
                           // (le site public sert quand même les images déjà stockées en lecture).
  // EMAIL_FROM : volontairement PAS requis — a un fallback (onboarding@resend.dev).
]
for (const key of required) {
  if (!process.env[key]?.trim()) errors.push(`${key} : manquant`)
}

// 3. URL publique de l'app : requise en prod (l'une des deux ; VERCEL_URL est auto sur Vercel).
if (!process.env.NEXT_PUBLIC_APP_URL?.trim() && !process.env.VERCEL_URL?.trim()) {
  errors.push("NEXT_PUBLIC_APP_URL ou VERCEL_URL : requis en production")
}

// Strict (bloque) en CI/Vercel ou si --strict ; en build local → simple avertissement,
// pour ne pas empêcher un build de dev sur une config incomplète (cohérent avec le boot lazy).
const strict =
  process.argv.includes("--strict") ||
  process.env.CI === "true" ||
  Boolean(process.env.VERCEL)

if (errors.length > 0) {
  const title = strict
    ? "❌ Config d'environnement incomplète — build/déploiement bloqué :"
    : "⚠️  Config d'environnement incomplète (build local non bloqué) :"
  console.error("\n" + title + "\n")
  for (const e of errors) console.error("  - " + e)
  console.error("\n→ Voir .env.example pour la liste complète des variables.\n")
  if (strict) process.exit(1)
} else {
  console.log("✅ Config d'environnement complète.")
}
