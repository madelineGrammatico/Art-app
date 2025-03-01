"use server"

import { prisma } from "@/src/lib/prisma"
import { redirect } from "next/navigation"

export const editCertificateAction = async({artworkId, content}: {artworkId:string, content: string}) => {
    try{
        const artwork = await prisma.artwork.findUnique({ 
            where: { id: artworkId },
            include: {invoice: true}
        })
        if(!artwork) throw new Error
        if(artwork.invoice.length >= 1) 
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