import { artworkImagesSchema } from "@/src/lib/shema"

// Logique PURE de normalisation des images d'œuvre (B15), extraite de la server action
// pour être testable (un fichier "use server" ne peut exporter que des fonctions async).

export type ArtworkImageInput = {
    url: string
    pathname: string
    position: number
    isPrimary: boolean
}

// Autorité sur les invariants (cf. ROADMAP B15) : positions contiguës 0..n-1 dans l'ordre
// reçu (= ordre du D&D admin) et EXACTEMENT une primaire (la première marquée, sinon la 1ʳᵉ).
// Neutralise un client qui enverrait 0 ou plusieurs primaires, ou des positions incohérentes.
export function normalizeImages(images: ArtworkImageInput[]): ArtworkImageInput[] {
    if (images.length === 0) return []
    const flagged = images.findIndex((img) => img.isPrimary)
    const primary = flagged === -1 ? 0 : flagged
    return images.map((img, i) => ({
        url: img.url,
        pathname: img.pathname,
        position: i,
        isPrimary: i === primary,
    }))
}

// Valide (Zod) puis normalise. `images` peut être undefined (œuvre sans image → []).
export function parseArtworkImages(
    images: unknown
): { error: string } | { data: ArtworkImageInput[] } {
    const parsed = artworkImagesSchema.safeParse(images ?? [])
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }
    return { data: normalizeImages(parsed.data) }
}
