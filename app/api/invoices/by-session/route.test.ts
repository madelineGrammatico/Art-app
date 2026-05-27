import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/src/lib/auth/auth", () => ({
  auth: vi.fn(),
}))

import { GET } from "./route"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { createUser, createArtwork } from "@/src/test/factories"
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

  it("returns empty list when no invoice matches the session", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest("cs_test_nothing"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ invoices: [] })
  })

  it("returns PAID invoices for the auth user filtered by sessionId, with numeric prices", async () => {
    const user = await createUser()
    const a1 = await createArtwork({ price: 150 })
    const a2 = await createArtwork({ price: 250 })
    const sessionId = "cs_test_paid"
    await prisma.invoice.create({
      data: {
        buyerId: user.id,
        artworkId: a1.id,
        amount: 150,
        status: "PAID",
        stripeSessionId: sessionId,
      },
    })
    await prisma.invoice.create({
      data: {
        buyerId: user.id,
        artworkId: a2.id,
        amount: 250,
        status: "PAID",
        stripeSessionId: sessionId,
      },
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invoices).toHaveLength(2)
    expect(typeof body.invoices[0].amount).toBe("number")
    expect(typeof body.invoices[0].artwork.price).toBe("number")
    const titles = body.invoices.map((i: { artwork: { id: string } }) => i.artwork.id).sort()
    expect(titles).toEqual([a1.id, a2.id].sort())
  })

  it("does not leak invoices belonging to other users", async () => {
    const me = await createUser()
    const other = await createUser()
    const artwork = await createArtwork()
    const sessionId = "cs_test_leak"
    await prisma.invoice.create({
      data: {
        buyerId: other.id,
        artworkId: artwork.id,
        amount: 100,
        status: "PAID",
        stripeSessionId: sessionId,
      },
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: me.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ invoices: [] })
  })

  it("includes REFUNDED invoices alongside PAID (mixed scenario)", async () => {
    const user = await createUser()
    const paidArt = await createArtwork({ price: 100 })
    const refundedArt = await createArtwork({ price: 200 })
    const sessionId = "cs_test_mixed"
    await prisma.invoice.create({
      data: {
        buyerId: user.id,
        artworkId: paidArt.id,
        amount: 100,
        status: "PAID",
        stripeSessionId: sessionId,
      },
    })
    await prisma.invoice.create({
      data: {
        buyerId: user.id,
        artworkId: refundedArt.id,
        amount: 200,
        status: "REFUNDED",
        stripeSessionId: sessionId,
      },
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invoices).toHaveLength(2)
    const statuses = body.invoices.map((i: { status: string }) => i.status).sort()
    expect(statuses).toEqual(["PAID", "REFUNDED"])
  })

  it("returns only REFUNDED invoices when the whole order was refunded", async () => {
    const user = await createUser()
    const artwork = await createArtwork({ price: 180 })
    const sessionId = "cs_test_full_refund"
    await prisma.invoice.create({
      data: {
        buyerId: user.id,
        artworkId: artwork.id,
        amount: 180,
        status: "REFUNDED",
        stripeSessionId: sessionId,
      },
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.invoices).toHaveLength(1)
    expect(body.invoices[0].status).toBe("REFUNDED")
    expect(body.invoices[0].amount).toBe(180)
  })

  it("filters out PENDING and CANCELLED invoices (only PAID and REFUNDED relevant for success page)", async () => {
    const user = await createUser()
    const a1 = await createArtwork()
    const a2 = await createArtwork()
    const sessionId = "cs_test_status_filter"
    await prisma.invoice.create({
      data: {
        buyerId: user.id,
        artworkId: a1.id,
        amount: 100,
        status: "PENDING",
        stripeSessionId: sessionId,
      },
    })
    await prisma.invoice.create({
      data: {
        buyerId: user.id,
        artworkId: a2.id,
        amount: 100,
        status: "CANCELLED",
        stripeSessionId: sessionId,
      },
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await GET(makeRequest(sessionId))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ invoices: [] })
  })
})
