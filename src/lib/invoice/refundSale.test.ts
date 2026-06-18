import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/src/lib/stripe/stripe", () => ({
  stripe: { refunds: { create: vi.fn() } },
  CURRENCY: "eur",
}))
vi.mock("@/src/lib/mail/creditNoteUserMail", () => ({
  sendCreditNoteUserMail: vi.fn(),
}))
// Rendu PDF mocké (testé séparément dans invoicePdf.test.ts).
vi.mock("./invoicePdf", () => ({
  renderInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-fake")),
}))

import { refundSale, RefundSaleError } from "./refundSale"
import { stripe } from "@/src/lib/stripe/stripe"
import { sendCreditNoteUserMail } from "@/src/lib/mail/creditNoteUserMail"
import { prisma } from "@/src/lib/prisma"
import { createUser, createArtwork, createSaleInvoice } from "@/src/test/factories"

const mockedRefund = vi.mocked(stripe.refunds.create)
const mockedMail = vi.mocked(sendCreditNoteUserMail)

beforeEach(() => {
  mockedRefund.mockReset()
  mockedRefund.mockResolvedValue({ id: "re_test" } as never)
  mockedMail.mockReset()
  mockedMail.mockResolvedValue({ ok: true, id: "msg" })
})

// Crée un acheteur + 1 œuvre lui appartenant + une facture de vente la référençant.
async function soldArtwork(opts: { price?: number; email?: string } = {}) {
  const buyer = await createUser({ email: opts.email ?? `buyer-${Math.random()}@test.local` })
  const artwork = await createArtwork({ price: opts.price ?? 250, ownerId: buyer.id })
  const sale = await createSaleInvoice({
    buyerId: buyer.id,
    stripePaymentIntentId: "pi_test",
    items: [{ artworkId: artwork.id, unitPriceHT: opts.price ?? 250 }],
  })
  return { buyer, artwork, sale }
}

