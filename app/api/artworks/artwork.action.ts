"use server"

import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"
import { getShippingConfig } from "@/src/lib/shipping/shippingConfig"
import { computeRequiresSpecialistCarrier } from "@/src/lib/shipping/thresholds"
import { artworkDimensionsSchema } from "@/src/lib/shema"

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
}

type ParsedShippingFields = {
    packageWeightKg: number
    packageLengthCm: number
    packageWidthCm: number
    packageHeightCm: number
    weightKg: number | null | undefined
    lengthCm: number | null | undefined
    widthCm: number | null | undefined
    heightCm: number | null | undefined
    pickupOnly: boolean
    requiresSpecialistCarrier: boolean
}

// Dimensions du COLIS obligatoires (US0.1) : sans elles, aucun devis transporteur n'est
// jamais possible (cf. artworkBlocksDelivery) → rejet explicite. Les dimensions
// descriptives de l'œuvre restent optionnelles. `requiresSpecialistCarrier` se calcule
// sur le colis (l'objet réellement expédié).
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
        console.log("artwork : ", artwork)
        const session = await auth()
        if (!session 
            ||!session?.user 
            // ||!session?.sessionToken 
            || session?.user.role !== "ADMIN"
        ) throw new Error("non authorisé")

        const shippingFields = parseShippingFields(artwork)
        if ("error" in shippingFields) {
            return { error: shippingFields.error }
        }

        const newArtwork = await prisma.artwork.create({
            data: {
                title: artwork.title,
                price: artwork.price,
                ...shippingFields.data,
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
            // ||!session?.sessionToken
            || session?.user.role !== "ADMIN"
        ) throw new Error("non authorisé")

        const shippingFields = parseShippingFields(artwork)
        if ("error" in shippingFields) {
            return { error: shippingFields.error }
        }

        await prisma.artwork.update({
            where: {
                id: id
            },
            data: {
                title: artwork.title,
                price: artwork.price,
                ...shippingFields.data,
            }
        })
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
            // || !session.sessionToken
            || session.user.role !== "ADMIN"
        ) throw Error("non authorisé")
        
        await prisma.artwork.delete({
            where: {
                id: id
            }
        })
    
        return {
            message: "Artwork deleted"
        }
    
}