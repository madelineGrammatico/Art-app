// Next.js instrumentation : exécuté une fois au démarrage du serveur.
//
// Principe : ne valider au boot QUE la config app-wide (une absence rendrait toute
// l'app inutilisable de toute façon). La config d'une *feature* n'est PAS validée ici —
// sinon une variable de feature manquante ferait tomber tout le site au démarrage. Elle
// est validée paresseusement au point d'entrée de la feature, qui dégrade proprement.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // US0.1 (B13) — config vendeur (SELLER_*), requise pour l'émission de facture.
    const { getSellerConfig } = await import("@/src/lib/invoice/sellerConfig")
    getSellerConfig()

    // Shipping (SHIPPING_MAX_*, SENDCLOUD_*) : volontairement PAS validé au boot.
    // Config de feature → validée paresseusement (getShippingConfig / getSendcloudConfig
    // appelés au checkout, au webhook et à l'édition d'œuvre). Une config shipping
    // incomplète ne dégrade que la livraison/les colis, jamais le reste du site.
  }
}
