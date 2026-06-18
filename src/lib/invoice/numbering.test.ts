import { describe, it, expect } from "vitest"
import { prisma } from "@/src/lib/prisma"
import { nextInvoiceNumber, formatInvoiceNumber } from "./numbering"

// US1.2 — Numéro séquentiel unique, sans trou, chronologique, par série.

const num = (type: "SALE" | "CREDIT_NOTE", year: number) =>
  prisma.$transaction((tx) => nextInvoiceNumber(tx, type, year))

describe("nextInvoiceNumber", () => {
  it("formate INV-/CN- avec séquence sur 6 chiffres", () => {
    expect(formatInvoiceNumber("SALE", 2026, 1)).toBe("INV-2026-000001")
    expect(formatInvoiceNumber("CREDIT_NOTE", 2026, 42)).toBe("CN-2026-000042")
  })

  it("incrémente séquentiellement (N puis N+1)", async () => {
    expect(await num("SALE", 2026)).toBe("INV-2026-000001")
    expect(await num("SALE", 2026)).toBe("INV-2026-000002")
    expect(await num("SALE", 2026)).toBe("INV-2026-000003")
  })

  it("tient des séries indépendantes par type", async () => {
    expect(await num("SALE", 2026)).toBe("INV-2026-000001")
    expect(await num("CREDIT_NOTE", 2026)).toBe("CN-2026-000001")
    expect(await num("SALE", 2026)).toBe("INV-2026-000002")
    expect(await num("CREDIT_NOTE", 2026)).toBe("CN-2026-000002")
  })

  it("tient des séries indépendantes par année", async () => {
    expect(await num("SALE", 2026)).toBe("INV-2026-000001")
    expect(await num("SALE", 2027)).toBe("INV-2027-000001")
    expect(await num("SALE", 2026)).toBe("INV-2026-000002")
  })

  it("ne laisse pas de trou si la transaction rollback", async () => {
    expect(await num("SALE", 2026)).toBe("INV-2026-000001")

    // Transaction qui réserve un numéro puis échoue → l'incrément doit être annulé.
    await expect(
      prisma.$transaction(async (tx) => {
        await nextInvoiceNumber(tx, "SALE", 2026) // réserverait 000002
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")

    // Le numéro 000002 n'a pas été consommé.
    expect(await num("SALE", 2026)).toBe("INV-2026-000002")
  })

  it("attribue des numéros distincts et contigus sous concurrence", async () => {
    const N = 20
    const results = await Promise.all(
      Array.from({ length: N }, () => num("SALE", 2026))
    )
    const unique = new Set(results)
    expect(unique.size).toBe(N) // aucun doublon

    const seqs = results
      .map((r) => Number(r.split("-")[2]))
      .sort((a, b) => a - b)
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1)) // 1..N sans trou
  })
})
