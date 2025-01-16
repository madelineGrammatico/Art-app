'use client'
import { Label } from '@radix-ui/react-label'
import Form from 'next/form'
import { Input } from '@/src/components/ui/input' 
import { Button } from '@/src/components/ui/button'
import { useFormStatus } from 'react-dom'

export default function Page() {
    const createArt = async (FormData: FormData) => {
        const result = await fetch(`/api/arts`, {
            body: JSON.stringify({
                title: FormData.get("title"),
                price: FormData.get("price")
            }),
            method: 'POST',
        })
        const json = await result.json()
        console.log(json)
    }
   
  return (
    <Form 
        action={async (formData) => {
            await createArt(formData)
        }}
        className='flex flex-col w-full p-4 gap-4'
    >
        <Label>
            Titre
            <Input name="title"/>
        </Label>
        <Label>
            Prix
            <Input name="price"/>
        </Label>
        <SubmitButton/>
    </Form>
  )
}

const SubmitButton = () => {
    const {pending} = useFormStatus()

    return (
        <Button 
            disabled={pending}
            type="submit"
            size='lg'
        >{ pending ? "Chargement..." : "Ajouter" }</Button>
    )
}
