"use server"

import { prisma } from "@/src/lib/prisma"
import { Certificate } from "@prisma/client"

export const editCertificateAction = async(artworkId: string, certificate: Certificate) => {
    try{
        await prisma.certificate.update({
            where: {
                artworkId: artworkId
            },
            data: {
                content: certificate.content
            }
        })
    } catch(error) {
        return {
            error: error
        }
    }
}