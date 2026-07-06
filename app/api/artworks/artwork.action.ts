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
    weightKg?: number | null
    lengthCm?: number | null
    widthCm?: number | null
    heightCm?: number | null
    pickupOnly?: boolean
}

type ParsedShippingFields = {
    weightKg: number
    lengthCm: number
    widthCm: number
    heightCm: number
    pickupOnly: boolean
    requiresSpecialistCarrier: boolean
}

// Poids/dimensions obligatoires (US0.1) : sans elles, aucun devis transporteur n'est
// jamais possible (cf. artworkBlocksDelivery) → rejet explicite au lieu du silencieux
// repli sur `null` d'avant B14 (une œuvre incomplète est un retrait forcé côté
// checkout, pas un cas normal côté admin).
function parseShippingFields(artwork: ArtworkInput): { error: string } | { data: ParsedShippingFields } {
    const parsed = artworkDimensionsSchema.safeParse({
        weightKg: artwork.weightKg,
        lengthCm: artwork.lengthCm,
        widthCm: artwork.widthCm,
        heightCm: artwork.heightCm,
        pickupOnly: Boolean(artwork.pickupOnly),
    })
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }
    const { pickupOnly, ...dims } = parsed.data
    return {
        data: {
            ...dims,
            pickupOnly,
            requiresSpecialistCarrier: computeRequiresSpecialistCarrier(dims, getShippingConfig()),
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