// Next.js instrumentation : exécuté une fois au démarrage du serveur.
// US0.1 — on valide la config vendeur (SELLER_*) au boot pour que l'app échoue
// IMMÉDIATEMENT si elle est absente/incohérente, plutôt qu'au premier webhook
// d'émission de facture. getSellerConfig() lève (ZodError) si invalide.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getSellerConfig } = await import("@/src/lib/invoice/sellerConfig")
    getSellerConfig()
  }
}
