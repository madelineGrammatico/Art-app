import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("./client", () => ({
  sendEmail: vi.fn(),
}))

import { sendInvoiceUserMail } from "./invoiceUserMail"
import { sendEmail } from "./client"
import type { InvoiceViewModel } from "@/src/lib/invoice/invoiceViewModel"

const mockedSend = vi.mocked(sendEmail)

const vm: InvoiceViewModel = {
  number: "INV-2026-000001",
  issuedAt: "2026-03-10",
  saleDate: "2026-03-10",
  seller: {
    name: "Galerie Test",
    legalForm: "Entreprise individuelle",
    address: "1 rue de l'Art, 75001 Paris",
    siret: "12345678901234",
    rcs: null,
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

beforeEach(() => {
  mockedSend.mockReset()
  mockedSend.mockResolvedValue({ ok: true, id: "msg_1" })
})

describe("sendInvoiceUserMail", () => {
  it("envoie au client avec le numéro de facture en objet", async () => {
    await sendInvoiceUserMail({ to: "jean@test.local", invoice: vm })

    expect(mockedSend).toHaveBeenCalledOnce()
    const arg = mockedSend.mock.calls[0][0]
    expect(arg.to).toBe("jean@test.local")
    expect(arg.subject).toBe("Votre facture INV-2026-000001")
  })

  it("inclut les mentions clés dans le corps (numéro, ligne, total, mention légale)", async () => {
    await sendInvoiceUserMail({ to: "jean@test.local", invoice: vm })

    const html = mockedSend.mock.calls[0][0].html
    expect(html).toContain("INV-2026-000001")
    expect(html).toContain("Crépuscule")
    expect(html).toContain("250.00 €")
    expect(html).toContain("Galerie Test")
    expect(html).toContain("12345678901234")
    expect(html).toContain("TVA non applicable, art. 293 B du CGI")
  })

  it("affiche le détail HT/TVA quand il y a de la TVA", async () => {
    await sendInvoiceUserMail({
      to: "jean@test.local",
      invoice: {
        ...vm,
        totals: { ht: 250, vat: 13.75, ttc: 263.75 },
        legalMention: null,
        vatBreakdown: [{ rate: 0.055, base: 250, amount: 13.75 }],
      },
    })

    const html = mockedSend.mock.calls[0][0].html
    expect(html).toContain("TVA : 13.75 €")
    expect(html).toContain("263.75 €")
  })

  it("propage le résultat de sendEmail", async () => {
    mockedSend.mockResolvedValue({ ok: false, error: "boom" })
    const res = await sendInvoiceUserMail({ to: "jean@test.local", invoice: vm })
    expect(res).toEqual({ ok: false, error: "boom" })
  })
})
