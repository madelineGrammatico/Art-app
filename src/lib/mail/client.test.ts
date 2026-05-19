import { describe, it, expect, vi, beforeEach } from "vitest"

const sendMock = vi.fn()

vi.mock("resend", () => ({
  Resend: function Resend() {
    return { emails: { send: sendMock } }
  },
}))

import { sendEmail } from "./client"

beforeEach(() => {
  sendMock.mockReset()
  delete process.env.EMAIL_FROM
  process.env.RESEND_KEY = "test-key"
})

describe("sendEmail", () => {
  it("returns ok: true with the id on success", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_123" }, error: null })

    const res = await sendEmail({
      to: "user@test.local",
      subject: "Hello",
      html: "<p>hi</p>",
    })

    expect(res).toEqual({ ok: true, id: "msg_123" })
  })

  it("returns ok: false with the message on Resend error", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "rate limited" },
    })

    const res = await sendEmail({
      to: "user@test.local",
      subject: "Hello",
      html: "<p>hi</p>",
    })

    expect(res).toEqual({ ok: false, error: "rate limited" })
  })

  it("uses EMAIL_FROM env var when no from is provided", async () => {
    process.env.EMAIL_FROM = "noreply@example.com"
    sendMock.mockResolvedValue({ data: { id: "x" }, error: null })

    await sendEmail({ to: "user@test.local", subject: "S", html: "h" })

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "noreply@example.com" })
    )
  })

  it("uses the explicit from parameter over the env var", async () => {
    process.env.EMAIL_FROM = "noreply@example.com"
    sendMock.mockResolvedValue({ data: { id: "x" }, error: null })

    await sendEmail({
      to: "user@test.local",
      subject: "S",
      html: "h",
      from: "override@example.com",
    })

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "override@example.com" })
    )
  })

  it("falls back to the default onboarding@resend.dev sender", async () => {
    sendMock.mockResolvedValue({ data: { id: "x" }, error: null })

    await sendEmail({ to: "user@test.local", subject: "S", html: "h" })

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "onboarding@resend.dev" })
    )
  })

  it("forwards to/subject/html unchanged", async () => {
    sendMock.mockResolvedValue({ data: { id: "x" }, error: null })

    await sendEmail({
      to: ["a@test.local", "b@test.local"],
      subject: "Test subject",
      html: "<h1>Body</h1>",
    })

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["a@test.local", "b@test.local"],
        subject: "Test subject",
        html: "<h1>Body</h1>",
      })
    )
  })
})