describe("refundSale", () => {
  it("remboursement total : émet l'avoir, rembourse via Stripe, remet l'œuvre en vente, notifie", async () => {
    const { buyer, artwork, sale } = await soldArtwork({ price: 250, email: "jean@test.local" })

    const credit = await refundSale({ invoiceId: sale.id })

    expect(credit.type).toBe("CREDIT_NOTE")
    expect(credit.creditedInvoiceId).toBe(sale.id)
    expect(credit.stripeRefundId).toBe("re_test")
    expect(Number(credit.totalTTC)).toBe(-250)

    // Œuvre remise en vente.
    const after = await prisma.artwork.findUnique({ where: { id: artwork.id } })
    expect(after?.ownerId).toBeNull()

    // Stripe : montant en centimes + clé d'idempotence déterministe.
    expect(mockedRefund).toHaveBeenCalledOnce()
    expect(mockedRefund).toHaveBeenCalledWith(
      { payment_intent: "pi_test", amount: 25000 },
      { idempotencyKey: expect.stringMatching(new RegExp(`^credit-${sale.id}-[0-9a-f]{16}$`)) }
    )

    // Email avoir (montant présenté en positif).
    expect(mockedMail).toHaveBeenCalledOnce()
    expect(mockedMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jean@test.local",
        creditNoteNumber: credit.number,
        originalInvoiceNumber: sale.number,
        totalRefundEur: 250,
        refundedItems: [expect.objectContaining({ amountEur: 250 })],
        pdf: expect.any(Buffer),
      })
    )
  })

  it("remboursement partiel : ne crédite et ne remet en vente que les œuvres ciblées", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ price: 100, ownerId: buyer.id })
    const a2 = await createArtwork({ price: 300, ownerId: buyer.id })
    const sale = await createSaleInvoice({
      buyerId: buyer.id,
      stripePaymentIntentId: "pi_partial",
      items: [
        { artworkId: a1.id, unitPriceHT: 100 },
        { artworkId: a2.id, unitPriceHT: 300 },
      ],
    })

    const credit = await refundSale({ invoiceId: sale.id, artworkIds: [a1.id] })

    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: credit.id } })
    expect(lines).toHaveLength(1)
    expect(lines[0].artworkId).toBe(a1.id)
    expect(Number(credit.totalTTC)).toBe(-100)

    expect((await prisma.artwork.findUnique({ where: { id: a1.id } }))?.ownerId).toBeNull()
    expect((await prisma.artwork.findUnique({ where: { id: a2.id } }))?.ownerId).toBe(buyer.id)

    expect(mockedRefund).toHaveBeenCalledWith(
      { payment_intent: "pi_partial", amount: 10000 },
      { idempotencyKey: expect.stringMatching(new RegExp(`^credit-${sale.id}-[0-9a-f]{16}$`)) }
    )
  })

  it("garde anti-double-remboursement : une œuvre déjà créditée est rejetée sans appel Stripe", async () => {
    const { sale } = await soldArtwork()

    await refundSale({ invoiceId: sale.id })
    expect(mockedRefund).toHaveBeenCalledOnce()

    await expect(refundSale({ invoiceId: sale.id })).rejects.toBeInstanceOf(RefundSaleError)
    // Pas de second appel Stripe : la garde court-circuite avant le remboursement.
    expect(mockedRefund).toHaveBeenCalledOnce()
    // Un seul avoir au total.
    const creditNotes = await prisma.invoice.findMany({
      where: { type: "CREDIT_NOTE", creditedInvoiceId: sale.id },
    })
    expect(creditNotes).toHaveLength(1)
  })

  it("rejette (sans appeler Stripe) si la facture n'a pas de payment_intent", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 100, ownerId: buyer.id })
    const sale = await createSaleInvoice({
      buyerId: buyer.id,
      items: [{ artworkId: artwork.id, unitPriceHT: 100 }],
    })

    await expect(refundSale({ invoiceId: sale.id })).rejects.toBeInstanceOf(RefundSaleError)
    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("rejette (sans appeler Stripe) une œuvre absente de la facture", async () => {
    const { sale } = await soldArtwork()
    const stranger = await createArtwork({ price: 100 })

    await expect(
      refundSale({ invoiceId: sale.id, artworkIds: [stranger.id] })
    ).rejects.toBeInstanceOf(RefundSaleError)
    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("rejette une facture inexistante", async () => {
    await expect(refundSale({ invoiceId: "missing-id" })).rejects.toBeInstanceOf(RefundSaleError)
    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("email best-effort : un échec d'envoi n'annule pas le remboursement", async () => {
    const { artwork, sale } = await soldArtwork()
    mockedMail.mockRejectedValue(new Error("Resend down"))

    const credit = await refundSale({ invoiceId: sale.id })

    expect(credit.type).toBe("CREDIT_NOTE")
    expect((await prisma.artwork.findUnique({ where: { id: artwork.id } }))?.ownerId).toBeNull()
  })

  it("ne remet pas en vente une œuvre transférée à un autre propriétaire entre-temps", async () => {
    const { artwork, sale } = await soldArtwork()
    const newOwner = await createUser()
    await prisma.artwork.update({ where: { id: artwork.id }, data: { ownerId: newOwner.id } })

    const credit = await refundSale({ invoiceId: sale.id })

    expect(credit.type).toBe("CREDIT_NOTE")
    // L'avoir est bien émis, mais la propriété actuelle n'est pas écrasée.
    expect((await prisma.artwork.findUnique({ where: { id: artwork.id } }))?.ownerId).toBe(newOwner.id)
  })

  it("déduplique les artworkIds (pas de double débit ni d'insert en conflit)", async () => {
    const { artwork, sale } = await soldArtwork({ price: 100 })

    const credit = await refundSale({ invoiceId: sale.id, artworkIds: [artwork.id, artwork.id] })

    // Une seule ligne créditée, montant simple (pas doublé).
    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: credit.id } })
    expect(lines).toHaveLength(1)
    expect(Number(credit.totalTTC)).toBe(-100)
    expect(mockedRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 10000 }),
      expect.anything()
    )
  })

  it("rejette un artworkIds vide explicite (jamais un remboursement total accidentel)", async () => {
    const { sale } = await soldArtwork()

    await expect(refundSale({ invoiceId: sale.id, artworkIds: [] })).rejects.toBeInstanceOf(
      RefundSaleError
    )
    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("borne la clé d'idempotence Stripe (≤ 255 car.) même avec beaucoup d'œuvres", async () => {
    const buyer = await createUser()
    const arts = await Promise.all(
      Array.from({ length: 6 }, () => createArtwork({ price: 100, ownerId: buyer.id }))
    )
    const sale = await createSaleInvoice({
      buyerId: buyer.id,
      stripePaymentIntentId: "pi_many",
      items: arts.map((a) => ({ artworkId: a.id, unitPriceHT: 100 })),
    })

    await refundSale({ invoiceId: sale.id })

    const [, options] = mockedRefund.mock.calls[0] as unknown as [
      unknown,
      { idempotencyKey: string },
    ]
    expect(options.idempotencyKey.length).toBeLessThanOrEqual(255)
  })
})
