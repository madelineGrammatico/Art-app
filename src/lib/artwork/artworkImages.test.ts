import { describe, it, expect } from "vitest"
import { normalizeImages, parseArtworkImages, type ArtworkImageInput } from "./artworkImages"

// Invariants B15 (cf. ROADMAP) : positions contiguës 0..n-1 dans l'ordre reçu, et
// EXACTEMENT une primaire. La logique serveur fait autorité — elle doit corriger un
// payload client incohérent (0 ou plusieurs primaires, positions arbitraires). Pur.

const img = (over: Partial<ArtworkImageInput> = {}): ArtworkImageInput => ({
  url: "https://x.public.blob.vercel-storage.com/artworks/a.jpg",
  pathname: "artworks/a.jpg",
  position: 0,
  isPrimary: false,
  ...over,
})

describe("normalizeImages", () => {
  it("tableau vide → []", () => {
    expect(normalizeImages([])).toEqual([])
  })

  it("réassigne des positions contiguës 0..n-1 dans l'ordre reçu (ignore les positions d'entrée)", () => {
    const out = normalizeImages([
      img({ url: "u0", position: 99 }),
      img({ url: "u1", position: 3 }),
      img({ url: "u2", position: 50 }),
    ])
    expect(out.map((i) => i.position)).toEqual([0, 1, 2])
    expect(out.map((i) => i.url)).toEqual(["u0", "u1", "u2"])
  })

  it("aucune primaire marquée → la première devient primaire", () => {
    const out = normalizeImages([img({ url: "u0" }), img({ url: "u1" })])
    expect(out.map((i) => i.isPrimary)).toEqual([true, false])
  })

  it("plusieurs primaires marquées → seule la première marquée reste primaire", () => {
    const out = normalizeImages([
      img({ url: "u0", isPrimary: false }),
      img({ url: "u1", isPrimary: true }),
      img({ url: "u2", isPrimary: true }),
    ])
    expect(out.map((i) => i.isPrimary)).toEqual([false, true, false])
  })

  it("préserve url et pathname", () => {
    const out = normalizeImages([img({ url: "https://blob/x.jpg", pathname: "artworks/x.jpg" })])
    expect(out[0]).toMatchObject({ url: "https://blob/x.jpg", pathname: "artworks/x.jpg" })
  })
})

describe("parseArtworkImages", () => {
  it("undefined → { data: [] } (œuvre sans image)", () => {
    expect(parseArtworkImages(undefined)).toEqual({ data: [] })
  })

  it("payload valide → normalisé (positions + primaire)", () => {
    const res = parseArtworkImages([
      { url: "https://blob/a.jpg", pathname: "artworks/a.jpg", position: 5, isPrimary: false },
    ])
    expect(res).toEqual({ data: [{ url: "https://blob/a.jpg", pathname: "artworks/a.jpg", position: 0, isPrimary: true }] })
  })

  it("URL invalide → erreur", () => {
    const res = parseArtworkImages([{ url: "pas-une-url", pathname: "p", position: 0, isPrimary: true }])
    expect("error" in res).toBe(true)
  })

  it("pathname manquant → erreur", () => {
    const res = parseArtworkImages([{ url: "https://blob/a.jpg", pathname: "", position: 0, isPrimary: true }])
    expect("error" in res).toBe(true)
  })

  it("position négative → erreur", () => {
    const res = parseArtworkImages([
      { url: "https://blob/a.jpg", pathname: "p", position: -1, isPrimary: true },
    ])
    expect("error" in res).toBe(true)
  })
})
