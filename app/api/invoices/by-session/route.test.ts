import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/src/lib/auth/auth", () => ({
  auth: vi.fn(),
}))

import { GET } from "./route"
import { auth } from "@/src/lib/auth/auth"
import {
  createUser,
  createArtwork,
  createSaleInvoice,
  createRefundRecovery,
} from "@/src/test/factories"
import { sessionFor } from "@/src/test/auth-mock"

const mockedAuth = vi.mocked(auth)

function makeRequest(sessionId?: string) {
  const url = sessionId
    ? `http://localhost/api/invoices/by-session?sessionId=${sessionId}`
    : "http://localhost/api/invoices/by-session"
  return new NextRequest(url, { method: "GET" })
}

beforeEach(() => {
  mockedAuth.mockReset()
})

describe("GET /api/invoices/by-session", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)

    const res = await GET(makeRequest("cs_test"))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Non autorisé" })
  })

  it("returns 400 when sessionId is missing", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "sessionId manquant" })
  })

  it("returns empty list when nothing matches the session", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest("cs_test_nothing"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      invoices: [],
      shipping: { lines: [], total: 0 },
      fulfillmentMode: null,
    })
  })

  it("returns purchased line items (PAID) for the session, with numeric prices", async () => {
    const user = await createUser()
    const a1 = await createArtwork({ price: 150 })
    const a2 = await createArtwork({ price: 250 })
    const sessionId = "cs_test_paid"
    await createSaleInvoice({
      buyerId: user.id,
      stripeSessionId: sessionId,
      items: [
        { artworkId: a1.id, unitPriceHT: 150 },
        { artworkId: a2.id, unitPriceHT: 250 },
      ],
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invoices).toHaveLength(2)
    expect(body.invoices.every((i: { status: string }) => i.status === "PAID")).toBe(true)
    expect(typeof body.invoices[0].amount).toBe("number")
    expect(typeof body.invoices[0].artwork.price).toBe("number")
    const ids = body.invoices.map((i: { artwork: { id: string } }) => i.artwork.id).sort()
    expect(ids).toEqual([a1.id, a2.id].sort())
  })

  it("does not leak items belonging to other users", async () => {
    const me = await createUser()
    const other = await createUser()
    const artwork = await createArtwork()
    const sessionId = "cs_test_leak"
    await createSaleInvoice({
      buyerId: other.id,
      stripeSessionId: sessionId,
      items: [{ artworkId: artwork.id }],
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: me.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      invoices: [],
      shipping: { lines: [], total: 0 },
      fulfillmentMode: null,
    })
  })

  it("surface le port comme ligne distincte (libellé transporteur), pas comme une œuvre en plus (#8/#9)", async () => {
    const user = await createUser()
    const art = await createArtwork({ price: 250 })
    const sessionId = "cs_test_shipping_line"
    await createSaleInvoice({
      buyerId: user.id,
      stripeSessionId: sessionId,
      fulfillmentMode: "DELIVERY",
      items: [
        { artworkId: art.id, unitPriceHT: 250, label: "Crépuscule", shipping: { unitPriceHT: 12 } },
      ],
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    const body = await res.json()
    // Une seule œuvre achetée (la ligne SHIPPING n'est pas comptée comme œuvre).
    expect(body.invoices).toHaveLength(1)
    expect(body.invoices[0].artwork.id).toBe(art.id)
    // Le port est à part, avec le libellé transporteur — pas le titre de l'œuvre.
    expect(body.shipping.lines).toHaveLength(1)
    expect(body.shipping.total).toBe(12)
    expect(body.shipping.lines[0].label).not.toBe("Crépuscule")
    expect(body.fulfillmentMode).toBe("DELIVERY")
  })

  it("includes refunded-at-checkout items (REFUNDED) alongside purchased ones", async () => {
    const user = await createUser()
    const paidArt = await createArtwork({ price: 100 })
    const refundedArt = await createArtwork({ price: 200 })
    const sessionId = "cs_test_mixed"
    await createSaleInvoice({
      buyerId: user.id,
      stripeSessionId: sessionId,
      items: [{ artworkId: paidArt.id, unitPriceHT: 100 }],
    })
    await createRefundRecovery({
      buyerId: user.id,
      artworkId: refundedArt.id,
      stripeSessionId: sessionId,
      amount: 200,
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invoices).toHaveLength(2)
    const statuses = body.invoices.map((i: { status: string }) => i.status).sort()
    expect(statuses).toEqual(["PAID", "REFUNDED"])
  })

  it("returns only refunded items when the whole order was refunded (no sale invoice)", async () => {
    const user = await createUser()
    const artwork = await createArtwork({ price: 180 })
    const sessionId = "cs_test_full_refund"
    await createRefundRecovery({
      buyerId: user.id,
      artworkId: artwork.id,
      stripeSessionId: sessionId,
      amount: 180,
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invoices).toHaveLength(1)
    expect(body.invoices[0].status).toBe("REFUNDED")
    expect(body.invoices[0].amount).toBe(180)
  })

  it("does not leak another user's refunded items", async () => {
    const me = await createUser()
    const other = await createUser()
    const artwork = await createArtwork({ price: 90 })
    const sessionId = "cs_test_refund_leak"
    await createRefundRecovery({
      buyerId: other.id,
      artworkId: artwork.id,
      stripeSessionId: sessionId,
      amount: 90,
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: me.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      invoices: [],
      shipping: { lines: [], total: 0 },
      fulfillmentMode: null,
    })
  })
})
