"use server"

import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"

export const createArtworkAction = async (artwork: {
    title: string, 
    price: string
}) => {
    try {
        const session = await auth()
        console.log("session : ",session)
        if (
            !session ){
                console.log("BUUUUUGGGGGG !session !!!!!!")
                throw new Error("non authorisé")
            } if (!session?.user ) {
                console.log("BUUUUUGGGGGG  !session.user !!!!!!")
                throw new Error("non authorisé")
            } if (!session?.sessionToken) {
                console.log("BUUUUUGGGGGG !session?.accessToken !!!!!!")
                throw new Error("non authorisé")
            } if (session?.user.role !== "ADMIN") {
                console.log("BUUUUUGGGGGG session?.user.role !== 'ADMIN '!!!!!!")
                throw new Error("non authorisé")
            }
         else {console.log("session ok")}

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
    } catch(error) {
        console.log(error)
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
        const session = await auth()
        if (
            !session ){
                console.log("BUUUUUGGGGGG !session !!!!!!")
            } if (!session?.user ) {
                console.log("BUUUUUGGGGGG  !session.user !!!!!!")
            } if (!session?.sessionToken) {
                console.log("BUUUUUGGGGGG !session?.accessToken !!!!!!")
            } if (session?.user.role !== "ADMIN") {
                console.log("BUUUUUGGGGGG session?.user.role !== 'ADMIN '!!!!!!")
            }
        // {console.log("BUUUUUGGGGGG !!!!!!")
        //     throw new Error("non authorisé")}
        else {console.log("session ok")}

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
   const session = await auth()
        if (
            !session 
            || !session.user 
            || !session.sessionToken
            || session.user.role !== "ADMIN"
        ) throw Error("non authorisé")
        
        delete
        await prisma.artwork.delete({
            where: {
                id: id
            }
        })
    
        return {
            message: "Artwork deleted"
        }
    
}