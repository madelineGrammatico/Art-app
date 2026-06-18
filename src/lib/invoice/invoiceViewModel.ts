import { Prisma } from "@prisma/client"

// Entrée structurelle minimale : un Invoice Prisma (avec ses lineItems) y est
// assignable, mais les tests peuvent aussi passer un objet simple.
type DecimalLike = Prisma.Decimal | number | string

export type InvoiceForView = {
  type: "SALE" | "CREDIT_NOTE"
  number: string
  issuedAt: Date
  saleDate: Date

  sellerName: string
  sellerLegalForm: string
  sellerAddress: string
  sellerSiret: string
  sellerRcs: string | null
  sellerVatNumber: string | null
  vatRegime: string
  legalMention: string | null

  buyerName: string
  billingStreet: string | null
  billingPostalCode: string | null
  billingCity: string | null
  billingCountry: string | null
  shippingStreet: string | null
  shippingPostalCode: string | null
  shippingCity: string | null
  shippingCountry: string | null

  totalHT: DecimalLike
  totalVat: DecimalLike
  totalTTC: DecimalLike

  lineItems: {
    label: string
    quantity: number
    unitPriceHT: DecimalLike
    vatRate: DecimalLike
    vatAmount: DecimalLike
    lineTTC: DecimalLike
  }[]
}

export type InvoiceViewModel = {
  documentLabel: string // "Facture" (vente) | "Avoir" (CREDIT_NOTE)
  dateLabel: string // "Vente du" | "Remboursement du"
  number: string
  issuedAt: string
  saleDate: string
  seller: {
    name: string
    legalForm: string
    address: string
    siret: string
    rcs: string | null
    vatNumber: string | null
  }
  buyer: {
    name: string
    billingAddress: string | null
    shippingAddress: string | null
  }
  lines: {
    label: string
    quantity: number
    unitPriceHT: number
    vatRate: number
    vatAmount: number
    lineTTC: number
  }[]
  vatBreakdown: { rate: number; base: number; amount: number }[]
  totals: { ht: number; vat: number; ttc: number }
  legalMention: string | null
  paymentTerms: string
}

const n = (d: DecimalLike): number => Number(d)

// Dates des pièces comptables projetées sur le fuseau légal français (Europe/Paris),
// pas sur UTC : une vente passée juste après minuit à Paris doit afficher la bonne date
// (et l'année de numérotation, cf. parisYear, doit coïncider avec la date affichée).
const PARIS_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const formatDate = (d: Date): string => {
  const p = Object.fromEntries(PARIS_PARTS.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}` // YYYY-MM-DD, heure de Paris
}

/** Année civile (Europe/Paris) d'une date — pour la série de numérotation des factures. */
export function parisYear(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric" }).format(d)
  )
}

function formatAddress(
  street: string | null,
  postalCode: string | null,
  city: string | null,
  country: string | null
): string | null {
  const cityLine = [postalCode, city].filter(Boolean).join(" ")
  const parts = [street, cityLine, country].map((p) => p?.trim()).filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : null
}

/**
 * Projette une facture persistée vers un objet portant TOUTES les mentions
 * légales obligatoires (spec §8). Le PDF et l'email consomment ce view-model ;
 * c'est lui qu'on teste (pas le binaire PDF).
 */
export function invoiceViewModel(invoice: InvoiceForView): InvoiceViewModel {
  const lines = invoice.lineItems.map((l) => ({
    label: l.label,
    quantity: l.quantity,
    unitPriceHT: n(l.unitPriceHT),
    vatRate: n(l.vatRate),
    vatAmount: n(l.vatAmount),
    lineTTC: n(l.lineTTC),
  }))

  // Ventilation de TVA par taux (obligatoire dès qu'il y a de la TVA).
  const byRate = new Map<number, { rate: number; base: number; amount: number }>()
  for (const l of lines) {
    const entry = byRate.get(l.vatRate) ?? { rate: l.vatRate, base: 0, amount: 0 }
    entry.base += l.unitPriceHT * l.quantity
    entry.amount += l.vatAmount
    byRate.set(l.vatRate, entry)
  }

  const isCreditNote = invoice.type === "CREDIT_NOTE"

  return {
    documentLabel: isCreditNote ? "Avoir" : "Facture",
    dateLabel: isCreditNote ? "Remboursement du" : "Vente du",
    number: invoice.number,
    issuedAt: formatDate(invoice.issuedAt),
    saleDate: formatDate(invoice.saleDate),
    seller: {
      name: invoice.sellerName,
      legalForm: invoice.sellerLegalForm,
      address: invoice.sellerAddress,
      siret: invoice.sellerSiret,
      rcs: invoice.sellerRcs,
      vatNumber: invoice.sellerVatNumber,
    },
    buyer: {
      name: invoice.buyerName,
      billingAddress: formatAddress(
        invoice.billingStreet,
        invoice.billingPostalCode,
        invoice.billingCity,
        invoice.billingCountry
      ),
      shippingAddress: formatAddress(
        invoice.shippingStreet,
        invoice.shippingPostalCode,
        invoice.shippingCity,
        invoice.shippingCountry
      ),
    },
    lines,
    vatBreakdown: [...byRate.values()].sort((a, b) => a.rate - b.rate),
    totals: {
      ht: n(invoice.totalHT),
      vat: n(invoice.totalVat),
      ttc: n(invoice.totalTTC),
    },
    legalMention: invoice.legalMention,
    paymentTerms: isCreditNote
      ? `Remboursé le ${formatDate(invoice.saleDate)}`
      : `Payé comptant le ${formatDate(invoice.saleDate)}`,
  }
}
