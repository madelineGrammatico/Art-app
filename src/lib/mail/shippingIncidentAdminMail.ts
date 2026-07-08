import { sendEmail, type SendEmailResult } from "./client"

// Alerte admin sur échec de création/annulation de colis transporteur (spec §3.D / §3.E).
// Distinct de sendCheckoutRaceIncidentAdminMail (qui ne couvre que la race au checkout,
// avec remboursement et montant) : ici pas de remboursement ni de montant, juste un colis
// à traiter manuellement. Même canal (sendEmail + ADMIN_EMAIL), template dédié.
export type ShippingIncidentAdminMailParams = {
  invoiceId: string
  invoiceNumber: string
  artworkId: string
  artworkTitle: string
  shippingMethodId: string | null
  error: string
}

function buildHtml(params: ShippingIncidentAdminMailParams): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2>Incident transporteur — colis non créé</h2>
      <p style="color: #b91c1c;"><strong>⚠️ La création du colis a échoué après paiement</strong> — intervention manuelle requise (créer/relancer l'étiquette).</p>
      <p><strong>Détails :</strong></p>
      <ul>
        <li>Facture : <code>${escapeHtml(params.invoiceNumber)}</code> (id: <code>${escapeHtml(params.invoiceId)}</code>)</li>
        <li>Œuvre : ${escapeHtml(params.artworkTitle)} (id: <code>${escapeHtml(params.artworkId)}</code>)</li>
        <li>Service transporteur : <code>${params.shippingMethodId ? escapeHtml(params.shippingMethodId) : "(non précisé)"}</code></li>
      </ul>
      <p>Erreur : <code>${escapeHtml(params.error)}</code></p>
      <p>Vérifier dans le dashboard Sendcloud et la ligne SHIPPING de la facture (marqueur <code>shippingParcelFailedAt</code>).</p>
    </div>
  `
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export async function sendShippingIncidentAdminMail(
  params: ShippingIncidentAdminMailParams
): Promise<SendEmailResult> {
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    return { ok: false, error: "ADMIN_EMAIL is not set" }
  }

  return sendEmail({
    to: adminEmail,
    subject: `[URGENT] Colis non créé — facture ${params.invoiceNumber}`,
    html: buildHtml(params),
  })
}
