import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/src/lib/auth/auth", () => ({
  auth: vi.fn(),
}))

import { getUserInvoiceAction, getInvoiceAction } from "./invoice.action"
import { auth } from "@/src/lib/auth/auth"
import { createUser, createArtwork, createSaleInvoice } from "@/src/test/factories"
import { sessionFor } from "@/src/test/auth-mock"

const mockedAuth = vi.mocked(auth)

beforeEach(() => {
  mockedAuth.mockReset()
})

async function saleInvoiceFor(buyerId: string) {
  const artwork = await createArtwork()
  return createSaleInvoice({ buyerId, items: [{ artworkId: artwork.id }] })
}

describe("getUserInvoiceAction", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const res = await getUserInvoiceAction("any-user")
    expect((res as { error: string }).error).toBe("non authorisé")
  })

  it("returns an error when the user does not exist", async () => {
    const caller = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: caller.id }) as never)

    const res = await getUserInvoiceAction("missing-user-id")

    expect((res as { error: string }).error).toMatch(/Utilisateur non trouvé/)
  })

  it("rejects a CLIENT trying to read another user's invoices", async () => {
    const a = await createUser()
    const b = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: a.id }) as never)

    const res = await getUserInvoiceAction(b.id)

    expect((res as { error: string }).error).toBe("non authorisé")
  })

  it("allows a CLIENT to read their own invoices", async () => {
    const buyer = await createUser()
    await saleInvoiceFor(buyer.id)
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await getUserInvoiceAction(buyer.id)

    expect(Array.isArray(res)).toBe(true)
    expect((res as Array<{ buyerId: string }>).length).toBe(1)
    expect((res as Array<{ buyerId: string }>)[0].buyerId).toBe(buyer.id)
  })

  it("allows an ADMIN to read another user's invoices", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const target = await createUser()
    await saleInvoiceFor(target.id)
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await getUserInvoiceAction(target.id)

    expect(Array.isArray(res)).toBe(true)
    expect((res as Array<{ buyerId: string }>).length).toBe(1)
    expect((res as Array<{ buyerId: string }>)[0].buyerId).toBe(target.id)
  })
})

describe("getInvoiceAction", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const res = await getInvoiceAction("any-invoice")
    expect((res as { error: string }).error).toBe("non authorisé")
  })

  it("returns an error when the invoice does not exist", async () => {
    const caller = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: caller.id }) as never)

    const res = await getInvoiceAction("missing-invoice-id")

    expect((res as { error: string }).error).toMatch(/facture non trouvé/)
  })

  it("rejects a CLIENT trying to read another user's invoice", async () => {
    const buyer = await createUser()
    const stranger = await createUser()
    const invoice = await saleInvoiceFor(buyer.id)
    mockedAuth.mockResolvedValue(sessionFor({ id: stranger.id }) as never)

    const res = await getInvoiceAction(invoice.id)

    expect((res as { error: string }).error).toBe("non authorisé")
  })

  it("allows the buyer to read their own invoice (with line items)", async () => {
    const buyer = await createUser()
    const invoice = await saleInvoiceFor(buyer.id)
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await getInvoiceAction(invoice.id)

    expect((res as { id: string; buyerId: string }).id).toBe(invoice.id)
    expect((res as { id: string; buyerId: string }).buyerId).toBe(buyer.id)
    expect((res as { lineItems: unknown[] }).lineItems.length).toBe(1)
  })

  it("allows an ADMIN to read any invoice", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const buyer = await createUser()
    const invoice = await saleInvoiceFor(buyer.id)
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await getInvoiceAction(invoice.id)

    expect((res as { id: string }).id).toBe(invoice.id)
  })
})
