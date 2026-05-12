import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/src/lib/auth/auth", () => ({ auth: vi.fn() }))
vi.mock("@/src/lib/stripe/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn() } },
  },
  CURRENCY: "eur",
}))

import { POST } from "./route"
import { auth } from "@/src/lib/auth/auth"
import { stripe } from "@/src/lib/stripe/stripe"
import { prisma } from "@/src/lib/prisma"
import { createUser, createArtwork, createPendingInvoice } from "@/src/test/factories"
import { sessionFor } from "@/src/test/auth-mock"

const mockedAuth = vi.mocked(auth)
const mockedCreateSession = vi.mocked(stripe.checkout.sessions.create)

function makeRequest() {
  return new NextRequest("http://localhost/api/stripe/create-checkout-session", { method: "POST" })
}

beforeEach(() => {
  mockedAuth.mockReset()
  mockedCreateSession.mockReset()
})

describe("POST /api/stripe/create-checkout-session", () => {
  it("returns 401 when no session", async () => {
    mockedAuth.mockResolvedValue(null as never)

    const res = await POST(makeRequest())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Non autorisé" })
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("returns 400 when the user has no PENDING invoices", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await POST(makeRequest())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Aucune commande en attente" })
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("returns 400 when at least one artwork is no longer available", async () => {
    const buyer = await createUser()
    const other = await createUser()
    const available = await createArtwork({ price: 100 })
    const sold = await createArtwork({ price: 200, ownerId: other.id })
    await createPendingInvoice({ buyerId: buyer.id, artworkId: available.id, amount: 100 })
    await createPendingInvoice({ buyerId: buyer.id, artworkId: sold.id, amount: 200 })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await POST(makeRequest())

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/n'est plus disponible/)
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("creates a Stripe session with amounts converted to cents and saves the sessionId on invoices", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 249.99 })
    const inv1 = await createPendingInvoice({ buyerId: buyer.id, artworkId: a1.id, amount: 100 })
    const inv2 = await createPendingInvoice({ buyerId: buyer.id, artworkId: a2.id, amount: 249.99 })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id, email: "buyer@test.local" }) as never)
    mockedCreateSession.mockResolvedValue({
      id: "cs_test_created",
      url: "https://checkout.stripe.com/test_session",
    } as never)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.com/test_session",
      sessionId: "cs_test_created",
    })

    expect(mockedCreateSession).toHaveBeenCalledOnce()
    const callArg = mockedCreateSession.mock.calls[0][0]
    expect(callArg.mode).toBe("payment")
    expect(callArg.customer_email).toBe("buyer@test.local")
    expect(callArg.line_items).toHaveLength(2)
    const amounts = callArg.line_items!.map((li) => (li as { price_data: { unit_amount: number } }).price_data.unit_amount)
    expect(amounts).toContain(10000)
    expect(amounts).toContain(24999)

    const updated = await prisma.invoice.findMany({
      where: { id: { in: [inv1.id, inv2.id] } },
    })
    expect(updated.every((i) => i.stripeSessionId === "cs_test_created")).toBe(true)
  })

  it("returns 500 when Stripe rejects the session creation", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 100 })
    await createPendingInvoice({ buyerId: buyer.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)
    mockedCreateSession.mockRejectedValue(new Error("Stripe is down"))

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Erreur/)
  })
})
