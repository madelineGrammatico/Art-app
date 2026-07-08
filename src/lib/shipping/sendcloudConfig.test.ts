import { describe, it, expect } from "vitest"
import { parseSendcloudConfig } from "./sendcloudConfig"

const base = {
  SENDCLOUD_PUBLIC_KEY: "pub_123",
  SENDCLOUD_SECRET_KEY: "sec_123",
  SENDCLOUD_FROM_ADDRESS_LINE_1: "10 rue de Rivoli",
  SENDCLOUD_FROM_POSTAL_CODE: "75001",
  SENDCLOUD_FROM_CITY: "Paris",
  SENDCLOUD_FROM_COUNTRY: "fr",
}

describe("parseSendcloudConfig", () => {
  it("accepte une config valide et normalise le pays en majuscules", () => {
    const cfg = parseSendcloudConfig(base)
    expect(cfg.publicKey).toBe("pub_123")
    expect(cfg.from.countryCode).toBe("FR")
    expect(cfg.from.addressLine1).toBe("10 rue de Rivoli")
  })

  it("rejette une clé API manquante", () => {
    const { SENDCLOUD_SECRET_KEY, ...rest } = base
    void SENDCLOUD_SECRET_KEY
    expect(() => parseSendcloudConfig(rest)).toThrow()
  })

  it("rejette une adresse expéditeur incomplète", () => {
    const { SENDCLOUD_FROM_CITY, ...rest } = base
    void SENDCLOUD_FROM_CITY
    expect(() => parseSendcloudConfig(rest)).toThrow()
  })

  it("rejette un pays qui n'est pas un code ISO alpha-2", () => {
    expect(() => parseSendcloudConfig({ ...base, SENDCLOUD_FROM_COUNTRY: "France" })).toThrow()
  })
})
