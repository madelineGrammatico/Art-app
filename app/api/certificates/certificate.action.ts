"use server"

import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"

export const editCertificateAction = async({artworkId, content}: {artworkId:string, content: string}) => {
    try{
        const session = await auth()
        console.log(session)
            if (
                !session
                || !session.user 
                || !session.sessionToken
                || session.user.role !== "ADMIN"
            ) throw new Error("non authorisé")
                
        const artwork = await prisma.artwork.findUnique({
            where: { id: artworkId }
        })
        if(!artwork) throw new Error
        // Vendue = présente sur une facture de vente (ligne de facture SALE).
        const soldCount = await prisma.invoiceLineItem.count({
            where: { artworkId, invoice: { type: "SALE" } }
        })
        if(soldCount >= 1)
        throw Error("L'oeuvre à déjà été vendue, toutes modifications du certificat est impossible")

        await prisma.certificate.update({
            where: {
                artworkId: artworkId
            },
            data: {
                content: content
            }
        })
    } catch(error){
        return {
            error: "Error while editing" + error
        }
    }
    redirect("/admin")
}