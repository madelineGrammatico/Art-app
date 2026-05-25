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
vi.mock("@/src/lib/mail/refundUserMail", () => ({
  sendRefundUserMail: vi.fn(),
}))
vi.mock("@/src/lib/mail/incidentAdminMail", () => ({
  sendIncidentAdminMail: vi.fn(),
}))

import { POST } from "./route"
import { verifyWebhookSignature } from "@/src/lib/stripe/webhook-handler"
import { stripe } from "@/src/lib/stripe/stripe"
import { sendRefundUserMail } from "@/src/lib/mail/refundUserMail"
import { sendIncidentAdminMail } from "@/src/lib/mail/incidentAdminMail"
import { prisma } from "@/src/lib/prisma"
import {
  createUser,
  createArtwork,
  createPendingInvoice,
  createBasketWithItem,
} from "@/src/test/factories"

const mockedVerify = vi.mocked(verifyWebhookSignature)
const mockedRefund = vi.mocked(stripe.refunds.create)
const mockedUserMail = vi.mocked(sendRefundUserMail)
const mockedAdminMail = vi.mocked(sendIncidentAdminMail)

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
  mockedUserMail.mockReset()
  mockedUserMail.mockResolvedValue({ ok: true, id: "msg_user" })
  mockedAdminMail.mockReset()
  mockedAdminMail.mockResolvedValue({ ok: true, id: "msg_admin" })
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

  it("pre-checkout race: artwork already owned by another user → REFUNDED + Stripe refund + emails", async () => {
    const otherBuyer = await createUser()
    const lateBuyer = await createUser({ email: "late@test.local" })
    const artwork = await createArtwork({ title: "Crépuscule", price: 100, ownerId: otherBuyer.id })
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
    expect(mockedRefund).toHaveBeenCalledWith(
      {
        payment_intent: "pi_test_full_refund",
        amount: 10000,
      },
      { idempotencyKey: `refund-${sessionId}` }
    )

    expect(mockedUserMail).toHaveBeenCalledOnce()
    expect(mockedUserMail).toHaveBeenCalledWith({
      to: "late@test.local",
      refundedItems: [{ title: "Crépuscule", amountEur: 100 }],
      totalRefundEur: 100,
      sessionId,
    })

    expect(mockedAdminMail).toHaveBeenCalledOnce()
    expect(mockedAdminMail).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        userId: lateBuyer.id,
        userEmail: "late@test.local",
        refundOutcome: "issued",
        refundError: undefined,
        affectedItems: [
          expect.objectContaining({
            artworkId: artwork.id,
            title: "Crépuscule",
            amountEur: 100,
          }),
        ],
      })
    )
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

    expect(mockedRefund).toHaveBeenCalledWith(
      {
        payment_intent: "pi_test_partial",
        amount: 25000,
      },
      { idempotencyKey: `refund-${sessionId}` }
    )
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

  it("if Stripe refund fails: invoices stay REFUNDED, no user mail, admin mail with URGENT flag", async () => {
    const buyer = await createUser({ email: "buyer@test.local" })
    const owner = await createUser()
    const taken = await createArtwork({ title: "Aurore", price: 100, ownerId: owner.id })
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

    expect(mockedUserMail).not.toHaveBeenCalled()

    expect(mockedAdminMail).toHaveBeenCalledOnce()
    expect(mockedAdminMail).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        refundOutcome: "failed",
        refundError: "Stripe API down",
      })
    )
  })

  it("buyer not found in DB: returns 200 without writing invoices (defense in depth)", async () => {
    const artwork = await createArtwork({ price: 100 })
    const sessionId = "cs_test_no_user"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: "ghost-user-id",
        artworkIds: [artwork.id],
        paymentIntentId: "pi_test_no_user",
      })
    )

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    const invoices = await prisma.invoice.findMany({ where: { stripeSessionId: sessionId } })
    expect(invoices).toHaveLength(0)
    expect(mockedRefund).not.toHaveBeenCalled()
    expect(mockedUserMail).not.toHaveBeenCalled()
    expect(mockedAdminMail).not.toHaveBeenCalled()
  })

  it("race with NULL payment_intent: invoices REFUNDED in DB, NO refund call, admin alert URGENT", async () => {
    const buyer = await createUser({ email: "buyer@test.local" })
    const otherOwner = await createUser()
    const taken = await createArtwork({ title: "Crépuscule", price: 100, ownerId: otherOwner.id })
    const sessionId = "cs_test_null_pi"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [taken.id],
        paymentIntentId: null,
      })
    )

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    const invoice = await prisma.invoice.findFirst({ where: { stripeSessionId: sessionId } })
    expect(invoice?.status).toBe("REFUNDED")

    expect(mockedRefund).not.toHaveBeenCalled()
    expect(mockedUserMail).not.toHaveBeenCalled()

    expect(mockedAdminMail).toHaveBeenCalledOnce()
    expect(mockedAdminMail).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        refundOutcome: "failed",
        refundError: "Stripe payment_intent missing on session",
      })
    )
  })

  it("after successful refund: REFUNDED invoices are stamped with stripeRefundId", async () => {
    const buyer = await createUser({ email: "stamp@test.local" })
    const owner = await createUser()
    const taken = await createArtwork({ price: 100, ownerId: owner.id })
    const sessionId = "cs_test_stamp"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [taken.id],
        paymentIntentId: "pi_test_stamp",
      })
    )
    mockedRefund.mockResolvedValue({ id: "re_test_stamp" } as never)

    await POST(makeRequest())

    const invoice = await prisma.invoice.findFirst({ where: { stripeSessionId: sessionId } })
    expect(invoice?.status).toBe("REFUNDED")
    expect(invoice?.stripeRefundId).toBe("re_test_stamp")
  })

  it("recovery: REFUNDED invoices with null stripeRefundId trigger refund retry on webhook replay", async () => {
    const buyer = await createUser({ email: "recover@test.local" })
    const owner = await createUser()
    const taken = await createArtwork({ title: "Aube", price: 100, ownerId: owner.id })
    const sessionId = "cs_test_recovery"

    // Simulate a previous crash: REFUNDED invoice exists in DB but
    // stripeRefundId is null (refund never confirmed).
    await prisma.invoice.create({
      data: {
        buyerId: buyer.id,
        artworkId: taken.id,
        amount: 100,
        status: "REFUNDED",
        stripeSessionId: sessionId,
        stripePaymentIntentId: "pi_test_recovery",
        stripeRefundId: null,
      },
    })

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [taken.id],
        paymentIntentId: "pi_test_recovery",
      })
    )
    mockedRefund.mockResolvedValue({ id: "re_recovered" } as never)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockedRefund).toHaveBeenCalledOnce()
    expect(mockedRefund).toHaveBeenCalledWith(
      { payment_intent: "pi_test_recovery", amount: 10000 },
      { idempotencyKey: `refund-${sessionId}` }
    )

    const invoice = await prisma.invoice.findFirst({ where: { stripeSessionId: sessionId } })
    expect(invoice?.stripeRefundId).toBe("re_recovered")

    expect(mockedUserMail).toHaveBeenCalledOnce()
    expect(mockedAdminMail).toHaveBeenCalledOnce()
  })

  it("fully processed (REFUNDED + stripeRefundId set): webhook replay does nothing", async () => {
    const buyer = await createUser()
    const owner = await createUser()
    const taken = await createArtwork({ price: 100, ownerId: owner.id })
    const sessionId = "cs_test_already_settled"

    await prisma.invoice.create({
      data: {
        buyerId: buyer.id,
        artworkId: taken.id,
        amount: 100,
        status: "REFUNDED",
        stripeSessionId: sessionId,
        stripePaymentIntentId: "pi_test_settled",
        stripeRefundId: "re_settled",
      },
    })

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [taken.id],
        paymentIntentId: "pi_test_settled",
      })
    )

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockedRefund).not.toHaveBeenCalled()
    expect(mockedUserMail).not.toHaveBeenCalled()
    expect(mockedAdminMail).not.toHaveBeenCalled()
  })

  it("happy path does NOT send any email", async () => {
    const buyer = await createUser({ email: "happy@test.local" })
    const artwork = await createArtwork({ price: 80 })
    await createBasketWithItem({ userId: buyer.id, artworkId: artwork.id })
    const sessionId = "cs_test_no_email"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [artwork.id],
      })
    )

    await POST(makeRequest())

    expect(mockedUserMail).not.toHaveBeenCalled()
    expect(mockedAdminMail).not.toHaveBeenCalled()
  })
})
