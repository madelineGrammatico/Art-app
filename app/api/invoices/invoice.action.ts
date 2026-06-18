"use server"

import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { hasPermissions } from "@/src/lib/auth/permissions/permissions"
import { refundSale } from "@/src/lib/invoice/refundSale"


export const getUserInvoiceAction = async(userId: string) => {
    try {
        const session = await auth()
        if (!session || !session.user) throw new Error("non authorisé")

        const user = await prisma.user.findUnique({
            where : {id: userId},
            // Les factures archivées (soft-delete, US6.2) sont exclues des vues actives.
            include: {invoices: {where: {archivedAt: null}, include: {lineItems: true}}}
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
            where : {id: invoiceId},
            include: {lineItems: true}
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

// Pas d'updateInvoiceAction : une facture émise est immuable (B13 EPIC 6).
// Toute correction passe par une facture d'avoir (CREDIT_NOTE).

// Remboursement après-vente (B13 EPIC 5) : réservé ADMIN (permission refund:invoice).
// Délègue à refundSale (Stripe + avoir + remise en vente + email). En attendant l'UI
// admin, c'est le point d'entrée RBAC du flux. artworkIds omis = remboursement total.
export const refundSaleAction = async (args: {
    invoiceId: string
    artworkIds?: string[]
}) => {
    try {
        const session = await auth()
        if (!session || !session.user) throw new Error("non authorisé")
        if (!hasPermissions(session.user.role, "refund:invoice")) throw new Error("non authorisé")

        const creditNote = await refundSale(args)

        // Sérialisation client : pas de Decimal au-delà de la frontière server action.
        return {
            id: creditNote.id,
            number: creditNote.number,
            creditedInvoiceId: creditNote.creditedInvoiceId,
            totalTTC: Number(creditNote.totalTTC),
        }
    } catch (error) {
        console.error(error)
        return { error: error instanceof Error ? error.message : "Erreur lors du remboursement" }
    }
}

// Archivage d'une facture (B13 EPIC 6, US6.2) : SEULE façon sanctionnée de « retirer »
// une facture. On ne supprime JAMAIS en dur (conservation légale 10 ans) ; on pose
// archivedAt → la pièce sort des vues actives mais reste conservée et accessible.
// Réservé ADMIN (permission delete:invoice). Idempotent.
export const archiveInvoiceAction = async (invoiceId: string) => {
    try {
        const session = await auth()
        if (!session || !session.user) throw new Error("non authorisé")
        if (!hasPermissions(session.user.role, "delete:invoice")) throw new Error("non authorisé")

        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
        if (!invoice) throw new Error("facture non trouvé")

        if (invoice.archivedAt) {
            return { id: invoice.id, archivedAt: invoice.archivedAt.toISOString() }
        }

        const archived = await prisma.invoice.update({
            where: { id: invoiceId },
            data: { archivedAt: new Date() },
        })
        return { id: archived.id, archivedAt: archived.archivedAt!.toISOString() }
    } catch (error) {
        console.error(error)
        return { error: error instanceof Error ? error.message : "Erreur lors de l'archivage de la facture" }
    }
}
