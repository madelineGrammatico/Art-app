"use server"

import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { InvoiceStatus } from "@prisma/client"


export const createInvoiceAction = async(
    userId: string, 
    artworkId:string
) => {
    try{
        const session = await auth()
        if (!session || !session.user || !session.accessToken) throw new Error("non authorisé")
        const artwork = await prisma.artwork.findUnique({
            where: {id: artworkId}
        })
        if(!artwork) throw new Error("oeuvre non trouvé")

        const invoice = await prisma.invoice.create({
            data: {
                artworkId: artwork.id,
                buyerId: userId,
                amount: artwork.price,
                status: "PENDING"
            }
        })
        return invoice
    } catch(error){
        return {error: error}
    }
}

export const getUserIvoiceAction = async(userId: string) => {
    try {
        const session = await auth()
        if (
            !session 
            || !session.user 
            || !session.accessToken
        ) throw new Error("non authorisé")
        
        const user = await prisma.user.findUnique({
            where : {id: userId},
            include: {invoices: true}
        })
        if (!user) throw new Error("Utilisateur non trouvé")
        if (session.user.role!== "ADMIN" || user.id !== session.user.id) throw new Error("non authorisé")

        return user.invoices
    } catch(error) {
       return {error: error}
    }
}

export const getIvoiceAction = async(
    invoiceId: string,
) => {
    try {
        const session = await auth()
        if (
            !session 
            || !session.user 
            || !session.accessToken
        ) throw new Error("non authorisé")

        const invoice = await prisma.invoice.findUnique({
            where : {id: invoiceId}
        })
        if (!invoice) throw new Error("facture non trouvé")
        if (
            session.user.role!== "ADMIN" 
            || invoice.buyerId !== session.user.id
        ) throw new Error("non authorisé")

        return invoice
    } catch(error) {
       return {error: error}
    }
}

export const updateIvoiceAction = async(
    invoiceId: string, 
    status: InvoiceStatus,
) => {
    try {
        const session = await auth()
        if (
            !session 
            || !session.user 
            || !session.accessToken
            || session.user.role!== "ADMIN"
        ) throw new Error("non authorisé")

        const invoice = await prisma.invoice.update({
            where : {id: invoiceId},
            data: {
               status
            }
        })
        if (!invoice) throw new Error("facture non trouvé")
        
        return invoice
    } catch(error) {
       return {error: error}
    }
}