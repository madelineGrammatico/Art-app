import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import type Stripe from "stripe"

vi.mock("@/src/lib/stripe/webhook-handler", () => ({
  verifyWebhookSignature: vi.fn(),
}))
vi.mock("@/src/lib/stripe/stripe", () => ({
  stripe: {
    refunds: { create: vi.fn() },
  },
  CURRENCY: "eur",
}))

import { POST } from "./route"
import { verifyWebhookSignature } from "@/src/lib/stripe/webhook-handler"
import { stripe } from "@/src/lib/stripe/stripe"
import { prisma } from "@/src/lib/prisma"
import {
  createUser,
  createArtwork,
  createPendingInvoice,
  createBasketWithItem,
} from "@/src/test/factories"

const mockedVerify = vi.mocked(verifyWebhookSignature)
const mockedRefund = vi.mocked(stripe.refunds.create)

function makeCheckoutCompletedEvent(args: {
  sessionId: string
  userId: string
  artworkIds: string[]
  paymentIntentId?: string | null
}): Stripe.Event {
  return {
    id: "evt_test_" + args.sessionId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: args.sessionId,
        payment_intent: args.paymentIntentId === undefined ? "pi_test_default" : args.paymentIntentId,
        metadata: {
          userId: args.userId,
          artworkIds: args.artworkIds.join(","),
        },
      } as unknown as Stripe.Checkout.Session,
    },
  } as Stripe.Event
}

function makeCheckoutExpiredEvent(args: { sessionId: string }): Stripe.Event {
  return {
    id: "evt_test_expired_" + args.sessionId,
    type: "checkout.session.expired",
    data: {
      object: {
        id: args.sessionId,
      } as Stripe.Checkout.Session,
    },
  } as Stripe.Event
}

function makeUnknownEvent(args: { sessionId: string }): Stripe.Event {
  return {
    id: "evt_test_unknown_" + args.sessionId,
    type: "payment_intent.created",
    data: {
      object: { id: args.sessionId } as unknown as Stripe.PaymentIntent,
    },
  } as Stripe.Event
}

function makeRequest(body = "{}") {
  return new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    body,
    headers: { "stripe-signature": "fake_sig" },
  })
}

beforeEach(() => {
  mockedVerify.mockReset()
  mockedRefund.mockReset()
})

