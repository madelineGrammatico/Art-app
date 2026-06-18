import { describe, it, expect } from "vitest"

import { emitCreditNote } from "./emitCreditNote"
import { prisma } from "@/src/lib/prisma"
import { createUser, createArtwork, createSaleInvoice } from "@/src/test/factories"

// emitCreditNote copie son snapshot depuis la facture d'origine (immuabilité légale),
// pas depuis getSellerConfig → aucun mock de config nécessaire ici.
const emitCredit = (args: Parameters<typeof emitCreditNote>[1]) =>
  prisma.$transaction((tx) => emitCreditNote(tx, args))

describe("emitCreditNote", () => {
  it("émet un avoir CREDIT_NOTE numéroté, référençant la facture de vente (US5.1)", async () => {
    const buyer = await createUser()
    const art = await createArtwork({ title: "Crépuscule", price: 200 })
    const sale = await createSaleInvoice({
      buyerId: buyer.id,
      items: [{ artworkId: art.id, unitPriceHT: 200, label: "Crépuscule" }],
    })

    const credit = await emitCredit({
      originalInvoiceId: sale.id,
      items: [{ artworkId: art.id }],
      stripeRefundId: "re_1",
      saleDate: new Date("2026-04-01"),
    })

    expect(credit.type).toBe("CREDIT_NOTE")
    expect(credit.number).toBe("CN-2026-000001")
    expect(credit.creditedInvoiceId).toBe(sale.id)
    expect(credit.stripeRefundId).toBe("re_1")
    expect(credit.buyerId).toBe(buyer.id)
    // saleDate de l'avoir = date du remboursement (spec §1).
    expect(credit.saleDate.toISOString().slice(0, 10)).toBe("2026-04-01")
  })

  it("porte des montants négatifs (crédit) au niveau lignes et totaux (US5.1)", async () => {
    const buyer = await createUser()
    const art = await createArtwork({ price: 200 })
    const sale = await createSaleInvoice({
      buyerId: buyer.id,
      items: [{ artworkId: art.id, unitPriceHT: 200 }],
    })

    const credit = await emitCredit({
      originalInvoiceId: sale.id,
      items: [{ artworkId: art.id }],
      stripeRefundId: "re_neg",
      saleDate: new Date("2026-04-01"),
    })

    expect(Number(credit.totalHT)).toBe(-200)
    expect(Number(credit.totalVat)).toBe(0)
    expect(Number(credit.totalTTC)).toBe(-200)

    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: credit.id } })
    expect(lines).toHaveLength(1)
    expect(lines[0].artworkId).toBe(art.id)
    expect(Number(lines[0].unitPriceHT)).toBe(-200)
    expect(Number(lines[0].vatAmount)).toBe(0)
    expect(Number(lines[0].lineTTC)).toBe(-200)
  })

  it("copie le snapshot vendeur, l'identité et l'adresse acheteur depuis la facture d'origine (US0.2)", async () => {
    const buyer = await createUser()
    const art = await createArtwork({ price: 200 })
    const sale = await createSaleInvoice({
      buyerId: buyer.id,
      buyerName: "Jean Acheteur",
      items: [{ artworkId: art.id, unitPriceHT: 200 }],
      billing: { street: "10 av Foch", postalCode: "75116", city: "Paris", country: "France" },
    })

    const credit = await emitCredit({
      originalInvoiceId: sale.id,
      items: [{ artworkId: art.id }],
      stripeRefundId: "re_snap",
      saleDate: new Date("2026-04-01"),
    })

    expect(credit.sellerName).toBe(sale.sellerName)
    expect(credit.sellerSiret).toBe(sale.sellerSiret)
    expect(credit.vatRegime).toBe(sale.vatRegime)
    expect(credit.legalMention).toBe(sale.legalMention)
    expect(credit.buyerName).toBe("Jean Acheteur")
    expect(credit.billingCity).toBe("Paris")
    expect(credit.billingStreet).toBe("10 av Foch")
  })

  it("remboursement partiel : seules les œuvres remboursées apparaissent (US5.2)", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ title: "A1", price: 100 })
    const a2 = await createArtwork({ title: "A2", price: 300 })
    const sale = await createSaleInvoice({
      buyerId: buyer.id,
      items: [
        { artworkId: a1.id, unitPriceHT: 100, label: "A1" },
        { artworkId: a2.id, unitPriceHT: 300, label: "A2" },
      ],
    })

    const credit = await emitCredit({
      originalInvoiceId: sale.id,
      items: [{ artworkId: a1.id }],
      stripeRefundId: "re_partial",
      saleDate: new Date("2026-04-01"),
    })

    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: credit.id } })
    expect(lines).toHaveLength(1)
    expect(lines[0].artworkId).toBe(a1.id)
    expect(Number(credit.totalTTC)).toBe(-100)
    // Net réellement encaissé = Σ(vente) − Σ(avoirs).
    expect(Number(sale.totalTTC) + Number(credit.totalTTC)).toBe(300)
  })

  it("laisse la facture de vente d'origine strictement inchangée (US5.1)", async () => {
    const buyer = await createUser()
    const art = await createArtwork({ price: 200 })
    const sale = await createSaleInvoice({
      buyerId: buyer.id,
      items: [{ artworkId: art.id, unitPriceHT: 200 }],
    })

    await emitCredit({
      originalInvoiceId: sale.id,
      items: [{ artworkId: art.id }],
      stripeRefundId: "re_immut",
      saleDate: new Date("2026-04-01"),
    })

    const after = await prisma.invoice.findUnique({
      where: { id: sale.id },
      include: { lineItems: true },
    })
    expect(after?.number).toBe(sale.number)
    expect(after?.type).toBe("SALE")
    expect(Number(after?.totalTTC)).toBe(200)
    expect(after?.lineItems).toHaveLength(1)
    expect(Number(after?.lineItems[0].unitPriceHT)).toBe(200)
  })

  it("numérote la série CN sans trou (gapless) (US5.1)", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 100 })
    const sale1 = await createSaleInvoice({ buyerId: buyer.id, items: [{ artworkId: a1.id }] })
    const sale2 = await createSaleInvoice({ buyerId: buyer.id, items: [{ artworkId: a2.id }] })

    const c1 = await emitCredit({
      originalInvoiceId: sale1.id,
      items: [{ artworkId: a1.id }],
      stripeRefundId: "re_seq_1",
      saleDate: new Date("2026-04-01"),
    })
    const c2 = await emitCredit({
      originalInvoiceId: sale2.id,
      items: [{ artworkId: a2.id }],
      stripeRefundId: "re_seq_2",
      saleDate: new Date("2026-04-02"),
    })

    expect(c1.number).toBe("CN-2026-000001")
    expect(c2.number).toBe("CN-2026-000002")
  })

  it("idempotence : un même stripeRefundId ne crée jamais 2 avoirs (US5.3)", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 100 })
    const sale1 = await createSaleInvoice({ buyerId: buyer.id, items: [{ artworkId: a1.id }] })
    const sale2 = await createSaleInvoice({ buyerId: buyer.id, items: [{ artworkId: a2.id }] })

    await emitCredit({
      originalInvoiceId: sale1.id,
      items: [{ artworkId: a1.id }],
      stripeRefundId: "re_dup",
      saleDate: new Date("2026-04-01"),
    })

    await expect(
      emitCredit({
        originalInvoiceId: sale2.id,
        items: [{ artworkId: a2.id }],
        stripeRefundId: "re_dup",
        saleDate: new Date("2026-04-01"),
      })
    ).rejects.toThrow()
  })

  it("l'état « remboursée » se déduit de l'existence d'un avoir (US5.4)", async () => {
    const buyer = await createUser()
    const art = await createArtwork({ price: 200 })
    const sale = await createSaleInvoice({
      buyerId: buyer.id,
      items: [{ artworkId: art.id, unitPriceHT: 200 }],
    })

    const before = await prisma.invoice.findUnique({
      where: { id: sale.id },
      include: { creditNotes: true },
    })
    expect(before?.creditNotes).toHaveLength(0)

    await emitCredit({
      originalInvoiceId: sale.id,
      items: [{ artworkId: art.id }],
      stripeRefundId: "re_derived",
      saleDate: new Date("2026-04-01"),
    })

    const after = await prisma.invoice.findUnique({
      where: { id: sale.id },
      include: { creditNotes: true },
    })
    expect(after?.creditNotes).toHaveLength(1)
    expect(after?.creditNotes[0].type).toBe("CREDIT_NOTE")
  })

  it("rejette un avoir sur une œuvre absente de la facture d'origine", async () => {
    const buyer = await createUser()
    const sold = await createArtwork({ price: 100 })
    const other = await createArtwork({ price: 100 })
    const sale = await createSaleInvoice({ buyerId: buyer.id, items: [{ artworkId: sold.id }] })

    await expect(
      emitCredit({
        originalInvoiceId: sale.id,
        items: [{ artworkId: other.id }],
        stripeRefundId: "re_unknown",
        saleDate: new Date("2026-04-01"),
      })
    ).rejects.toThrow()
  })
})
