// Next.js instrumentation : exécuté une fois au démarrage du serveur.
// On valide les configs critiques au boot pour que l'app échoue IMMÉDIATEMENT si
// elles sont absentes/incohérentes, plutôt qu'au premier webhook/checkout concerné.
// Chaque getter lève (ZodError) si invalide.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // US0.1 (B13) — config vendeur (SELLER_*), requise pour l'émission de facture.
    const { getSellerConfig } = await import("@/src/lib/invoice/sellerConfig")
    getSellerConfig()

    // US1.1 (B14) — seuils transporteur standard (SHIPPING_MAX_*), requis pour le devis.
    const { getShippingConfig } = await import("@/src/lib/shipping/shippingConfig")
    getShippingConfig()

    // B14 — config Sendcloud (clés API + adresse expéditeur), requise pour devis/colis.
    const { getSendcloudConfig } = await import("@/src/lib/shipping/sendcloudConfig")
    getSendcloudConfig()
  }
}
