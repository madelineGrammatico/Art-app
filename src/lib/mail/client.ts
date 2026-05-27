import { Resend } from "resend"

const DEFAULT_FROM = "onboarding@resend.dev"

let cachedClient: Resend | null = null

function getClient(): Resend {
  if (!cachedClient) {
    const apiKey = process.env.RESEND_KEY
    if (!apiKey) {
      throw new Error("RESEND_KEY is not set")
    }
    cachedClient = new Resend(apiKey)
  }
  return cachedClient
}

export type SendEmailParams = {
  to: string | string[]
  subject: string
  html: string
  from?: string
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const from = params.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM

  const result = await getClient().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  })

  if (result.error) {
    return { ok: false, error: result.error.message }
  }
  return { ok: true, id: result.data?.id ?? "" }
}
