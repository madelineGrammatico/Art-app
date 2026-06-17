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
// Config vendeur fixe (franchise) pour que emitSaleInvoice ne dépende pas de l'env.
vi.mock("@/src/lib/invoice/sellerConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/invoice/sellerConfig")>()
  return {
    ...actual,
    getSellerConfig: () => ({
      name: "Galerie Test",
      legalForm: "Entreprise individuelle",
      address: "1 rue de Test, 75001 Paris",
      siret: "12345678901234",
      rcs: null,
      vatNumber: null,
      vatRegime: "FRANCHISE" as const,
      vatRate: 0,
      legalMention: actual.FRANCHISE_VAT_MENTION,
    }),
  }
})

import { POST } from "./route"
import { verifyWebhookSignature } from "@/src/lib/stripe/webhook-handler"
import { stripe } from "@/src/lib/stripe/stripe"
import { sendRefundUserMail } from "@/src/lib/mail/refundUserMail"
import { sendIncidentAdminMail } from "@/src/lib/mail/incidentAdminMail"
import { prisma } from "@/src/lib/prisma"
import {
  createUser,
  createArtwork,
  createRefundRecovery,
  createBasketWithItem,
  createAddress,
} from "@/src/test/factories"

const mockedVerify = vi.mocked(verifyWebhookSignature)
const mockedRefund = vi.mocked(stripe.refunds.create)
const mockedUserMail = vi.mocked(sendRefundUserMail)
const mockedAdminMail = vi.mocked(sendIncidentAdminMail)

type AddressBlob = {
  id: string
  street: string
  postalCode: string
  city: string
  country: string
}