describe("POST /api/stripe/webhook", () => {
  it("returns 400 when the stripe-signature header is missing", async () => {
    const req = new NextRequest("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Missing signature" })
    expect(mockedVerify).not.toHaveBeenCalled()
  })

  it("returns 400 when the signature is invalid", async () => {
    mockedVerify.mockResolvedValue(null)

    const res = await POST(makeRequest())

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid signature" })
  })

  it("on checkout.session.completed: creates PAID invoice, transfers ownership, clears basket", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 250 })
    await createBasketWithItem({ userId: buyer.id, artworkId: artwork.id })
    const sessionId = "cs_test_success"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [artwork.id],
        paymentIntentId: "pi_test_ok",
      })
    )

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })

    const invoice = await prisma.invoice.findFirst({ where: { stripeSessionId: sessionId } })
    expect(invoice?.status).toBe("PAID")
    expect(invoice?.buyerId).toBe(buyer.id)
    expect(invoice?.artworkId).toBe(artwork.id)
    expect(Number(invoice?.amount)).toBe(250)
    expect(invoice?.stripePaymentIntentId).toBe("pi_test_ok")

    const updatedArtwork = await prisma.artwork.findUnique({ where: { id: artwork.id } })
    expect(updatedArtwork?.ownerId).toBe(buyer.id)

    const basketItems = await prisma.basketItem.findMany({
      where: { basket: { userId: buyer.id } },
    })
    expect(basketItems).toHaveLength(0)

    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("is idempotent: replaying the same event does not duplicate invoices or re-process", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 100 })
    await createBasketWithItem({ userId: buyer.id, artworkId: artwork.id })
    const sessionId = "cs_test_idempotent"

    const event = makeCheckoutCompletedEvent({
      sessionId,
      userId: buyer.id,
      artworkIds: [artwork.id],
    })

    mockedVerify.mockResolvedValue(event)
    await POST(makeRequest())

    mockedVerify.mockResolvedValue(event)
    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    const invoices = await prisma.invoice.findMany({ where: { stripeSessionId: sessionId } })
    expect(invoices).toHaveLength(1)
    expect(invoices[0].status).toBe("PAID")
  })

  it("pre-checkout race: artwork already owned by another user → REFUNDED + Stripe refund", async () => {
    const otherBuyer = await createUser()
    const lateBuyer = await createUser()
    const artwork = await createArtwork({ price: 100, ownerId: otherBuyer.id })
    const sessionId = "cs_test_race_full"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: lateBuyer.id,
        artworkIds: [artwork.id],
        paymentIntentId: "pi_test_full_refund",
      })
    )
    mockedRefund.mockResolvedValue({ id: "re_test_1" } as never)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)

    const invoice = await prisma.invoice.findFirst({ where: { stripeSessionId: sessionId } })
    expect(invoice?.status).toBe("REFUNDED")
    expect(invoice?.buyerId).toBe(lateBuyer.id)
    expect(Number(invoice?.amount)).toBe(100)

    const stillOwnedByOther = await prisma.artwork.findUnique({ where: { id: artwork.id } })
    expect(stillOwnedByOther?.ownerId).toBe(otherBuyer.id)

    expect(mockedRefund).toHaveBeenCalledOnce()
    expect(mockedRefund).toHaveBeenCalledWith({
      payment_intent: "pi_test_full_refund",
      amount: 10000,
    })
  })

  it("partial race: 1 available + 1 already taken → PAID + REFUNDED + partial Stripe refund", async () => {
    const buyer = await createUser()
    const otherOwner = await createUser()
    const available = await createArtwork({ price: 100 })
    const taken = await createArtwork({ price: 250, ownerId: otherOwner.id })
    await prisma.basket.create({
      data: {
        userId: buyer.id,
        items: { create: [{ artworkId: available.id }, { artworkId: taken.id }] },
      },
    })
    const sessionId = "cs_test_partial"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [available.id, taken.id],
        paymentIntentId: "pi_test_partial",
      })
    )
    mockedRefund.mockResolvedValue({ id: "re_test_2" } as never)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)

    const invoices = await prisma.invoice.findMany({
      where: { stripeSessionId: sessionId },
      orderBy: { amount: "asc" },
    })
    expect(invoices).toHaveLength(2)
    const paid = invoices.find((i) => i.status === "PAID")
    const refunded = invoices.find((i) => i.status === "REFUNDED")
    expect(paid?.artworkId).toBe(available.id)
    expect(refunded?.artworkId).toBe(taken.id)

    const availableAfter = await prisma.artwork.findUnique({ where: { id: available.id } })
    const takenAfter = await prisma.artwork.findUnique({ where: { id: taken.id } })
    expect(availableAfter?.ownerId).toBe(buyer.id)
    expect(takenAfter?.ownerId).toBe(otherOwner.id)

    expect(mockedRefund).toHaveBeenCalledWith({
      payment_intent: "pi_test_partial",
      amount: 25000,
    })
  })

  it("on checkout.session.completed without metadata: logs and returns 200 (no DB writes)", async () => {
    const event = {
      id: "evt_no_meta",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_no_meta",
          payment_intent: "pi_test_no_meta",
        } as Stripe.Checkout.Session,
      },
    } as Stripe.Event

    mockedVerify.mockResolvedValue(event)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    const invoices = await prisma.invoice.findMany()
    expect(invoices).toHaveLength(0)
    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("on checkout.session.expired: deletes PENDING invoices for that session", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork()
    const a2 = await createArtwork()
    const sessionId = "cs_test_expired"
    await createPendingInvoice({
      buyerId: buyer.id,
      artworkId: a1.id,
      stripeSessionId: sessionId,
    })
    await createPendingInvoice({
      buyerId: buyer.id,
      artworkId: a2.id,
      stripeSessionId: sessionId,
    })

    mockedVerify.mockResolvedValue(makeCheckoutExpiredEvent({ sessionId }))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    const remaining = await prisma.invoice.findMany({ where: { stripeSessionId: sessionId } })
    expect(remaining).toHaveLength(0)
  })

  it("on checkout.session.expired: does NOT touch PAID invoices (safety)", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork()
    const sessionId = "cs_test_expired_safe"
    const paidInvoice = await prisma.invoice.create({
      data: {
        buyerId: buyer.id,
        artworkId: artwork.id,
        amount: 100,
        status: "PAID",
        stripeSessionId: sessionId,
      },
    })

    mockedVerify.mockResolvedValue(makeCheckoutExpiredEvent({ sessionId }))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    const still = await prisma.invoice.findUnique({ where: { id: paidInvoice.id } })
    expect(still?.status).toBe("PAID")
  })

  it("on checkout.session.expired: leaves the basket untouched so user can retry", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork()
    const sessionId = "cs_test_expired_basket"
    await createPendingInvoice({
      buyerId: buyer.id,
      artworkId: artwork.id,
      stripeSessionId: sessionId,
    })
    await createBasketWithItem({ userId: buyer.id, artworkId: artwork.id })

    mockedVerify.mockResolvedValue(makeCheckoutExpiredEvent({ sessionId }))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    const basketItems = await prisma.basketItem.findMany({
      where: { basket: { userId: buyer.id } },
    })
    expect(basketItems).toHaveLength(1)
    expect(basketItems[0].artworkId).toBe(artwork.id)
  })

  it("returns 200 for unknown event types without modifying any data", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork()
    const pending = await createPendingInvoice({
      buyerId: buyer.id,
      artworkId: artwork.id,
      stripeSessionId: "cs_test_unknown",
    })

    mockedVerify.mockResolvedValue(makeUnknownEvent({ sessionId: "cs_test_unknown" }))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    const unchanged = await prisma.invoice.findUnique({ where: { id: pending.id } })
    expect(unchanged?.status).toBe("PENDING")
  })

  it("on multi-item checkout: creates N PAID invoices and transfers ALL artworks", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 200 })
    const a3 = await createArtwork({ price: 300 })
    await prisma.basket.create({
      data: {
        userId: buyer.id,
        items: {
          create: [{ artworkId: a1.id }, { artworkId: a2.id }, { artworkId: a3.id }],
        },
      },
    })
    const sessionId = "cs_test_multi"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [a1.id, a2.id, a3.id],
        paymentIntentId: "pi_test_multi",
      })
    )

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)

    const invoices = await prisma.invoice.findMany({ where: { stripeSessionId: sessionId } })
    expect(invoices).toHaveLength(3)
    expect(invoices.every((i) => i.status === "PAID")).toBe(true)
    expect(invoices.every((i) => i.stripePaymentIntentId === "pi_test_multi")).toBe(true)

    const artworks = await prisma.artwork.findMany({
      where: { id: { in: [a1.id, a2.id, a3.id] } },
    })
    expect(artworks.every((a) => a.ownerId === buyer.id)).toBe(true)

    const basketItems = await prisma.basketItem.findMany({
      where: { basket: { userId: buyer.id } },
    })
    expect(basketItems).toHaveLength(0)

    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("if Stripe refund fails, invoices stay REFUNDED and the request still returns 200", async () => {
    const buyer = await createUser()
    const owner = await createUser()
    const taken = await createArtwork({ price: 100, ownerId: owner.id })
    const sessionId = "cs_test_refund_fail"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [taken.id],
        paymentIntentId: "pi_test_refund_fail",
      })
    )
    mockedRefund.mockRejectedValue(new Error("Stripe API down"))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    const invoice = await prisma.invoice.findFirst({ where: { stripeSessionId: sessionId } })
    expect(invoice?.status).toBe("REFUNDED")
    expect(mockedRefund).toHaveBeenCalledOnce()
  })
})
