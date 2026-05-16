import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/src/lib/auth/auth", () => ({
  auth: vi.fn(),
}))

import {
  createInvoiceAction,
  getUserIvoiceAction,
  getIvoiceAction,
  updateIvoiceAction,
} from "./route"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { createUser, createArtwork, createPendingInvoice } from "@/src/test/factories"
import { sessionFor } from "@/src/test/auth-mock"

const mockedAuth = vi.mocked(auth)

beforeEach(() => {
  mockedAuth.mockReset()
})

describe("createInvoiceAction", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const res = await createInvoiceAction("any-user", "any-artwork")
    expect((res as { error: Error }).error.message).toBe("non authorisé")
  })

  it("returns an error when the artwork does not exist", async () => {
    const user = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: user.id }) as never)

    const res = await createInvoiceAction(user.id, "missing-artwork-id")

    expect((res as { error: Error }).error.message).toMatch(/oeuvre non trouvé/)
  })

  it("creates a PENDING invoice tied to the artwork's price", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 175 })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await createInvoiceAction(buyer.id, artwork.id)

    expect("error" in res).toBe(false)
    const stored = await prisma.invoice.findFirst({ where: { buyerId: buyer.id } })
    expect(stored).not.toBeNull()
    expect(stored?.status).toBe("PENDING")
    expect(stored?.artworkId).toBe(artwork.id)
    expect(Number(stored?.amount)).toBe(175)
  })
})

describe("getUserIvoiceAction", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const res = await getUserIvoiceAction("any-user")
    expect((res as { error: Error }).error.message).toBe("non authorisé")
  })

  it("returns an error when the user does not exist", async () => {
    const caller = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: caller.id }) as never)

    const res = await getUserIvoiceAction("missing-user-id")

    expect((res as { error: Error }).error.message).toMatch(/Utilisateur non trouvé/)
  })

  it("rejects a CLIENT trying to read another user's invoices", async () => {
    const a = await createUser()
    const b = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: a.id }) as never)

    const res = await getUserIvoiceAction(b.id)

    expect((res as { error: Error }).error.message).toBe("non authorisé")
  })

  it("allows a CLIENT to read their own invoices", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork()
    await createPendingInvoice({ buyerId: buyer.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await getUserIvoiceAction(buyer.id)

    expect(Array.isArray(res)).toBe(true)
    expect((res as Array<{ buyerId: string }>).length).toBe(1)
    expect((res as Array<{ buyerId: string }>)[0].buyerId).toBe(buyer.id)
  })

  it("allows an ADMIN to read another user's invoices", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const target = await createUser()
    const artwork = await createArtwork()
    await createPendingInvoice({ buyerId: target.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await getUserIvoiceAction(target.id)

    expect(Array.isArray(res)).toBe(true)
    expect((res as Array<{ buyerId: string }>).length).toBe(1)
    expect((res as Array<{ buyerId: string }>)[0].buyerId).toBe(target.id)
  })
})

describe("getIvoiceAction", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const res = await getIvoiceAction("any-invoice")
    expect((res as { error: Error }).error.message).toBe("non authorisé")
  })

  it("returns an error when the invoice does not exist", async () => {
    const caller = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: caller.id }) as never)

    const res = await getIvoiceAction("missing-invoice-id")

    expect((res as { error: Error }).error.message).toMatch(/facture non trouvé/)
  })

  it("rejects a CLIENT trying to read another user's invoice", async () => {
    const buyer = await createUser()
    const stranger = await createUser()
    const artwork = await createArtwork()
    const invoice = await createPendingInvoice({ buyerId: buyer.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: stranger.id }) as never)

    const res = await getIvoiceAction(invoice.id)

    expect((res as { error: Error }).error.message).toBe("non authorisé")
  })

  it("allows the buyer to read their own invoice", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork()
    const invoice = await createPendingInvoice({ buyerId: buyer.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await getIvoiceAction(invoice.id)

    expect((res as { id: string; buyerId: string }).id).toBe(invoice.id)
    expect((res as { id: string; buyerId: string }).buyerId).toBe(buyer.id)
  })

  it("allows an ADMIN to read any invoice", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const buyer = await createUser()
    const artwork = await createArtwork()
    const invoice = await createPendingInvoice({ buyerId: buyer.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await getIvoiceAction(invoice.id)

    expect((res as { id: string }).id).toBe(invoice.id)
  })
})

describe("updateIvoiceAction", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const res = await updateIvoiceAction("any-invoice", "PAID")
    expect((res as { error: Error }).error.message).toBe("non authorisé")
  })

  it("rejects a CLIENT (even on their own invoice)", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork()
    const invoice = await createPendingInvoice({ buyerId: buyer.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await updateIvoiceAction(invoice.id, "PAID")

    expect((res as { error: Error }).error.message).toBe("non authorisé")
    const unchanged = await prisma.invoice.findUnique({ where: { id: invoice.id } })
    expect(unchanged?.status).toBe("PENDING")
  })

  it("allows an ADMIN to update an invoice's status", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const buyer = await createUser()
    const artwork = await createArtwork()
    const invoice = await createPendingInvoice({ buyerId: buyer.id, artworkId: artwork.id })
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await updateIvoiceAction(invoice.id, "PAID")

    expect((res as { id: string; status: string }).status).toBe("PAID")
    const stored = await prisma.invoice.findUnique({ where: { id: invoice.id } })
    expect(stored?.status).toBe("PAID")
  })
})
