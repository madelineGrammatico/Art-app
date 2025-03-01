import { prisma } from "@/src/lib/prisma";
import { CertificateForm } from "../../certificatForm";

type Pageprops = {params: Promise<{artworkId: string}>}

export default async function page({params}: Pageprops) {
    const {artworkId} = await params
    const certificate = await prisma.certificate.findUnique({ where: {artworkId: artworkId}})
    if (!certificate) throw new Error("Certificat non trouvé")
    return(
        <CertificateForm certificate={certificate}/>
    )
}