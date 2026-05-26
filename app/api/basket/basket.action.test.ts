import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/src/lib/auth/auth", () => ({
  auth: vi.fn(),
}))

import {
  getBasketAction,
  addToBasketAction,
  removeFromBasketAction,
  clearBasketAction,
  confirmBasketAction,
} from "./basket.action"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { createUser, createArtwork, createBasketWithItem } from "@/src/test/factories"
import { sessionFor } from "@/src/test/auth-mock"

const mockedAuth = vi.mocked(auth)

beforeEach(() => {
  mockedAuth.mockReset()
})

describe("getBasketAction", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const user = await createUser()

    const res = await getBasketAction(user.id)

    expect(res).toEqual({ error: "non authorisé" })
  })

  it("rejects a user trying to read someone else's basket", async () => {
    const a = await createUser()
    const b = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: a.id }) as never)

    const res = await getBasketAction(b.id)

    expect(res).toEqual({ error: "non authorisé" })
  })

  it("allows an ADMIN to read another user's basket", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const target = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await getBasketAction(target.id)

    expect(res.error).toBeUndefined()
    expect(res.basket?.userId).toBe(target.id)
  })

  it("creates an empty basket if none exists", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await getBasketAction(user.id)

    expect(res.basket?.items).toEqual([])
    const stored = await prisma.basket.findUnique({ where: { userId: user.id } })
    expect(stored).not.toBeNull()
  })

  it("removes sold items from the basket and reports the count", async () => {
    const buyer = await createUser()
    const otherOwner = await createUser()
    const stillAvailable = await createArtwork()
    const alreadySold = await createArtwork({ ownerId: otherOwner.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    await prisma.basket.create({
      data: {
        userId: buyer.id,
        items: {
          create: [{ artworkId: stillAvailable.id }, { artworkId: alreadySold.id }],
        },
      },
    })

    const res = await getBasketAction(buyer.id)

    expect(res.removedItemsCount).toBe(1)
    expect(res.basket?.items).toHaveLength(1)
    expect(res.basket?.items[0].artworkId).toBe(stillAvailable.id)
  })
})

describe("addToBasketAction", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const res = await addToBasketAction("any", "any")
    expect(res).toEqual({ error: "non authorisé" })
  })

  it("rejects a user adding to someone else's basket", async () => {
    const a = await createUser()
    const b = await createUser()
    const artwork = await createArtwork()
    mockedAuth.mockResolvedValue(sessionFor({ id: a.id }) as never)

    const res = await addToBasketAction(b.id, artwork.id)

    expect(res).toEqual({ error: "non authorisé" })
  })

  it("rejects an ADMIN adding to someone else's basket (write actions are owner-only)", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const target = await createUser()
    const artwork = await createArtwork()
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await addToBasketAction(target.id, artwork.id)

    expect(res).toEqual({ error: "non authorisé" })
  })

  it("refuses to add an artwork that already has an owner", async () => {
    const buyer = await createUser()
    const owner = await createUser()
    const sold = await createArtwork({ ownerId: owner.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await addToBasketAction(buyer.id, sold.id)

    expect(res.error).toMatch(/n'est plus disponible/)
  })

  it("refuses to add the same artwork twice", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork()
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    await addToBasketAction(buyer.id, artwork.id)
    const second = await addToBasketAction(buyer.id, artwork.id)

    expect(second.error).toMatch(/déjà dans votre panier/)
  })

  it("adds the artwork and returns price as a number", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 42 })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await addToBasketAction(buyer.id, artwork.id)

    expect(res.error).toBeUndefined()
    expect(res.basketItem?.artwork.price).toBe(42)
    expect(typeof res.basketItem?.artwork.price).toBe("number")
  })
})

