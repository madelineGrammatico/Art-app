import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/src/lib/auth/auth", () => ({ auth: vi.fn() }))
// Orchestration des devis mockée (testée dans cartShipping.test.ts) : ici on vérifie le
// câblage du endpoint d'affichage (offres par œuvre + titre, éligibilité, rejets).
vi.mock("@/src/lib/shipping/cartShipping", () => ({
  computeCartShipping: vi.fn(),
}))

import { POST } from "./route"
import { auth } from "@/src/lib/auth/auth"
import { computeCartShipping } from "@/src/lib/shipping/cartShipping"
import { prisma } from "@/src/lib/prisma"
import { createUser, createArtwork, createAddress } from "@/src/test/factories"
import { sessionFor } from "@/src/test/auth-mock"

const mockedAuth = vi.mocked(auth)
const mockedComputeShipping = vi.mocked(computeCartShipping)

async function createBasketWithItems(userId: string, artworkIds: string[]) {
  return prisma.basket.create({
    data: {
      userId,
      items: { create: artworkIds.map((artworkId) => ({ artworkId })) },
    },
  })
}

function makeReq(body: unknown = {}) {
  return new NextRequest("http://localhost/api/shipping/quote", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  mockedAuth.mockReset()
  mockedComputeShipping.mockReset()
})

describe("POST /api/shipping/quote", () => {
  it("returns 401 when no session", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const res = await POST(makeReq({ shippingAddressId: "a1" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when shippingAddressId is missing", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it("returns 400 when the address is not owned by the user", async () => {
    const user = await createUser()
    const other = await createUser()
    const address = await createAddress({ userId: other.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)
    const res = await POST(makeReq({ shippingAddressId: address.id }))
    expect(res.status).toBe(400)
  })

  it("returns per-artwork offers with the artwork title (US2.4 display)", async () => {
    const user = await createUser()
    const art = await createArtwork({ title: "Aurore", price: 100 })
    await createBasketWithItems(user.id, [art.id])
    const address = await createAddress({ userId: user.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)
    mockedComputeShipping.mockResolvedValue({
      eligible: true,
      quotesByArtwork: new Map([
        [
          art.id,
          [
            { shippingMethodId: "sc_a", label: "Colissimo", priceHTCents: 990 },
            { shippingMethodId: "sc_b", label: "Chronopost", priceHTCents: 1490 },
          ],
        ],
      ]),
    })

    const res = await POST(makeReq({ shippingAddressId: address.id }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.eligible).toBe(true)
    expect(body.quotes).toHaveLength(1)
    expect(body.quotes[0].artworkId).toBe(art.id)
    expect(body.quotes[0].artworkTitle).toBe("Aurore")
    expect(body.quotes[0].rates).toHaveLength(2)
  })

  it("returns eligible=false with blocking ids when delivery is impossible", async () => {
    const user = await createUser()
    const art = await createArtwork({ price: 100 })
    await createBasketWithItems(user.id, [art.id])
    const address = await createAddress({ userId: user.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)
    mockedComputeShipping.mockResolvedValue({
      eligible: false,
      blockingArtworkIds: [art.id],
    })

    const res = await POST(makeReq({ shippingAddressId: address.id }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.eligible).toBe(false)
    expect(body.blockingArtworkIds).toEqual([art.id])
  })

  it("returns 400 (never a 0 € fallback) when the carrier quote fails", async () => {
    const user = await createUser()
    const art = await createArtwork({ price: 100 })
    await createBasketWithItems(user.id, [art.id])
    const address = await createAddress({ userId: user.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)
    mockedComputeShipping.mockRejectedValue(new Error("Sendcloud timeout"))

    const res = await POST(makeReq({ shippingAddressId: address.id }))
    expect(res.status).toBe(400)
  })
})
