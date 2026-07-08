"use server"

import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"
import { del } from "@vercel/blob"
import { getShippingConfig } from "@/src/lib/shipping/shippingConfig"
import { computeRequiresSpecialistCarrier } from "@/src/lib/shipping/thresholds"
import { artworkDimensionsSchema } from "@/src/lib/shema"
import { parseArtworkImages, type ArtworkImageInput } from "@/src/lib/artwork/artworkImages"

type ArtworkInput = {
    title: string
    price: number
    // Dimensions du colis (obligatoires) — pilotent devis + seuils.
    packageWeightKg?: number | null
    packageLengthCm?: number | null
    packageWidthCm?: number | null
    packageHeightCm?: number | null
    // Dimensions descriptives de l'œuvre (optionnelles).
    weightKg?: number | null
    lengthCm?: number | null
    widthCm?: number | null
    heightCm?: number | null
    pickupOnly?: boolean
    // Images déjà uploadées dans Blob par le client (B15). Ordre = ordre d'affichage voulu.
    images?: ArtworkImageInput[]
}

type ParsedShippingFields = {
    packageWeightKg: number
    packageLengthCm: number
    packageWidthCm: number
    packageHeightCm: number
    weightKg: number
    lengthCm: number
    widthCm: number
    heightCm: number
    pickupOnly: boolean
    requiresSpecialistCarrier: boolean
}

// Dimensions obligatoires (US0.1) : colis (pilote devis + seuils, sans lui aucun devis
// possible) ET œuvre (descriptif) → rejet explicite si l'une manque.
// `requiresSpecialistCarrier` se calcule sur le colis (l'objet réellement expédié).
function parseShippingFields(artwork: ArtworkInput): { error: string } | { data: ParsedShippingFields } {
    const parsed = artworkDimensionsSchema.safeParse({
        packageWeightKg: artwork.packageWeightKg,
        packageLengthCm: artwork.packageLengthCm,
        packageWidthCm: artwork.packageWidthCm,
        packageHeightCm: artwork.packageHeightCm,
        weightKg: artwork.weightKg,
        lengthCm: artwork.lengthCm,
        widthCm: artwork.widthCm,
        heightCm: artwork.heightCm,
        pickupOnly: Boolean(artwork.pickupOnly),
    })
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }
    const { pickupOnly, packageWeightKg, packageLengthCm, packageWidthCm, packageHeightCm } = parsed.data
    return {
        data: {
            packageWeightKg,
            packageLengthCm,
            packageWidthCm,
            packageHeightCm,
            weightKg: parsed.data.weightKg,
            lengthCm: parsed.data.lengthCm,
            widthCm: parsed.data.widthCm,
            heightCm: parsed.data.heightCm,
            pickupOnly,
            requiresSpecialistCarrier: computeRequiresSpecialistCarrier(
                {
                    weightKg: packageWeightKg,
                    lengthCm: packageLengthCm,
                    widthCm: packageWidthCm,
                    heightCm: packageHeightCm,
                },
                getShippingConfig()
            ),
        },
    }
}

export const createArtworkAction = async (artwork: ArtworkInput) => {
    try {
        const session = await auth()
        if (!session
            ||!session?.user
            || session?.user.role !== "ADMIN"
        ) throw new Error("non authorisé")

        const shippingFields = parseShippingFields(artwork)
        if ("error" in shippingFields) {
            return { error: shippingFields.error }
        }
        const images = parseArtworkImages(artwork.images)
        if ("error" in images) {
            return { error: images.error }
        }

        const newArtwork = await prisma.artwork.create({
            data: {
                title: artwork.title,
                price: artwork.price,
                ...shippingFields.data,
                images: { create: images.data },
            }
        })
        await prisma.certificate.create({
            data: {
                artworkId: newArtwork.id,
                issueDate: new Date(Date.now()),
                content: "certificat de test"
            }
        })
    } catch(error) {
        console.log(error)
        return {
            error: "Error while creating the artwork"
        }
    }

    redirect("/admin")
}

export const editArtworkAction = async (id: string, artwork: ArtworkInput) => {
    try {
        const session = await auth()
        if (!session
            ||!session?.user
            || session?.user.role !== "ADMIN"
        ) throw new Error("non authorisé")

        const shippingFields = parseShippingFields(artwork)
        if ("error" in shippingFields) {
            return { error: shippingFields.error }
        }
        const images = parseArtworkImages(artwork.images)
        if ("error" in images) {
            return { error: images.error }
        }

        // Remplacement du jeu d'images : on repart du set voulu (deleteMany + create dans
        // une transaction). Les images retirées par l'admin ne sont plus dans le payload →
        // leur fichier Blob doit être supprimé (best-effort, hors transaction DB).
        const existing = await prisma.artworkImage.findMany({
            where: { artworkId: id },
            select: { url: true },
        })
        const keptUrls = new Set(images.data.map((img) => img.url))
        const removedUrls = existing.filter((img) => !keptUrls.has(img.url)).map((img) => img.url)

        await prisma.$transaction([
            prisma.artworkImage.deleteMany({ where: { artworkId: id } }),
            prisma.artwork.update({
                where: { id },
                data: {
                    title: artwork.title,
                    price: artwork.price,
                    ...shippingFields.data,
                    images: { create: images.data },
                },
            }),
        ])

        if (removedUrls.length > 0) {
            try {
                await del(removedUrls)
            } catch (error) {
                // Orphelin Blob possible mais l'édition reste valide → on n'échoue pas dessus.
                console.error("Suppression Blob (édition) échouée:", error)
            }
        }
    } catch {
        return {
            error: "Error while editing the artwork"
        }
    }

    redirect("/admin")
}

export const deleteArtworkAction = async (id: string) => {
   const session = await auth()
        if (
            !session
            || !session.user
            || session.user.role !== "ADMIN"
        ) throw Error("non authorisé")

        // Supprimer les fichiers Blob AVANT l'œuvre : le onDelete Cascade nettoie les lignes
        // ArtworkImage mais PAS les fichiers Blob → sinon orphelins facturés (cf. ROADMAP B15).
        const images = await prisma.artworkImage.findMany({
            where: { artworkId: id },
            select: { url: true },
        })
        if (images.length > 0) {
            try {
                await del(images.map((img) => img.url))
            } catch (error) {
                console.error("Suppression Blob (delete œuvre) échouée:", error)
            }
        }

        await prisma.artwork.delete({
            where: {
                id: id
            }
        })

        return {
            message: "Artwork deleted"
        }

}
