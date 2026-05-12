import { prisma } from "@/src/lib/prisma"
import { randomUUID } from "node:crypto"

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

export async function createPendingInvoice(args: {
  buyerId: string
  artworkId: string
  amount?: number
  stripeSessionId?: string | null
}) {
  return prisma.invoice.create({
    data: {
      buyerId: args.buyerId,
      artworkId: args.artworkId,
      amount: args.amount ?? 100,
      status: "PENDING",
      stripeSessionId: args.stripeSessionId ?? null,
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
