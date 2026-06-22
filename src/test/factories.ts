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
  overrides: Partial<{
    title: string
    price: number
    ownerId: string | null
    weightKg: number
    lengthCm: number
    widthCm: number
    heightCm: number
    requiresSpecialistCarrier: boolean
  }> = {}
) {
  return prisma.artwork.create({
    data: {
      title: overrides.title ?? `Artwork ${randomUUID().slice(0, 8)}`,
      price: overrides.price ?? 100,
      ownerId: overrides.ownerId ?? null,
      weightKg: overrides.weightKg ?? null,
      lengthCm: overrides.lengthCm ?? null,
      widthCm: overrides.widthCm ?? null,
      heightCm: overrides.heightCm ?? null,
      requiresSpecialistCarrier: overrides.requiresSpecialistCarrier ?? false,
    },
  })
}

// Crée une facture de vente (SALE) + ses line items. Snapshot vendeur/TVA = valeurs
// de test (franchise). Numéro unique pour ne pas violer la contrainte @@unique.
export async function createSaleInvoice(args: {
  buyerId: string
  items: {
    artworkId: string
    unitPriceHT?: number
    label?: string
    // Ligne SHIPPING optionnelle pour la même œuvre (B14, 1 colis = 1 œuvre).
    shipping?: {
      unitPriceHT?: number
      shippingMethodId?: string
      shippingParcelId?: string | null
      shippingParcelFailedAt?: Date | null
    }
  }[]
  stripeSessionId?: string | null
  stripePaymentIntentId?: string | null
  number?: string
  buyerName?: string
  fulfillmentMode?: "DELIVERY" | "PICKUP"
  billing?: { street?: string; postalCode?: string; city?: string; country?: string }
  shipping?: { street?: string; postalCode?: string; city?: string; country?: string }
}) {
  const lineItems = args.items.flatMap((it) => {
    const unitPriceHT = it.unitPriceHT ?? 100
    const artworkLine = {
      type: "ARTWORK" as const,
      artworkId: it.artworkId,
      label: it.label ?? "Œuvre de test",
      unitPriceHT,
      quantity: 1,
      vatRate: 0,
      vatAmount: 0,
      lineTTC: unitPriceHT,
    }
    if (!it.shipping) return [artworkLine]
    const shippingHT = it.shipping.unitPriceHT ?? 10
    return [
      artworkLine,
      {
        type: "SHIPPING" as const,
        artworkId: it.artworkId,
        label: "Livraison de test",
        unitPriceHT: shippingHT,
        quantity: 1,
        vatRate: 0,
        vatAmount: 0,
        lineTTC: shippingHT,
        shippingMethodId: it.shipping.shippingMethodId ?? "sc_test",
        shippingParcelId: it.shipping.shippingParcelId ?? null,
        shippingParcelFailedAt: it.shipping.shippingParcelFailedAt ?? null,
      },
    ]
  })
  const totalHT = lineItems.reduce((s, l) => s + Number(l.unitPriceHT), 0)
  return prisma.invoice.create({
    data: {
      type: "SALE",
      number: args.number ?? `INV-TEST-${randomUUID().slice(0, 8)}`,
      saleDate: new Date(),
      buyerId: args.buyerId,
      buyerName: args.buyerName ?? "Client Test",
      fulfillmentMode: args.fulfillmentMode ?? "DELIVERY",
      stripeSessionId: args.stripeSessionId ?? null,
      stripePaymentIntentId: args.stripePaymentIntentId ?? null,
      sellerName: "Galerie Test",
      sellerLegalForm: "Entreprise individuelle",
      sellerAddress: "1 rue de Test, 75001 Paris",
      sellerSiret: "12345678901234",
      vatRegime: "FRANCHISE",
      legalMention: FRANCHISE_VAT_MENTION,
      billingStreet: args.billing?.street ?? null,
      billingPostalCode: args.billing?.postalCode ?? null,
      billingCity: args.billing?.city ?? null,
      billingCountry: args.billing?.country ?? null,
      shippingStreet: args.shipping?.street ?? null,
      shippingPostalCode: args.shipping?.postalCode ?? null,
      shippingCity: args.shipping?.city ?? null,
      shippingCountry: args.shipping?.country ?? null,
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
