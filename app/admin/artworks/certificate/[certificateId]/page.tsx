import { Card } from "@/src/components/ui/card"
import { prisma } from "@/src/lib/prisma"

type Pageprops = {params: Promise<{certificateId: string}>}

export default async function Page({params}: Pageprops) {
    const {certificateId} = await params
    const certificate = await prisma.certificate.findUnique({
        where: {id: certificateId},
        include: { artwork: true}
    })
    if (!certificate) throw new Error("certificat non trouvé")
    if (!certificate.artwork) throw new Error("oeuvre liée au certificat non trouvée")
    return(
        <Card className="w-full rounded-2xl max-w-sm mx-auto my-8 text-white p-6  bg-slate-400">
            <h1>Certificat</h1>
            <p>{"title : "+ certificate.artwork.title}</p>
            <p>{"date d'émission : " + certificate.issueDate.toDateString()}</p>
            <h2>{certificate.content}</h2>
        </Card>
    )
}