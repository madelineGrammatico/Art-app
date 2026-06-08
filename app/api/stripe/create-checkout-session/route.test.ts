import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import type Stripe from "stripe"

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
import { createUser, createArtwork, createAddress } from "@/src/test/factories"
import { sessionFor } from "@/src/test/auth-mock"

const mockedAuth = vi.mocked(auth)
const mockedCreateSession = vi.mocked(stripe.checkout.sessions.create)

async function createBasketWithItems(userId: string, artworkIds: string[]) {
  return prisma.basket.create({
    data: {
      userId,
      items: { create: artworkIds.map((artworkId) => ({ artworkId })) },
    },
  })
}

function makeReq(body: unknown = {}) {
  return new NextRequest("http://localhost/api/stripe/create-checkout-session", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  mockedAuth.mockReset()
  mockedCreateSession.mockReset()
})

describe("POST /api/stripe/create-checkout-session", () => {
  it("returns 401 when no session", async () => {
    mockedAuth.mockResolvedValue(null as never)

    const res = await POST(makeReq())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Non autorisé" })
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("returns 400 when billing or shipping addressId is missing in body", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await POST(makeReq({ billingAddressId: "abc" }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/adresse/i)
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("returns 400 when the request body is not valid JSON", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await POST(makeReq("not-json"))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/JSON/i)
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("returns 400 when the user has no basket or an empty basket", async () => {
    const user = await createUser()
    const addr = await createAddress({ userId: user.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await POST(
      makeReq({ billingAddressId: addr.id, shippingAddressId: addr.id })
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Aucune commande en attente" })
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("returns 400 when at least one basket artwork is no longer available", async () => {
    const buyer = await createUser()
    const other = await createUser()
    const addr = await createAddress({ userId: buyer.id })
    const available = await createArtwork({ price: 100 })
    const sold = await createArtwork({ price: 200, ownerId: other.id })
    await createBasketWithItems(buyer.id, [available.id, sold.id])
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await POST(
      makeReq({ billingAddressId: addr.id, shippingAddressId: addr.id })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/n'est plus disponible/)
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("returns 400 when the billing address belongs to another user", async () => {
    const buyer = await createUser()
    const stranger = await createUser()
    const otherAddr = await createAddress({ userId: stranger.id })
    const ownAddr = await createAddress({ userId: buyer.id })
    const artwork = await createArtwork({ price: 100 })
    await createBasketWithItems(buyer.id, [artwork.id])
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await POST(
      makeReq({ billingAddressId: otherAddr.id, shippingAddressId: ownAddr.id })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/adresse/i)
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("returns 400 when the shipping address belongs to another user", async () => {
    const buyer = await createUser()
    const stranger = await createUser()
    const otherAddr = await createAddress({ userId: stranger.id })
    const ownAddr = await createAddress({ userId: buyer.id })
    const artwork = await createArtwork({ price: 100 })
    await createBasketWithItems(buyer.id, [artwork.id])
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await POST(
      makeReq({ billingAddressId: ownAddr.id, shippingAddressId: otherAddr.id })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/adresse/i)
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("creates a Stripe session with cents amounts + artworkIds + address blobs in metadata, without writing to DB", async () => {
    const buyer = await createUser()
    const billing = await createAddress({
      userId: buyer.id,
      street: "10 avenue Foch",
      postalCode: "75116",
      city: "Paris",
      country: "France",
    })
    const shipping = await createAddress({
      userId: buyer.id,
      street: "20 rue de Lyon",
      postalCode: "69001",
      city: "Lyon",
      country: "France",
    })
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 249.99 })
    await createBasketWithItems(buyer.id, [a1.id, a2.id])
    mockedAuth.mockResolvedValue(
      sessionFor({ id: buyer.id, email: "buyer@test.local" }) as never
    )
    mockedCreateSession.mockResolvedValue({
      id: "cs_test_created",
      url: "https://checkout.stripe.com/test_session",
    } as never)

    const res = await POST(
      makeReq({ billingAddressId: billing.id, shippingAddressId: shipping.id })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.com/test_session",
      sessionId: "cs_test_created",
    })

    expect(mockedCreateSession).toHaveBeenCalledOnce()
    const callArg = mockedCreateSession.mock.calls[0]![0] as Stripe.Checkout.SessionCreateParams
    expect(callArg.mode).toBe("payment")
    expect(callArg.customer_email).toBe("buyer@test.local")
    expect(callArg.payment_intent_data?.receipt_email).toBe("buyer@test.local")
    expect(callArg.line_items).toHaveLength(2)
    const amounts = callArg.line_items!.map((li) => li.price_data!.unit_amount)
    expect(amounts).toContain(10000)
    expect(amounts).toContain(24999)

    expect(callArg.metadata?.userId).toBe(buyer.id)
    const artworkIds = (callArg.metadata?.artworkIds as string).split(",").sort()
    expect(artworkIds).toEqual([a1.id, a2.id].sort())

    const billingBlob = JSON.parse(callArg.metadata?.billingAddress as string)
    expect(billingBlob).toEqual({
      id: billing.id,
      street: "10 avenue Foch",
      postalCode: "75116",
      city: "Paris",
      country: "France",
    })
    const shippingBlob = JSON.parse(callArg.metadata?.shippingAddress as string)
    expect(shippingBlob).toEqual({
      id: shipping.id,
      street: "20 rue de Lyon",
      postalCode: "69001",
      city: "Lyon",
      country: "France",
    })

    const invoices = await prisma.invoice.findMany({ where: { buyerId: buyer.id } })
    expect(invoices).toHaveLength(0)
  })

  it("returns 500 in production when no app URL is configured (NEXT_PUBLIC_APP_URL/VERCEL_URL)", async () => {
    const buyer = await createUser()
    const addr = await createAddress({ userId: buyer.id })
    const artwork = await createArtwork({ price: 100 })
    await createBasketWithItems(buyer.id, [artwork.id])
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "")
    vi.stubEnv("VERCEL_URL", "")
    vi.stubEnv("NODE_ENV", "production")

    try {
      const res = await POST(
        makeReq({ billingAddressId: addr.id, shippingAddressId: addr.id })
      )
      expect(res.status).toBe(500)
      expect(mockedCreateSession).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("returns 500 when Stripe rejects the session creation", async () => {
    const buyer = await createUser()
    const addr = await createAddress({ userId: buyer.id })
    const artwork = await createArtwork({ price: 100 })
    await createBasketWithItems(buyer.id, [artwork.id])
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)
    mockedCreateSession.mockRejectedValue(new Error("Stripe is down"))

    const res = await POST(
      makeReq({ billingAddressId: addr.id, shippingAddressId: addr.id })
    )

    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Erreur/)
  })
})
