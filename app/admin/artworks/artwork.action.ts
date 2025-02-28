"use server"

import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"

export const createArtworkAction = async (artwork: {
    title: string, 
    price: string
}) => {
    try {
        const newArtwork = await prisma.artwork.create({
            data: {
                title: artwork.title,
                price: artwork.price
            }
        })
        await prisma.certificate.create({
            data: {
                artworkId: newArtwork.id,
                isssueDate: new Date(Date.now()),
                content: "certificat de test"
            }
        })
    } catch {
        return {
            error: "Error while creating the artwork"
        }
    }
   
    redirect("/admin")
}

export const editArtworkAction = async (id: string, artwork: {
    title: string, 
    price: string
}) => {
    try {
        await prisma.artwork.update({
            where: {
                id: id
            },
            data: {
                title: artwork.title,
                price: artwork.price
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
    await prisma.artwork.delete({
        where: {
            id: id
        }
    })

    return {
        message: "Artwork deleted"
    }
}