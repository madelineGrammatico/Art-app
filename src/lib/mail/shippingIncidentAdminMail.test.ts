import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("./client", () => ({
  sendEmail: vi.fn(),
}))

import { sendShippingIncidentAdminMail } from "./shippingIncidentAdminMail"
import { sendEmail } from "./client"

const mockedSend = vi.mocked(sendEmail)

const params = {
  invoiceId: "inv_123",
  invoiceNumber: "INV-2026-000007",
  artworkId: "art_42",
  artworkTitle: "Crépuscule",
  shippingMethodId: "sc_colissimo",
  error: "Sendcloud 502 Bad Gateway",
}

const ORIGINAL_ADMIN_EMAIL = process.env.ADMIN_EMAIL

beforeEach(() => {
  process.env.ADMIN_EMAIL = "admin@galerie.local"
  mockedSend.mockReset()
  mockedSend.mockResolvedValue({ ok: true, id: "msg_1" })
})

afterEach(() => {
  process.env.ADMIN_EMAIL = ORIGINAL_ADMIN_EMAIL
})

describe("sendShippingIncidentAdminMail", () => {
  it("envoie à l'admin avec le numéro de facture en objet", async () => {
    await sendShippingIncidentAdminMail(params)

    expect(mockedSend).toHaveBeenCalledOnce()
    const arg = mockedSend.mock.calls[0][0]
    expect(arg.to).toBe("admin@galerie.local")
    expect(arg.subject).toContain("INV-2026-000007")
  })

  it("inclut l'œuvre, son id, le service transporteur et l'erreur dans le corps", async () => {
    await sendShippingIncidentAdminMail(params)

    const html = mockedSend.mock.calls[0][0].html
    expect(html).toContain("Crépuscule")
    expect(html).toContain("art_42")
    expect(html).toContain("INV-2026-000007")
    expect(html).toContain("sc_colissimo")
    expect(html).toContain("Sendcloud 502 Bad Gateway")
  })

  it("gère un shippingMethodId null sans casser", async () => {
    await sendShippingIncidentAdminMail({ ...params, shippingMethodId: null })

    expect(mockedSend).toHaveBeenCalledOnce()
    const html = mockedSend.mock.calls[0][0].html
    expect(html).toContain("Crépuscule")
  })

  it("échappe le HTML des champs libres (titre, erreur)", async () => {
    await sendShippingIncidentAdminMail({
      ...params,
      artworkTitle: "<script>alert(1)</script>",
      error: "<img src=x onerror=alert(1)>",
    })

    const html = mockedSend.mock.calls[0][0].html
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;script&gt;")
  })

  it("renvoie une erreur si ADMIN_EMAIL n'est pas défini (pas de crash)", async () => {
    delete process.env.ADMIN_EMAIL

    const res = await sendShippingIncidentAdminMail(params)

    expect(res.ok).toBe(false)
    expect(mockedSend).not.toHaveBeenCalled()
  })

  it("propage le résultat de sendEmail", async () => {
    mockedSend.mockResolvedValue({ ok: false, error: "boom" })
    const res = await sendShippingIncidentAdminMail(params)
    expect(res).toEqual({ ok: false, error: "boom" })
  })
})
