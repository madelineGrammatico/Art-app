import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import type Stripe from "stripe"

vi.mock("@/src/lib/stripe/webhook-handler", () => ({
  verifyWebhookSignature: vi.fn(),
}))

import { POST } from "./route"
import { verifyWebhookSignature } from "@/src/lib/stripe/webhook-handler"
import { prisma } from "@/src/lib/prisma"
import {
  createUser,
  createArtwork,
  createPendingInvoice,
  createBasketWithItem,
} from "@/src/test/factories"

const mockedVerify = vi.mocked(verifyWebhookSignature)

function makeCheckoutCompletedEvent(args: {
  sessionId: string
  paymentIntentId?: string
}): Stripe.Event {
  return {
    id: "evt_test_" + args.sessionId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: args.sessionId,
        payment_intent: args.paymentIntentId ?? "pi_test_default",
      } as Stripe.Checkout.Session,
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

  it("on checkout.session.completed: marks invoice PAID, transfers ownership, clears basket", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 250 })
    const sessionId = "cs_test_success"
    await createPendingInvoice({
      buyerId: buyer.id,
      artworkId: artwork.id,
      amount: 250,
      stripeSessionId: sessionId,
    })
    await createBasketWithItem({ userId: buyer.id, artworkId: artwork.id })

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({ sessionId, paymentIntentId: "pi_test_ok" })
    )

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })

    const invoice = await prisma.invoice.findFirst({ where: { stripeSessionId: sessionId } })
    expect(invoice?.status).toBe("PAID")
    expect(invoice?.stripePaymentIntentId).toBe("pi_test_ok")

    const updatedArtwork = await prisma.artwork.findUnique({ where: { id: artwork.id } })
    expect(updatedArtwork?.ownerId).toBe(buyer.id)

    const basketItems = await prisma.basketItem.findMany({
      where: { basket: { userId: buyer.id } },
    })
    expect(basketItems).toHaveLength(0)
  })

  it("is idempotent: replaying the same event does not reassign or duplicate", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 100 })
    const sessionId = "cs_test_idempotent"
    await createPendingInvoice({
      buyerId: buyer.id,
      artworkId: artwork.id,
      stripeSessionId: sessionId,
    })

    mockedVerify.mockResolvedValue(makeCheckoutCompletedEvent({ sessionId }))
    await POST(makeRequest())

    mockedVerify.mockResolvedValue(makeCheckoutCompletedEvent({ sessionId }))
    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    const invoices = await prisma.invoice.findMany({ where: { stripeSessionId: sessionId } })
    expect(invoices).toHaveLength(1)
    expect(invoices[0].status).toBe("PAID")
  })

  it("does not steal an artwork that was already bought by another user", async () => {
    const otherBuyer = await createUser()
    const lateBuyer = await createUser()
    const artwork = await createArtwork({ price: 100, ownerId: otherBuyer.id })
    const sessionId = "cs_test_race"
    await createPendingInvoice({
      buyerId: lateBuyer.id,
      artworkId: artwork.id,
      stripeSessionId: sessionId,
    })

    mockedVerify.mockResolvedValue(makeCheckoutCompletedEvent({ sessionId }))
    await POST(makeRequest())

    const stillOwnedByOther = await prisma.artwork.findUnique({ where: { id: artwork.id } })
    expect(stillOwnedByOther?.ownerId).toBe(otherBuyer.id)
  })
})
