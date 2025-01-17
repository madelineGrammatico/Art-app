'use client'
import { Label } from '@radix-ui/react-label'
import Form from 'next/form'
import { Input } from '@/src/components/ui/input' 
import { Button } from '@/src/components/ui/button'
import { useFormStatus } from 'react-dom'
import { createArtAction } from '../arts.action'

export default function Page() {
   
    const createArt = async (FormData: FormData) => {
        
        const json = await createArtAction({
            title: String(FormData.get('title')),
            price: String(FormData.get('price'))
        })
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
