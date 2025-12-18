import { stripe } from "./stripe"
import { headers } from "next/headers"
import Stripe from "stripe"

export async function verifyWebhookSignature(
  body: string | Buffer,
  signature: string | null
): Promise<Stripe.Event | null> {
  if (!signature) {
    return null
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set")
  }

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    )
    return event
  } catch (err) {
    console.error("Webhook signature verification failed:", err)
    return null
  }
}

export async function getWebhookSignature(): Promise<string | null> {
  const headersList = await headers()
  return headersList.get("stripe-signature")
}
