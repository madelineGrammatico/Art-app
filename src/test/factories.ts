import { prisma } from "@/src/lib/prisma"
import { randomUUID } from "node:crypto"
import { FRANCHISE_VAT_MENTION } from "@/src/lib/invoice/sellerConfig"

export async function createUser(overrides: Partial<{ email: string; role: "ADMIN" | "CLIENT" }> = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${randomUUID()}@test.local`,
      role: overrides.role ?? "CLIENT",
    },
  })
}

export async function createArtwork(
  overrides: Partial<{ title: string; price: number; ownerId: string | null }> = {}
) {
  return prisma.artwork.create({
    data: {
      title: overrides.title ?? `Artwork ${randomUUID().slice(0, 8)}`,
      price: overrides.price ?? 100,
      ownerId: overrides.ownerId ?? null,
    },
  })
}

// Crée une facture de vente (SALE) + ses line items. Snapshot vendeur/TVA = valeurs
// de test (franchise). Numéro unique pour ne pas violer la contrainte @@unique.
export async function createSaleInvoice(args: {
  buyerId: string
  items: { artworkId: string; unitPriceHT?: number; label?: string }[]
  stripeSessionId?: string | null
  number?: string
  buyerName?: string
}) {
  const lineItems = args.items.map((it) => {
    const unitPriceHT = it.unitPriceHT ?? 100
    return {
      artworkId: it.artworkId,
      label: it.label ?? "Œuvre de test",
      unitPriceHT,
      quantity: 1,
      vatRate: 0,
      vatAmount: 0,
      lineTTC: unitPriceHT,
    }
  })
  const totalHT = lineItems.reduce((s, l) => s + Number(l.unitPriceHT), 0)
  return prisma.invoice.create({
    data: {
      type: "SALE",
      number: args.number ?? `INV-TEST-${randomUUID().slice(0, 8)}`,
      saleDate: new Date(),
      buyerId: args.buyerId,
      buyerName: args.buyerName ?? "Client Test",
      stripeSessionId: args.stripeSessionId ?? null,
      sellerName: "Galerie Test",
      sellerLegalForm: "Entreprise individuelle",
      sellerAddress: "1 rue de Test, 75001 Paris",
      sellerSiret: "12345678901234",
      vatRegime: "FRANCHISE",
      legalMention: FRANCHISE_VAT_MENTION,
      totalHT,
      totalVat: 0,
      totalTTC: totalHT,
      lineItems: { create: lineItems },
    },
    include: { lineItems: true },
  })
}

export async function createRefundRecovery(args: {
  buyerId: string
  artworkId: string
  stripeSessionId: string
  amount?: number
  stripeRefundId?: string | null
}) {
  return prisma.refundRecovery.create({
    data: {
      buyerId: args.buyerId,
      artworkId: args.artworkId,
      stripeSessionId: args.stripeSessionId,
      amount: args.amount ?? 100,
      stripeRefundId: args.stripeRefundId ?? null,
    },
  })
}

export async function createBasketWithItem(args: { userId: string; artworkId: string }) {
  return prisma.basket.create({
    data: {
      userId: args.userId,
      items: { create: { artworkId: args.artworkId } },
    },
    include: { items: true },
  })
}

export async function createAddress(
  args: {
    userId: string
    street?: string
    postalCode?: string
    city?: string
    country?: string
    isDefaultBilling?: boolean
    isDefaultShipping?: boolean
  }
) {
  return prisma.postalAddress.create({
    data: {
      userId: args.userId,
      street: args.street ?? "1 rue de Test",
      postalCode: args.postalCode ?? "75001",
      city: args.city ?? "Paris",
      country: args.country ?? "France",
      isDefaultBilling: args.isDefaultBilling ?? false,
      isDefaultShipping: args.isDefaultShipping ?? false,
    },
  })
}
