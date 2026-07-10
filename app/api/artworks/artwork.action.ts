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

        // Diff du jeu d'images (identité = url du blob) plutôt qu'un deleteMany+recreate
        // global : on ne touche que ce qui change → les lignes conservées gardent leur id
        // et leur createdAt (pas de churn). Retirées → supprimées (+ blob del best-effort) ;
        // nouvelles → créées ; conservées dont position/isPrimary bougent → mises à jour.
        const existing = await prisma.artworkImage.findMany({
            where: { artworkId: id },
            select: { id: true, url: true, position: true, isPrimary: true },
        })
        const existingByUrl = new Map(existing.map((img) => [img.url, img]))
        const desiredUrls = new Set(images.data.map((img) => img.url))

        const removed = existing.filter((img) => !desiredUrls.has(img.url))
        const toCreate = images.data.filter((img) => !existingByUrl.has(img.url))
        const toUpdate = images.data.filter((img) => {
            const prev = existingByUrl.get(img.url)
            return prev && (prev.position !== img.position || prev.isPrimary !== img.isPrimary)
        })
        const removedUrls = removed.map((img) => img.url)

        await prisma.$transaction([
            ...(removed.length > 0
                ? [prisma.artworkImage.deleteMany({ where: { id: { in: removed.map((img) => img.id) } } })]
                : []),
            ...toUpdate.map((img) =>
                prisma.artworkImage.update({
                    where: { id: existingByUrl.get(img.url)!.id },
                    data: { position: img.position, isPrimary: img.isPrimary },
                })
            ),
            prisma.artwork.update({
                where: { id },
                data: {
                    title: artwork.title,
                    price: artwork.price,
                    ...shippingFields.data,
                    images: { create: toCreate },
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
