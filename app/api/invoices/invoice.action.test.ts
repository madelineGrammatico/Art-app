import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/src/lib/auth/auth", () => ({
  auth: vi.fn(),
}))
// refundSale est testé séparément (refundSale.test.ts) : ici on teste le wrapper
// (auth + RBAC + délégation), donc on le mocke.
vi.mock("@/src/lib/invoice/refundSale", () => ({
  refundSale: vi.fn(),
}))

import { getUserInvoiceAction, getInvoiceAction, refundSaleAction, archiveInvoiceAction } from "./invoice.action"
import { prisma } from "@/src/lib/prisma"
import { auth } from "@/src/lib/auth/auth"
import { refundSale } from "@/src/lib/invoice/refundSale"
import { createUser, createArtwork, createSaleInvoice } from "@/src/test/factories"
import { sessionFor } from "@/src/test/auth-mock"

const mockedAuth = vi.mocked(auth)
const mockedRefundSale = vi.mocked(refundSale)

beforeEach(() => {
  mockedAuth.mockReset()
  mockedRefundSale.mockReset()
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

  it("excludes archived (soft-deleted) invoices from the active list (US6.2)", async () => {
    const buyer = await createUser()
    const active = await saleInvoiceFor(buyer.id)
    const archived = await saleInvoiceFor(buyer.id)
    await prisma.invoice.update({ where: { id: archived.id }, data: { archivedAt: new Date() } })
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id }) as never)

    const res = await getUserInvoiceAction(buyer.id)

    expect(Array.isArray(res)).toBe(true)
    const ids = (res as Array<{ id: string }>).map((i) => i.id)
    expect(ids).toContain(active.id)
    expect(ids).not.toContain(archived.id)
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

describe("refundSaleAction", () => {
  const fakeCreditNote = {
    id: "cn-1",
    number: "CN-2026-000001",
    creditedInvoiceId: "inv-1",
    totalTTC: -250,
  }

  it("rejects unauthenticated requests without calling refundSale", async () => {
    mockedAuth.mockResolvedValue(null as never)

    const res = await refundSaleAction({ invoiceId: "inv-1" })

    expect((res as { error: string }).error).toBe("non authorisé")
    expect(mockedRefundSale).not.toHaveBeenCalled()
  })

  it("rejects a CLIENT (no refund:invoice permission) without calling refundSale", async () => {
    const client = await createUser()
    mockedAuth.mockResolvedValue(sessionFor({ id: client.id, role: "CLIENT" }) as never)

    const res = await refundSaleAction({ invoiceId: "inv-1" })

    expect((res as { error: string }).error).toBe("non authorisé")
    expect(mockedRefundSale).not.toHaveBeenCalled()
  })

  it("allows an ADMIN: delegates to refundSale and returns a serialized summary", async () => {
    const admin = await createUser({ role: "ADMIN" })
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)
    mockedRefundSale.mockResolvedValue(fakeCreditNote as never)

    const res = await refundSaleAction({ invoiceId: "inv-1", artworkIds: ["a1"] })

    expect(mockedRefundSale).toHaveBeenCalledWith({ invoiceId: "inv-1", artworkIds: ["a1"] })
    expect(res).toEqual({
      id: "cn-1",
      number: "CN-2026-000001",
      creditedInvoiceId: "inv-1",
      totalTTC: -250,
    })
  })

  it("surfaces a refundSale failure as an error message", async () => {
    const admin = await createUser({ role: "ADMIN" })
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)
    mockedRefundSale.mockRejectedValue(new Error("L'œuvre a déjà été remboursée (avoir existant)"))

    const res = await refundSaleAction({ invoiceId: "inv-1" })

    expect((res as { error: string }).error).toMatch(/déjà été remboursée/)
  })
})

describe("archiveInvoiceAction (soft-delete, US6.2)", () => {
  it("rejects unauthenticated requests", async () => {
    mockedAuth.mockResolvedValue(null as never)
    const res = await archiveInvoiceAction("inv-1")
    expect((res as { error: string }).error).toBe("non authorisé")
  })

  it("rejects a CLIENT (no delete:invoice permission)", async () => {
    const buyer = await createUser()
    const invoice = await saleInvoiceFor(buyer.id)
    mockedAuth.mockResolvedValue(sessionFor({ id: buyer.id, role: "CLIENT" }) as never)

    const res = await archiveInvoiceAction(invoice.id)

    expect((res as { error: string }).error).toBe("non authorisé")
    const after = await prisma.invoice.findUnique({ where: { id: invoice.id } })
    expect(after?.archivedAt).toBeNull()
  })

  it("returns an error when the invoice does not exist", async () => {
    const admin = await createUser({ role: "ADMIN" })
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await archiveInvoiceAction("missing-invoice-id")

    expect((res as { error: string }).error).toMatch(/facture non trouvé/)
  })

  it("ADMIN archives without hard-deleting: sets archivedAt, row persists", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const buyer = await createUser()
    const invoice = await saleInvoiceFor(buyer.id)
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await archiveInvoiceAction(invoice.id)

    expect((res as { id: string; archivedAt: string }).id).toBe(invoice.id)
    expect((res as { archivedAt: string }).archivedAt).toBeTruthy()

    // La pièce existe toujours (conservation), seulement marquée archivée.
    const after = await prisma.invoice.findUnique({ where: { id: invoice.id } })
    expect(after).not.toBeNull()
    expect(after?.archivedAt).not.toBeNull()
  })

  it("is idempotent: archiving an already-archived invoice keeps the original archivedAt", async () => {
    const admin = await createUser({ role: "ADMIN" })
    const buyer = await createUser()
    const invoice = await saleInvoiceFor(buyer.id)
    const firstDate = new Date("2026-01-01T00:00:00.000Z")
    await prisma.invoice.update({ where: { id: invoice.id }, data: { archivedAt: firstDate } })
    mockedAuth.mockResolvedValue(sessionFor({ id: admin.id, role: "ADMIN" }) as never)

    const res = await archiveInvoiceAction(invoice.id)

    expect((res as { archivedAt: string }).archivedAt).toBe(firstDate.toISOString())
    const after = await prisma.invoice.findUnique({ where: { id: invoice.id } })
    expect(after?.archivedAt?.toISOString()).toBe(firstDate.toISOString())
  })
})
