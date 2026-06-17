import { describe, it, expect } from "vitest"
import { invoiceViewModel, type InvoiceForView } from "./invoiceViewModel"

// US3.1 — le view-model porte toutes les mentions obligatoires (pur, sans DB).

const base: InvoiceForView = {
  number: "INV-2026-000001",
  issuedAt: new Date("2026-03-10T14:30:00Z"),
  saleDate: new Date("2026-03-10T14:30:00Z"),
  sellerName: "Galerie Test",
  sellerLegalForm: "Entreprise individuelle",
  sellerAddress: "1 rue de l'Art, 75001 Paris",
  sellerSiret: "12345678901234",
  sellerRcs: "Paris B 123 456 789",
  sellerVatNumber: null,
  vatRegime: "FRANCHISE",
  legalMention: "TVA non applicable, art. 293 B du CGI",
  buyerName: "Jean Acheteur",
  billingStreet: "10 av Foch",
  billingPostalCode: "75116",
  billingCity: "Paris",
  billingCountry: "France",
  shippingStreet: null,
  shippingPostalCode: null,
  shippingCity: null,
  shippingCountry: null,
  totalHT: 250,
  totalVat: 0,
  totalTTC: 250,
  lineItems: [
    { label: "Crépuscule", quantity: 1, unitPriceHT: 250, vatRate: 0, vatAmount: 0, lineTTC: 250 },
  ],
}

describe("invoiceViewModel", () => {
  it("expose l'identité vendeur, le numéro et les dates", () => {
    const vm = invoiceViewModel(base)
    expect(vm.number).toBe("INV-2026-000001")
    expect(vm.issuedAt).toBe("2026-03-10")
    expect(vm.saleDate).toBe("2026-03-10")
    expect(vm.seller.name).toBe("Galerie Test")
    expect(vm.seller.legalForm).toBe("Entreprise individuelle")
    expect(vm.seller.siret).toBe("12345678901234")
    expect(vm.seller.rcs).toBe("Paris B 123 456 789")
  })

  it("expose l'identité client (nom + adresse de facturation)", () => {
    const vm = invoiceViewModel(base)
    expect(vm.buyer.name).toBe("Jean Acheteur")
    expect(vm.buyer.billingAddress).toBe("10 av Foch, 75116 Paris, France")
    expect(vm.buyer.shippingAddress).toBeNull()
  })

  it("détaille chaque ligne (désignation, quantité, PU HT, taux/montant TVA)", () => {
    const vm = invoiceViewModel(base)
    expect(vm.lines).toHaveLength(1)
    expect(vm.lines[0]).toEqual({
      label: "Crépuscule",
      quantity: 1,
      unitPriceHT: 250,
      vatRate: 0,
      vatAmount: 0,
      lineTTC: 250,
    })
  })

  it("expose les totaux et les conditions de paiement", () => {
    const vm = invoiceViewModel(base)
    expect(vm.totals).toEqual({ ht: 250, vat: 0, ttc: 250 })
    expect(vm.paymentTerms).toBe("Payé comptant le 2026-03-10")
  })

  it("en franchise : porte la mention 293 B", () => {
    const vm = invoiceViewModel(base)
    expect(vm.legalMention).toBe("TVA non applicable, art. 293 B du CGI")
  })

  it("ventile la TVA par taux quand assujetti", () => {
    const vm = invoiceViewModel({
      ...base,
      vatRegime: "ASSUJETTIE",
      sellerVatNumber: "FR12345678901",
      legalMention: null,
      totalHT: 300,
      totalVat: 16.5,
      totalTTC: 316.5,
      lineItems: [
        { label: "A1", quantity: 1, unitPriceHT: 100, vatRate: 0.055, vatAmount: 5.5, lineTTC: 105.5 },
        { label: "A2", quantity: 1, unitPriceHT: 200, vatRate: 0.055, vatAmount: 11, lineTTC: 211 },
      ],
    })
    expect(vm.seller.vatNumber).toBe("FR12345678901")
    expect(vm.legalMention).toBeNull()
    expect(vm.vatBreakdown).toEqual([{ rate: 0.055, base: 300, amount: 16.5 }])
    expect(vm.totals).toEqual({ ht: 300, vat: 16.5, ttc: 316.5 })
  })

  it("formate proprement une adresse partielle sans laisser de virgules vides", () => {
    const vm = invoiceViewModel({
      ...base,
      billingStreet: null,
      billingPostalCode: "75001",
      billingCity: "Paris",
      billingCountry: null,
    })
    expect(vm.buyer.billingAddress).toBe("75001 Paris")
  })
})
