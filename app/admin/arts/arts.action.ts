"use server"

import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"

export const createArtAction = async (art: {
    title: string, 
    price: string
}) => {
    try {
        await prisma.art.create({
            data: {
                title: art.title,
                price: art.price
            }
        })
    } catch {
        return {
            errror: "Error while creating the art"
        }
    }
   
    redirect("/")

}

export const deleteArtAction = async (id: number) => {
    await prisma.art.delete({
        where: {
            id: id
        }
    })

    return {
        message: "Art deleted"
    }
}