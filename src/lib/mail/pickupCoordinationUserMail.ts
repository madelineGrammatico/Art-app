import { sendEmail, type SendEmailResult } from "./client"

// Email de coordination retrait sur place (B14 US1bis.3), envoyé après paiement quand
// la commande est en mode PICKUP. Pas de créneaux gérés dans l'app : on invite le client
// à convenir d'un rendez-vous. Idempotence assurée par l'appelant (pickupEmailSentAt).
export type PickupCoordinationUserMailParams = {
  to: string
  invoiceNumber: string
  artworkTitles: string[]
}

function buildHtml(params: PickupCoordinationUserMailParams): string {
  const itemsList = params.artworkTitles
    .map((title) => `<li>${escapeHtml(title)}</li>`)
    .join("")

  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2>Retrait de votre commande</h2>
      <p>Bonjour,</p>
      <p>Votre paiement est confirmé. Votre commande (facture ${escapeHtml(params.invoiceNumber)}) est à retirer sur place.</p>
      <p><strong>Œuvre(s) concernée(s) :</strong></p>
      <ul>${itemsList}</ul>
      <p>Répondez à cet email pour convenir d'un rendez-vous de retrait. Merci de vous munir d'une pièce d'identité.</p>
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

export async function sendPickupCoordinationUserMail(
  params: PickupCoordinationUserMailParams
): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: `Retrait de votre commande — facture ${params.invoiceNumber}`,
    html: buildHtml(params),
  })
}