describe("removeFromBasketAction", () => {
  it("prevents a user from removing an item belonging to another user", async () => {
    const a = await createUser()
    const b = await createUser()
    const artwork = await createArtwork()
    const basket = await createBasketWithItem({ userId: b.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: a.id }) as never)

    const res = await removeFromBasketAction(a.id, basket.items[0].id)

    expect(res.error).toBe("non authorisé")
    const stillThere = await prisma.basketItem.findUnique({ where: { id: basket.items[0].id } })
    expect(stillThere).not.toBeNull()
  })

  it("rejects an ADMIN trying to clear another user's basket item", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const target = await createUser()
    const artwork = await createArtwork()
    const basket = await createBasketWithItem({ userId: target.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await removeFromBasketAction(admin.id, basket.items[0].id)

    expect(res.error).toBe("non authorisé")
  })

  it("removes the item when owned by the user", async () => {
    const user = await createUser()
    const artwork = await createArtwork()
    const basket = await createBasketWithItem({ userId: user.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await removeFromBasketAction(user.id, basket.items[0].id)

    expect(res).toEqual({ success: true })
    const gone = await prisma.basketItem.findUnique({ where: { id: basket.items[0].id } })
    expect(gone).toBeNull()
  })
})

describe("clearBasketAction", () => {
  it("rejects a user clearing someone else's basket", async () => {
    const a = await createUser()
    const b = await createUser()
    const artwork = await createArtwork()
    await createBasketWithItem({ userId: b.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: a.id }) as never)

    const res = await clearBasketAction(b.id)

    expect(res).toEqual({ error: "non authorisé" })
  })

  it("rejects an ADMIN clearing another user's basket", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const target = await createUser()
    const artwork = await createArtwork()
    await createBasketWithItem({ userId: target.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await clearBasketAction(target.id)

    expect(res).toEqual({ error: "non authorisé" })
  })

  it("empties the basket", async () => {
    const user = await createUser()
    const artwork = await createArtwork()
    await createBasketWithItem({ userId: user.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await clearBasketAction(user.id)

    expect(res).toEqual({ success: true })
    const items = await prisma.basketItem.findMany({ where: { basket: { userId: user.id } } })
    expect(items).toHaveLength(0)
  })
})

describe("confirmBasketAction", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const res = await confirmBasketAction("any")
    expect(res).toEqual({ error: "non authorisé" })
  })

  it("rejects a user confirming someone else's basket", async () => {
    const a = await createUser()
    const b = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: a.id }) as never)

    const res = await confirmBasketAction(b.id)

    expect(res).toEqual({ error: "non authorisé" })
  })

  it("rejects an ADMIN confirming another user's basket", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const target = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await confirmBasketAction(target.id)

    expect(res).toEqual({ error: "non authorisé" })
  })

  it("errors out when the basket does not exist", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await confirmBasketAction(user.id)

    expect(res.error).toMatch(/Panier non trouvé/)
  })

  it("errors out when the basket is empty", async () => {
    const user = await createUser()
    await prisma.basket.create({ data: { userId: user.id } })
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await confirmBasketAction(user.id)

    expect(res.error).toMatch(/panier est vide/)
  })

  it("errors out when at least one artwork is no longer available", async () => {
    const buyer = await createUser()
    const other = await createUser()
    const available = await createArtwork()
    const sold = await createArtwork({ ownerId: other.id })
    await prisma.basket.create({
      data: {
        userId: buyer.id,
        items: { create: [{ artworkId: available.id }, { artworkId: sold.id }] },
      },
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await confirmBasketAction(buyer.id)

    expect(res.error).toMatch(/n'est plus disponible/)
    const invoices = await prisma.invoice.findMany({ where: { buyerId: buyer.id } })
    expect(invoices).toHaveLength(0)
  })

  it("returns success + itemsCount when basket is valid (no DB write)", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 250 })
    await prisma.basket.create({
      data: {
        userId: buyer.id,
        items: { create: [{ artworkId: a1.id }, { artworkId: a2.id }] },
      },
    })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await confirmBasketAction(buyer.id)

    expect(res.success).toBe(true)
    expect(res.itemsCount).toBe(2)

    const invoices = await prisma.invoice.findMany({ where: { buyerId: buyer.id } })
    expect(invoices).toHaveLength(0)

    const stillInBasket = await prisma.basketItem.findMany({ where: { basket: { userId: buyer.id } } })
    expect(stillInBasket).toHaveLength(2)
  })
})
