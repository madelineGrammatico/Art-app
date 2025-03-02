import { editCertificateAction } from "@/app/api/certificates/certificate.action"
import { Header } from "@/src/components/Header"
import { Button } from "@/src/components/ui/button"
import { Card } from "@/src/components/ui/card"
import { Input } from "@/src/components/ui/input"
import { Label } from "@radix-ui/react-menubar"
import { Certificate } from '@prisma/client'
import Form from "next/form"

export function CertificateForm({certificate} : {certificate: Certificate}) {
    const onSubmit = async(formData: FormData) => {
        "use server"
        let error: string | null = null
        const json = await editCertificateAction({
            artworkId: certificate.artworkId,
            content: String(formData.get('content'))
        })
        error = json.error
        if (error) {
            throw new Error(error)
        }
    }
    return(
        <Card className='w-full rounded-2xl max-w-sm mx-auto my-8 text-white'>
            <div className='p-6  bg-slate-400'>
                <Header>Modifier un certificat</Header>
                <Form 
                    action = {async (formData) => {
                        "use server"
                        await onSubmit(formData)
                    }}
                    className ='flex flex-col w-full gap-4'
                >
                    <Label>
                        Content
                        <Input 
                            defaultValue ={certificate.content}
                            name ="content"
                            className ="bg-white text-black"
                            required
                        />
                    </Label>
                    <Button type ="submit">Modifier Certificat</Button>
                </Form>
            </div>
        </Card>

    )
}