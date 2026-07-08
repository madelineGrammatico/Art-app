import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("./client", () => ({
  sendEmail: vi.fn(),
}))

import { sendPickupCoordinationUserMail } from "./pickupCoordinationUserMail"
import { sendEmail } from "./client"

const mockedSend = vi.mocked(sendEmail)

const params = {
  to: "client@test.local",
  invoiceNumber: "INV-2026-000009",
  artworkTitles: ["Crépuscule", "Aurore"],
}

beforeEach(() => {
  mockedSend.mockReset()
  mockedSend.mockResolvedValue({ ok: true, id: "msg_1" })
})

describe("sendPickupCoordinationUserMail", () => {
  it("envoie au client avec le numéro de facture en objet", async () => {
    await sendPickupCoordinationUserMail(params)

    expect(mockedSend).toHaveBeenCalledOnce()
    const arg = mockedSend.mock.calls[0][0]
    expect(arg.to).toBe("client@test.local")
    expect(arg.subject).toContain("INV-2026-000009")
  })

  it("liste les œuvres à retirer", async () => {
    await sendPickupCoordinationUserMail(params)

    const html = mockedSend.mock.calls[0][0].html
    expect(html).toContain("Crépuscule")
    expect(html).toContain("Aurore")
  })

  it("échappe le HTML des titres", async () => {
    await sendPickupCoordinationUserMail({
      ...params,
      artworkTitles: ["<script>alert(1)</script>"],
    })

    const html = mockedSend.mock.calls[0][0].html
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("propage le résultat de sendEmail", async () => {
    mockedSend.mockResolvedValue({ ok: false, error: "boom" })
    const res = await sendPickupCoordinationUserMail(params)
    expect(res).toEqual({ ok: false, error: "boom" })
  })
})
