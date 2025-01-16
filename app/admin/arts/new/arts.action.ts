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