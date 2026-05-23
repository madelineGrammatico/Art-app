import { describe, it, expect, vi, beforeEach } from "vitest"
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
import { createUser, createArtwork } from "@/src/test/factories"
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

beforeEach(() => {
  mockedAuth.mockReset()
  mockedCreateSession.mockReset()
})

describe("POST /api/stripe/create-checkout-session", () => {
  it("returns 401 when no session", async () => {
    mockedAuth.mockResolvedValue(null as never)

    const res = await POST()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Non autorisé" })
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("returns 400 when the user has no basket or an empty basket", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await POST()

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Aucune commande en attente" })
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("returns 400 when at least one basket artwork is no longer available", async () => {
    const buyer = await createUser()
    const other = await createUser()
    const available = await createArtwork({ price: 100 })
    const sold = await createArtwork({ price: 200, ownerId: other.id })
    await createBasketWithItems(buyer.id, [available.id, sold.id])
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await POST()

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/n'est plus disponible/)
    expect(mockedCreateSession).not.toHaveBeenCalled()
  })

  it("creates a Stripe session with cents amounts + artworkIds in metadata, without writing to DB", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 249.99 })
    await createBasketWithItems(buyer.id, [a1.id, a2.id])
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id, email: "buyer@test.local" }) as never)
    mockedCreateSession.mockResolvedValue({
      id: "cs_test_created",
      url: "https://checkout.stripe.com/test_session",
    } as never)

    const res = await POST()

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

    const invoices = await prisma.invoice.findMany({ where: { buyerId: buyer.id } })
    expect(invoices).toHaveLength(0)
  })

  it("returns 500 when Stripe rejects the session creation", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 100 })
    await createBasketWithItems(buyer.id, [artwork.id])
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)
    mockedCreateSession.mockRejectedValue(new Error("Stripe is down"))

    const res = await POST()

    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Erreur/)
  })
})