function makeCheckoutCompletedEvent(args: {
  sessionId: string
  userId: string
  artworkIds: string[]
  paymentIntentId?: string | null
  billingAddress?: AddressBlob
  shippingAddress?: AddressBlob
}): Stripe.Event {
  const metadata: Record<string, string> = {
    userId: args.userId,
    artworkIds: args.artworkIds.join(","),
  }
  if (args.billingAddress) {
    metadata.billingAddress = JSON.stringify(args.billingAddress)
  }
  if (args.shippingAddress) {
    metadata.shippingAddress = JSON.stringify(args.shippingAddress)
  }
  return {
    id: "evt_test_" + args.sessionId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: args.sessionId,
        payment_intent: args.paymentIntentId === undefined ? "pi_test_default" : args.paymentIntentId,
        metadata,
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

const saleInvoice = (sessionId: string) =>
  prisma.invoice.findFirst({
    where: { type: "SALE", stripeSessionId: sessionId },
    include: { lineItems: true },
  })

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

  it("on checkout.session.completed: creates ONE sale invoice with a line item, transfers ownership, clears basket", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ title: "Crépuscule", price: 250 })
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

    const invoice = await saleInvoice(sessionId)
    expect(invoice).not.toBeNull()
    expect(invoice?.type).toBe("SALE")
    expect(invoice?.number).toMatch(/^INV-\d{4}-\d{6}$/)
    expect(invoice?.buyerId).toBe(buyer.id)
    expect(invoice?.stripePaymentIntentId).toBe("pi_test_ok")
    expect(Number(invoice?.totalTTC)).toBe(250)
    expect(invoice?.lineItems).toHaveLength(1)
    expect(invoice?.lineItems[0].artworkId).toBe(artwork.id)
    expect(invoice?.lineItems[0].label).toBe("Crépuscule")
    expect(Number(invoice?.lineItems[0].lineTTC)).toBe(250)

    const updatedArtwork = await prisma.artwork.findUnique({ where: { id: artwork.id } })
    expect(updatedArtwork?.ownerId).toBe(buyer.id)

    const basketItems = await prisma.basketItem.findMany({
      where: { basket: { userId: buyer.id } },
    })
    expect(basketItems).toHaveLength(0)

    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("is idempotent: replaying the same event does not duplicate the invoice", async () => {
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
  })

  it("full race: artwork already owned → no invoice, RefundRecovery, Stripe refund + emails", async () => {
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

    expect(await saleInvoice(sessionId)).toBeNull()
    const recoveries = await prisma.refundRecovery.findMany({ where: { stripeSessionId: sessionId } })
    expect(recoveries).toHaveLength(1)
    expect(recoveries[0].artworkId).toBe(artwork.id)
    expect(recoveries[0].buyerId).toBe(lateBuyer.id)

    const stillOwnedByOther = await prisma.artwork.findUnique({ where: { id: artwork.id } })
    expect(stillOwnedByOther?.ownerId).toBe(otherBuyer.id)

    expect(mockedRefund).toHaveBeenCalledOnce()
    expect(mockedRefund).toHaveBeenCalledWith(
      { payment_intent: "pi_test_full_refund", amount: 10000 },
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
          expect.objectContaining({ artworkId: artwork.id, title: "Crépuscule", amountEur: 100 }),
        ],
      })
    )
  })

  it("partial race: 1 available + 1 taken → invoice with 1 line item + 1 RefundRecovery + partial refund", async () => {
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

    const invoice = await saleInvoice(sessionId)
    expect(invoice?.lineItems).toHaveLength(1)
    expect(invoice?.lineItems[0].artworkId).toBe(available.id)

    const recoveries = await prisma.refundRecovery.findMany({ where: { stripeSessionId: sessionId } })
    expect(recoveries).toHaveLength(1)
    expect(recoveries[0].artworkId).toBe(taken.id)

    const availableAfter = await prisma.artwork.findUnique({ where: { id: available.id } })
    const takenAfter = await prisma.artwork.findUnique({ where: { id: taken.id } })
    expect(availableAfter?.ownerId).toBe(buyer.id)
    expect(takenAfter?.ownerId).toBe(otherOwner.id)

    expect(mockedRefund).toHaveBeenCalledWith(
      { payment_intent: "pi_test_partial", amount: 25000 },
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
    expect(await prisma.invoice.findMany()).toHaveLength(0)
    expect(await prisma.refundRecovery.findMany()).toHaveLength(0)
    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("on checkout.session.expired: no-op (returns 200, leaves basket untouched)", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork()
    const sessionId = "cs_test_expired"
    await createBasketWithItem({ userId: buyer.id, artworkId: artwork.id })

    mockedVerify.mockResolvedValue(makeCheckoutExpiredEvent({ sessionId }))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await prisma.invoice.findMany()).toHaveLength(0)
    const basketItems = await prisma.basketItem.findMany({
      where: { basket: { userId: buyer.id } },
    })
    expect(basketItems).toHaveLength(1)
  })

  it("returns 200 for unknown event types without modifying any data", async () => {
    const buyer = await createUser()
    const otherOwner = await createUser()
    const taken = await createArtwork({ ownerId: otherOwner.id })
    await createRefundRecovery({
      buyerId: buyer.id,
      artworkId: taken.id,
      stripeSessionId: "cs_test_unknown",
      stripeRefundId: "re_existing",
    })

    mockedVerify.mockResolvedValue(makeUnknownEvent({ sessionId: "cs_test_unknown" }))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    const recoveries = await prisma.refundRecovery.findMany({ where: { stripeSessionId: "cs_test_unknown" } })
    expect(recoveries).toHaveLength(1)
    expect(recoveries[0].stripeRefundId).toBe("re_existing")
  })

  it("on multi-item checkout: ONE invoice with N line items, transfers ALL artworks", async () => {
    const buyer = await createUser()
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 200 })
    const a3 = await createArtwork({ price: 300 })
    await prisma.basket.create({
      data: {
        userId: buyer.id,
        items: { create: [{ artworkId: a1.id }, { artworkId: a2.id }, { artworkId: a3.id }] },
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

    const invoice = await saleInvoice(sessionId)
    expect(invoice?.lineItems).toHaveLength(3)
    expect(Number(invoice?.totalTTC)).toBe(600)

    const artworks = await prisma.artwork.findMany({ where: { id: { in: [a1.id, a2.id, a3.id] } } })
    expect(artworks.every((a) => a.ownerId === buyer.id)).toBe(true)

    const basketItems = await prisma.basketItem.findMany({
      where: { basket: { userId: buyer.id } },
    })
    expect(basketItems).toHaveLength(0)

    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("if Stripe refund fails: RefundRecovery stays unstamped, no user mail, admin mail failed", async () => {
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
    const recovery = await prisma.refundRecovery.findFirst({ where: { stripeSessionId: sessionId } })
    expect(recovery?.stripeRefundId).toBeNull()
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

  it("buyer not found in DB: returns 200 without writing anything (defense in depth)", async () => {
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
    expect(await prisma.invoice.findMany()).toHaveLength(0)
    expect(await prisma.refundRecovery.findMany()).toHaveLength(0)
    expect(mockedRefund).not.toHaveBeenCalled()
  })

  it("race with NULL payment_intent: RefundRecovery created, NO refund call, admin alert failed", async () => {
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
    const recovery = await prisma.refundRecovery.findFirst({ where: { stripeSessionId: sessionId } })
    expect(recovery?.stripeRefundId).toBeNull()

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

  it("after successful refund: RefundRecovery is stamped with stripeRefundId", async () => {
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

    const recovery = await prisma.refundRecovery.findFirst({ where: { stripeSessionId: sessionId } })
    expect(recovery?.stripeRefundId).toBe("re_test_stamp")
  })

  it("recovery: RefundRecovery with null stripeRefundId triggers refund retry on webhook replay", async () => {
    const buyer = await createUser({ email: "recover@test.local" })
    const owner = await createUser()
    const taken = await createArtwork({ title: "Aube", price: 100, ownerId: owner.id })
    const sessionId = "cs_test_recovery"

    // Simulate a previous crash: recovery row exists but refund never confirmed.
    await createRefundRecovery({
      buyerId: buyer.id,
      artworkId: taken.id,
      stripeSessionId: sessionId,
      amount: 100,
      stripeRefundId: null,
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

    const recovery = await prisma.refundRecovery.findFirst({ where: { stripeSessionId: sessionId } })
    expect(recovery?.stripeRefundId).toBe("re_recovered")

    // Recovery skips emails to avoid spam if they were already sent before the crash.
    expect(mockedUserMail).not.toHaveBeenCalled()
    expect(mockedAdminMail).not.toHaveBeenCalled()
  })

  it("fully processed (RefundRecovery already stamped): webhook replay does nothing", async () => {
    const buyer = await createUser()
    const owner = await createUser()
    const taken = await createArtwork({ price: 100, ownerId: owner.id })
    const sessionId = "cs_test_already_settled"

    await createRefundRecovery({
      buyerId: buyer.id,
      artworkId: taken.id,
      stripeSessionId: sessionId,
      amount: 100,
      stripeRefundId: "re_settled",
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

  it("attaches billing + shipping FK and snapshot to the sale invoice", async () => {
    const buyer = await createUser()
    const billing = await createAddress({
      userId: buyer.id,
      street: "10 avenue Foch",
      postalCode: "75116",
      city: "Paris",
      country: "France",
    })
    const shipping = await createAddress({
      userId: buyer.id,
      street: "20 rue de Lyon",
      postalCode: "69001",
      city: "Lyon",
      country: "France",
    })
    const artwork = await createArtwork({ price: 100 })
    await createBasketWithItem({ userId: buyer.id, artworkId: artwork.id })
    const sessionId = "cs_test_with_addresses"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [artwork.id],
        billingAddress: {
          id: billing.id,
          street: billing.street,
          postalCode: billing.postalCode,
          city: billing.city,
          country: billing.country,
        },
        shippingAddress: {
          id: shipping.id,
          street: shipping.street,
          postalCode: shipping.postalCode,
          city: shipping.city,
          country: shipping.country,
        },
      })
    )

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    const invoice = await saleInvoice(sessionId)
    expect(invoice?.billingAddressId).toBe(billing.id)
    expect(invoice?.billingStreet).toBe("10 avenue Foch")
    expect(invoice?.billingPostalCode).toBe("75116")
    expect(invoice?.billingCity).toBe("Paris")
    expect(invoice?.billingCountry).toBe("France")
    expect(invoice?.shippingAddressId).toBe(shipping.id)
    expect(invoice?.shippingStreet).toBe("20 rue de Lyon")
    expect(invoice?.shippingPostalCode).toBe("69001")
    expect(invoice?.shippingCity).toBe("Lyon")
    expect(invoice?.shippingCountry).toBe("France")
  })

  it("if billing address was deleted before webhook: snapshot is preserved, FK is null", async () => {
    const buyer = await createUser()
    const billing = await createAddress({
      userId: buyer.id,
      street: "10 avenue Foch",
      postalCode: "75116",
      city: "Paris",
      country: "France",
    })
    const shipping = await createAddress({ userId: buyer.id })
    const artwork = await createArtwork({ price: 100 })
    await createBasketWithItem({ userId: buyer.id, artworkId: artwork.id })
    const sessionId = "cs_test_billing_deleted"

    const billingBlob = {
      id: billing.id,
      street: billing.street,
      postalCode: billing.postalCode,
      city: billing.city,
      country: billing.country,
    }
    const shippingBlob = {
      id: shipping.id,
      street: shipping.street,
      postalCode: shipping.postalCode,
      city: shipping.city,
      country: shipping.country,
    }

    // Race: user deletes the billing address between checkout and webhook.
    await prisma.postalAddress.delete({ where: { id: billing.id } })

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [artwork.id],
        billingAddress: billingBlob,
        shippingAddress: shippingBlob,
      })
    )

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    const invoice = await saleInvoice(sessionId)
    expect(invoice?.billingAddressId).toBeNull()
    expect(invoice?.billingStreet).toBe("10 avenue Foch")
    expect(invoice?.billingCity).toBe("Paris")
    expect(invoice?.shippingAddressId).toBe(shipping.id)
    expect(invoice?.shippingStreet).toBe(shipping.street)
  })

  it("when metadata has no address blobs, invoice address fields stay null (no crash)", async () => {
    const buyer = await createUser()
    const artwork = await createArtwork({ price: 100 })
    await createBasketWithItem({ userId: buyer.id, artworkId: artwork.id })
    const sessionId = "cs_test_no_address_meta"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [artwork.id],
      })
    )

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    const invoice = await saleInvoice(sessionId)
    expect(invoice?.billingAddressId).toBeNull()
    expect(invoice?.billingStreet).toBeNull()
    expect(invoice?.shippingAddressId).toBeNull()
    expect(invoice?.shippingStreet).toBeNull()
  })

  it("multi-item order: the single invoice carries the address + all line items", async () => {
    const buyer = await createUser()
    const billing = await createAddress({ userId: buyer.id, city: "Bordeaux" })
    const shipping = await createAddress({ userId: buyer.id, city: "Nice" })
    const a1 = await createArtwork({ price: 100 })
    const a2 = await createArtwork({ price: 200 })
    await prisma.basket.create({
      data: {
        userId: buyer.id,
        items: { create: [{ artworkId: a1.id }, { artworkId: a2.id }] },
      },
    })
    const sessionId = "cs_test_multi_addresses"

    mockedVerify.mockResolvedValue(
      makeCheckoutCompletedEvent({
        sessionId,
        userId: buyer.id,
        artworkIds: [a1.id, a2.id],
        billingAddress: {
          id: billing.id,
          street: billing.street,
          postalCode: billing.postalCode,
          city: billing.city,
          country: billing.country,
        },
        shippingAddress: {
          id: shipping.id,
          street: shipping.street,
          postalCode: shipping.postalCode,
          city: shipping.city,
          country: shipping.country,
        },
      })
    )

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    const invoice = await saleInvoice(sessionId)
    expect(invoice?.lineItems).toHaveLength(2)
    expect(invoice?.billingAddressId).toBe(billing.id)
    expect(invoice?.billingCity).toBe("Bordeaux")
    expect(invoice?.shippingAddressId).toBe(shipping.id)
    expect(invoice?.shippingCity).toBe("Nice")
  })
})
