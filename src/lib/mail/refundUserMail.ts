import { sendEmail, type SendEmailResult } from "./client"

export type RefundUserMailParams = {
  to: string
  refundedItems: Array<{ title: string; amountEur: number }>
  totalRefundEur: number
  sessionId: string
}

function buildHtml(params: RefundUserMailParams): string {
  const itemsList = params.refundedItems
    .map(
      (item) =>
        `<li>${escapeHtml(item.title)} — ${item.amountEur.toFixed(2)} €</li>`
    )
    .join("")

  const intro =
    params.refundedItems.length === 1
      ? "L'oeuvre que vous avez tenté d'acheter n'était plus disponible au moment du paiement. Vous avez été intégralement remboursé."
      : `${params.refundedItems.length} oeuvres de votre commande n'étaient plus disponibles au moment du paiement. Elles vous ont été remboursées.`

  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2>Remboursement de votre commande</h2>
      <p>Bonjour,</p>
      <p>${intro}</p>
      <p><strong>Détail du remboursement :</strong></p>
      <ul>${itemsList}</ul>
      <p><strong>Total remboursé : ${params.totalRefundEur.toFixed(2)} €</strong></p>
      <p>Le remboursement apparaîtra sur votre relevé bancaire sous quelques jours.</p>
      <p>Référence de paiement : ${escapeHtml(params.sessionId)}</p>
      <p>Toutes nos excuses pour la gêne occasionnée.</p>
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

export async function sendRefundUserMail(
  params: RefundUserMailParams
): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: "Remboursement de votre commande",
    html: buildHtml(params),
  })
}
