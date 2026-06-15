"use server"

import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { InvoiceStatus } from "@prisma/client"


export const getUserInvoiceAction = async(userId: string) => {
    try {
        const session = await auth()
        if (!session || !session.user) throw new Error("non authorisé")

        const user = await prisma.user.findUnique({
            where : {id: userId},
            include: {invoices: true}
        })
        if (!user) throw new Error("Utilisateur non trouvé")
        if (session.user.role !== "ADMIN" && user.id !== session.user.id) throw new Error("non authorisé")

        return user.invoices
    } catch(error) {
        console.error(error)
        return { error: error instanceof Error ? error.message : "Erreur lors de la récupération des factures" }
    }
}

export const getInvoiceAction = async(
    invoiceId: string,
) => {
    try {
        const session = await auth()
        if (!session || !session.user) throw new Error("non authorisé")

        const invoice = await prisma.invoice.findUnique({
            where : {id: invoiceId}
        })
        if (!invoice) throw new Error("facture non trouvé")
        if (
            session.user.role !== "ADMIN"
            && invoice.buyerId !== session.user.id
        ) throw new Error("non authorisé")

        return invoice
    } catch(error) {
        console.error(error)
        return { error: error instanceof Error ? error.message : "Erreur lors de la récupération de la facture" }
    }
}

export const updateInvoiceAction = async(
    invoiceId: string,
    status: InvoiceStatus,
) => {
    try {
        const session = await auth()
        if (
            !session
            || !session.user
            || session.user.role !== "ADMIN"
        ) throw new Error("non authorisé")

        const invoice = await prisma.invoice.update({
            where : {id: invoiceId},
            data: {
               status
            }
        })

        return invoice
    } catch(error) {
        console.error(error)
        return { error: error instanceof Error ? error.message : "Erreur lors de la mise à jour de la facture" }
    }
}
