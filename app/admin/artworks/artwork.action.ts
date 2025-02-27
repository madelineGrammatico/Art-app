"use server"

import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"

export const createArtworkAction = async (artwork: {
    title: string, 
    price: string
}) => {
    try {
        await prisma.artwork.create({
            data: {
                title: artwork.title,
                price: artwork.price
            }
        })
    } catch {
        return {
            error: "Error while creating the artwork"
        }
    }
   
    redirect("/")

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
            error: "Error while creating the artwork"
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