import { sendEmail, type SendEmailResult } from "./client"
import type { InvoiceViewModel } from "@/src/lib/invoice/invoiceViewModel"

export type InvoiceUserMailParams = {
  to: string
  invoice: InvoiceViewModel
  pdf?: Buffer // facture PDF à joindre (support durable)
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

function buildHtml(invoice: InvoiceViewModel): string {
  const rows = invoice.lines
    .map(
      (l) => `
      <tr>
        <td>${escapeHtml(l.label)}</td>
        <td style="text-align:right;">${l.quantity}</td>
        <td style="text-align:right;">${eur(l.unitPriceHT)}</td>
        <td style="text-align:right;">${eur(l.lineTTC)}</td>
      </tr>`
    )
    .join("")

  const vatLine = invoice.totals.vat > 0
    ? `<p>Total HT : ${eur(invoice.totals.ht)} — TVA : ${eur(invoice.totals.vat)}</p>`
    : ""

  const legal = invoice.legalMention
    ? `<p style="color:#555;font-size:13px;">${escapeHtml(invoice.legalMention)}</p>`
    : ""

  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2>Facture ${escapeHtml(invoice.number)}</h2>
      <p>Bonjour ${escapeHtml(invoice.buyer.name)},</p>
      <p>Merci pour votre achat. Voici votre facture (date de vente : ${escapeHtml(invoice.saleDate)}).</p>

      <p style="font-size:13px;color:#555;">
        ${escapeHtml(invoice.seller.name)} — ${escapeHtml(invoice.seller.legalForm)}<br/>
        ${escapeHtml(invoice.seller.address)}<br/>
        SIRET : ${escapeHtml(invoice.seller.siret)}${invoice.seller.vatNumber ? ` — TVA : ${escapeHtml(invoice.seller.vatNumber)}` : ""}
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;" cellpadding="6">
        <thead>
          <tr style="border-bottom:1px solid #ddd;text-align:left;">
            <th>Désignation</th><th style="text-align:right;">Qté</th>
            <th style="text-align:right;">PU HT</th><th style="text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      ${vatLine}
      <p><strong>Total : ${eur(invoice.totals.ttc)}</strong></p>
      <p style="color:#555;font-size:13px;">${escapeHtml(invoice.paymentTerms)}</p>
      ${legal}
    </div>
  `
}

export async function sendInvoiceUserMail(
  params: InvoiceUserMailParams
): Promise<SendEmailResult> {
  return sendEmail({
    to: params.to,
    subject: `Votre facture ${params.invoice.number}`,
    html: buildHtml(params.invoice),
    ...(params.pdf
      ? { attachments: [{ filename: `facture-${params.invoice.number}.pdf`, content: params.pdf }] }
      : {}),
  })
}
