import { sendEmail, type SendEmailResult } from "./client"

export type IncidentAdminMailParams = {
  sessionId: string
  userId: string
  userEmail?: string | null
  affectedItems: Array<{ artworkId: string; title: string; amountEur: number }>
  refundOutcome: "issued" | "failed"
  refundError?: string
}

function buildHtml(params: IncidentAdminMailParams): string {
  const itemsList = params.affectedItems
    .map(
      (item) =>
        `<li>${escapeHtml(item.title)} (id: ${escapeHtml(item.artworkId)}) — ${item.amountEur.toFixed(2)} €</li>`
    )
    .join("")

  const totalEur = params.affectedItems.reduce(
    (sum, item) => sum + item.amountEur,
    0
  )

  const outcomeBlock =
    params.refundOutcome === "issued"
      ? `<p style="color: #b45309;"><strong>Remboursement Stripe émis avec succès</strong> (${totalEur.toFixed(2)} €).</p>`
      : `<p style="color: #b91c1c;"><strong>⚠️ ÉCHEC DU REMBOURSEMENT STRIPE</strong> — intervention manuelle requise.</p>
         <p>Erreur : <code>${escapeHtml(params.refundError ?? "(non précisée)")}</code></p>`

  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2>Incident race condition détecté</h2>
      <p>Un paiement Stripe a abouti pour des oeuvres qui n'étaient plus disponibles au moment du webhook.</p>
      ${outcomeBlock}
      <p><strong>Détails :</strong></p>
      <ul>
        <li>Stripe session : <code>${escapeHtml(params.sessionId)}</code></li>
        <li>User ID : <code>${escapeHtml(params.userId)}</code></li>
        <li>User email : ${params.userEmail ? escapeHtml(params.userEmail) : "(non renseigné)"}</li>
      </ul>
      <p><strong>Oeuvres concernées :</strong></p>
      <ul>${itemsList}</ul>
      <p>Vérifier dans le dashboard Stripe et la table Invoice (statut REFUNDED) pour confirmer.</p>
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

export async function sendIncidentAdminMail(
  params: IncidentAdminMailParams
): Promise<SendEmailResult> {
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    return { ok: false, error: "ADMIN_EMAIL is not set" }
  }

  const subjectPrefix = params.refundOutcome === "failed" ? "[URGENT] " : ""

  return sendEmail({
    to: adminEmail,
    subject: `${subjectPrefix}Incident paiement — session ${params.sessionId}`,
    html: buildHtml(params),
  })
}
