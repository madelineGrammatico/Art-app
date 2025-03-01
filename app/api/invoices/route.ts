"use server"

import { prisma } from "@/src/lib/prisma"
import { InvoiceStatus } from "@prisma/client"

export const createInvoiceAction = async(
    // token: string,
    userId: string, 
    artworkId:string
) => {
    try{
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
    }catch(error){
        return {error: error}
    }
}

export const getUserIvoiceAction = async(userId: string) => {
    try {
        const user = await prisma.user.findUnique({
            where : {id: userId},
            include: {invoices: true}
        })
        if (!user) throw new Error("Utilisateur non trouvé")
        return user.invoices
    } catch(error) {
       return {error: error}
    }
}

export const getIvoiceAction = async(
    invoiceId: string,
    // token: string
) => {
    try {
        const invoice = await prisma.invoice.findUnique({
            where : {id: invoiceId}
        })
        if (!invoice) throw new Error("facture non trouvé")
        return invoice
    } catch(error) {
       return {error: error}
    }
}

export const updateIvoiceAction = async(
    invoiceId: string, 
    status: InvoiceStatus, 
    // token: string
) => {
    try {
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