import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("./sellerConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./sellerConfig")>()
  return { ...actual, getSellerConfig: vi.fn() }
})

import { emitSaleInvoice } from "./emitSaleInvoice"
import { getSellerConfig, type SellerConfig } from "./sellerConfig"
import { prisma } from "@/src/lib/prisma"
import { createUser, createArtwork } from "@/src/test/factories"

const mockedConfig = vi.mocked(getSellerConfig)

const FRANCHISE: SellerConfig = {
  name: "Galerie Test",
  legalForm: "Entreprise individuelle",
  address: "1 rue de Test, 75001 Paris",
  siret: "12345678901234",
  rcs: null,
  vatNumber: null,
  vatRegime: "FRANCHISE",
  vatRate: 0,
  legalMention: "TVA non applicable, art. 293 B du CGI",
}

const ASSUJETTIE_5_5: SellerConfig = {
  ...FRANCHISE,
  vatRegime: "ASSUJETTIE",
  vatRate: 0.055,
  vatNumber: "FR12345678901",
  legalMention: null,
}

const emit = (args: Parameters<typeof emitSaleInvoice>[1]) =>
  prisma.$transaction((tx) => emitSaleInvoice(tx, args))

beforeEach(() => {
  mockedConfig.mockReset()
  mockedConfig.mockReturnValue(FRANCHISE)
})

describe("emitSaleInvoice", () => {
  it("crée une facture SALE numérotée avec snapshot vendeur et line items", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ title: "Crépuscule", price: 250 })

    const invoice = await emit({
      buyerId: buyer.id,
      stripeSessionId: "cs_emit_1",
      stripePaymentIntentId: "pi_1",
      saleDate: new Date("2026-03-10"),
      soldItems: [{ artworkId: artwork.id, label: artwork.title, unitPriceHT: 250 }],
    })

    expect(invoice.type).toBe("SALE")
    expect(invoice.number).toBe("INV-2026-000001")
    expect(invoice.buyerId).toBe(buyer.id)
    expect(invoice.sellerName).toBe("Galerie Test")
    expect(invoice.sellerSiret).toBe("12345678901234")
    expect(invoice.vatRegime).toBe("FRANCHISE")
    expect(invoice.legalMention).toBe("TVA non applicable, art. 293 B du CGI")

    const lines = await prisma.invoiceLineItem.findMany({ where: { invoiceId: invoice.id } })
    expect(lines).toHaveLength(1)
    expect(lines[0].artworkId).toBe(artwork.id)
    expect(lines[0].label).toBe("Crépuscule")
    expect(Number(lines[0].unitPriceHT)).toBe(250)
  })

  it("en franchise : TVA nulle, TTC = HT", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 200 })

    const invoice = await emit({
      buyerId: buyer.id,
      stripeSessionId: "cs_emit_franchise",
      stripePaymentIntentId: null,
      saleDate: new Date("2026-01-01"),
      soldItems: [
        { artworkId: a1.id, label: "A1", unitPriceHT: 100 },
        { artworkId: a2.id, label: "A2", unitPriceHT: 200 },
      ],
    })

    expect(Number(invoice.totalHT)).toBe(300)
    expect(Number(invoice.totalVat)).toBe(0)
    expect(Number(invoice.totalTTC)).toBe(300)
  })

  it("en assujetti 5,5 % : TVA par ligne, arrondi demi-supérieur à 2 décimales", async () => {
    mockedConfig.mockReturnValue(ASSUJETTIE_5_5)
    const buyer = await createUser()
    // 175 * 0.055 = 9.625 → arrondi demi-supérieur → 9.63 ; TTC = 184.63
    const artwork = await createArtwork({ price: 175 })

    const invoice = await emit({
      buyerId: buyer.id,
      stripeSessionId: "cs_emit_vat",
      stripePaymentIntentId: null,
      saleDate: new Date("2026-01-01"),
      soldItems: [{ artworkId: artwork.id, label: "Œuvre", unitPriceHT: 175 }],
    })

    const line = await prisma.invoiceLineItem.findFirst({ where: { invoiceId: invoice.id } })
    expect(Number(line?.vatRate)).toBeCloseTo(0.055)
    expect(Number(line?.vatAmount)).toBe(9.63)
    expect(Number(line?.lineTTC)).toBe(184.63)
    expect(Number(invoice.totalHT)).toBe(175)
    expect(Number(invoice.totalVat)).toBe(9.63)
    expect(Number(invoice.totalTTC)).toBe(184.63)
  })

  it("fige le snapshot des adresses billing/shipping", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 100 })

    const invoice = await emit({
      buyerId: buyer.id,
      stripeSessionId: "cs_emit_addr",
      stripePaymentIntentId: null,
      saleDate: new Date("2026-01-01"),
      soldItems: [{ artworkId: artwork.id, label: "Œuvre", unitPriceHT: 100 }],
      billing: { fk: null, street: "10 av Foch", postalCode: "75116", city: "Paris", country: "France" },
      shipping: { fk: null, street: "20 rue de Lyon", postalCode: "69001", city: "Lyon", country: "France" },
    })

    expect(invoice.billingStreet).toBe("10 av Foch")
    expect(invoice.billingCity).toBe("Paris")
    expect(invoice.shippingCity).toBe("Lyon")
  })

  it("refuse une 2e facture de vente pour la même session Stripe (@@unique)", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 100 })

    await emit({
      buyerId: buyer.id,
      stripeSessionId: "cs_emit_dup",
      stripePaymentIntentId: null,
      saleDate: new Date("2026-01-01"),
      soldItems: [{ artworkId: a1.id, label: "A1", unitPriceHT: 100 }],
    })

    await expect(
      emit({
        buyerId: buyer.id,
        stripeSessionId: "cs_emit_dup",
        stripePaymentIntentId: null,
        saleDate: new Date("2026-01-01"),
        soldItems: [{ artworkId: a2.id, label: "A2", unitPriceHT: 100 }],
      })
    ).rejects.toThrow()
  })
})
