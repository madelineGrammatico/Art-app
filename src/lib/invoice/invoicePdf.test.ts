import { describe, it, expect } from "vitest"
import { renderInvoicePdf } from "./invoicePdf"
import type { InvoiceViewModel } from "./invoiceViewModel"

// On ne teste pas le contenu du binaire (fragile) — juste que le rendu produit
// un vrai PDF. Le légal est verrouillé par les tests de invoiceViewModel.
const vm: InvoiceViewModel = {
  number: "INV-2026-000001",
  issuedAt: "2026-03-10",
  saleDate: "2026-03-10",
  seller: {
    name: "Galerie Test",
    legalForm: "Entreprise individuelle",
    address: "1 rue de l'Art, 75001 Paris",
    siret: "12345678901234",
    rcs: "Paris B 123 456 789",
    vatNumber: null,
  },
  buyer: { name: "Jean Acheteur", billingAddress: "10 av Foch, 75116 Paris, France", shippingAddress: null },
  lines: [
    { label: "Crépuscule", quantity: 1, unitPriceHT: 250, vatRate: 0, vatAmount: 0, lineTTC: 250 },
  ],
  vatBreakdown: [{ rate: 0, base: 250, amount: 0 }],
  totals: { ht: 250, vat: 0, ttc: 250 },
  legalMention: "TVA non applicable, art. 293 B du CGI",
  paymentTerms: "Payé comptant le 2026-03-10",
}

describe("renderInvoicePdf", () => {
  it("produit un Buffer PDF non vide", async () => {
    const buf = await renderInvoicePdf(vm)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(0)
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
  })

  it("rend aussi le cas assujetti (avec ventilation TVA)", async () => {
    const buf = await renderInvoicePdf({
      ...vm,
      legalMention: null,
      vatBreakdown: [{ rate: 0.055, base: 250, amount: 13.75 }],
      totals: { ht: 250, vat: 13.75, ttc: 263.75 },
    })
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
  })
})
