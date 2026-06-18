import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("./client", () => ({
  sendEmail: vi.fn(),
}))

import { sendCreditNoteUserMail } from "./creditNoteUserMail"
import { sendEmail } from "./client"

const mockedSend = vi.mocked(sendEmail)

const params = {
  to: "jean@test.local",
  creditNoteNumber: "CN-2026-000001",
  originalInvoiceNumber: "INV-2026-000001",
  refundedItems: [{ title: "Crépuscule", amountEur: 250 }],
  totalRefundEur: 250,
}

beforeEach(() => {
  mockedSend.mockReset()
  mockedSend.mockResolvedValue({ ok: true, id: "msg_1" })
})

describe("sendCreditNoteUserMail", () => {
  it("envoie au client avec le numéro d'avoir en objet", async () => {
    await sendCreditNoteUserMail(params)

    expect(mockedSend).toHaveBeenCalledOnce()
    const arg = mockedSend.mock.calls[0][0]
    expect(arg.to).toBe("jean@test.local")
    expect(arg.subject).toBe("Votre avoir CN-2026-000001")
  })

  it("inclut le numéro d'avoir, la facture créditée, l'œuvre et le total remboursé", async () => {
    await sendCreditNoteUserMail(params)

    const html = mockedSend.mock.calls[0][0].html
    expect(html).toContain("CN-2026-000001")
    expect(html).toContain("INV-2026-000001")
    expect(html).toContain("Crépuscule")
    expect(html).toContain("250.00 €")
  })

  it("joint le PDF de l'avoir quand il est fourni", async () => {
    const pdf = Buffer.from("%PDF-test")
    await sendCreditNoteUserMail({ ...params, pdf })

    const arg = mockedSend.mock.calls[0][0]
    expect(arg.attachments).toEqual([
      { filename: "avoir-CN-2026-000001.pdf", content: pdf },
    ])
  })

  it("n'ajoute pas de pièce jointe sans PDF", async () => {
    await sendCreditNoteUserMail(params)
    expect(mockedSend.mock.calls[0][0].attachments).toBeUndefined()
  })

  it("propage le résultat de sendEmail", async () => {
    mockedSend.mockResolvedValue({ ok: false, error: "boom" })
    const res = await sendCreditNoteUserMail(params)
    expect(res).toEqual({ ok: false, error: "boom" })
  })
})
