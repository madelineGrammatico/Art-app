import { sendEmail, type SendEmailResult } from "./client"

export type CreditNoteUserMailParams = {
  to: string
  creditNoteNumber: string
  originalInvoiceNumber: string
  refundedItems: Array<{ title: string; amountEur: number }>
  totalRefundEur: number
  pdf?: Buffer // facture d'avoir PDF (support durable)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

const eur = (n: number) => `${n.toFixed(2)} €`

function buildHtml(params: CreditNoteUserMailParams): string {
  const itemsList = params.refundedItems
    .map((item) => `<li>${escapeHtml(item.title)} — ${eur(item.amountEur)}</li>`)
    .join("")

  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2>Avoir ${escapeHtml(params.creditNoteNumber)}</h2>
      <p>Bonjour,</p>
      <p>Nous avons procédé au remboursement de votre commande. Cet avoir
      (${escapeHtml(params.creditNoteNumber)}) crédite la facture ${escapeHtml(params.originalInvoiceNumber)}.</p>
      <p><strong>Détail du remboursement :</strong></p>
      <ul>${itemsList}</ul>
      <p><strong>Total remboursé : ${eur(params.totalRefundEur)}</strong></p>
      <p>Le remboursement apparaîtra sur votre relevé bancaire sous quelques jours.</p>
    </div>
  `
}

export async function sendCreditNoteUserMail(
  params: CreditNoteUserMailParams
): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: `Votre avoir ${params.creditNoteNumber}`,
    html: buildHtml(params),
    ...(params.pdf
      ? { attachments: [{ filename: `avoir-${params.creditNoteNumber}.pdf`, content: params.pdf }] }
      : {}),
  })
}
