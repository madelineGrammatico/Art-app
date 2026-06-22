"use server"

import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"
import { getShippingConfig } from "@/src/lib/shipping/shippingConfig"
import { computeRequiresSpecialistCarrier } from "@/src/lib/shipping/thresholds"

type ArtworkInput = {
    title: string
    price: number
    weightKg?: number | null
    lengthCm?: number | null
    widthCm?: number | null
    heightCm?: number | null
}

// Une dimension n'est valide que strictement positive et finie ; sinon null
// (donnée manquante, US0.2 — jamais 0, qui fausserait un futur devis).
const cleanDim = (v: number | null | undefined): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null

// Dimensions nettoyées + flag transporteur spécialisé recalculé (US0.1). Le flag est
// affichage admin uniquement ; le checkout recalcule en live (spec §2).
function shippingFields(artwork: ArtworkInput) {
    const dims = {
        weightKg: cleanDim(artwork.weightKg),
        lengthCm: cleanDim(artwork.lengthCm),
        widthCm: cleanDim(artwork.widthCm),
        heightCm: cleanDim(artwork.heightCm),
    }
    return {
        ...dims,
        requiresSpecialistCarrier: computeRequiresSpecialistCarrier(dims, getShippingConfig()),
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
        
        const newArtwork = await prisma.artwork.create({
            data: {
                title: artwork.title,
                price: artwork.price,
                ...shippingFields(artwork),
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

        await prisma.artwork.update({
            where: {
                id: id
            },
            data: {
                title: artwork.title,
                price: artwork.price,
                ...shippingFields(artwork),
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