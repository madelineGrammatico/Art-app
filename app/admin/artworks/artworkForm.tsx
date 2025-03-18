'use client'
import { Label } from '@radix-ui/react-label'
import Form from 'next/form'
import { Input } from '@/src/components/ui/input' 
import { Button } from '@/src/components/ui/button'
import { useFormStatus } from 'react-dom'
import { createArtworkAction, editArtworkAction } from '../../api/artworks/artwork.action' 
import React from 'react'
import { Header } from '@/src/components/Header'
import { Card } from '@/src/components/ui/card'
import { Artwork } from '@prisma/client'

export function ArtworkForm({artwork}: {artwork?: Artwork}) {
  
    const onSubmit = async (FormData: FormData) => {
        let error: null | string = null
        if(artwork) {
            const json = await editArtworkAction(artwork.id, {
                title: String(FormData.get('title')),
                price: String(FormData.get('price'))
            })
            error= json.error
        } else {
            const json = await createArtworkAction({
                title: String(FormData.get('title')),
                price: String(FormData.get('price'))
            })
            error= json.error
        }
        if (error) {
            alert(error)
        }
    }

    return (
        <Card className='w-full rounded-2xl max-w-sm mx-auto my-8 text-white'>
            <div className='p-6  bg-slate-400'>
                <Header>{artwork ? 
                    "Modifier une oeuvre"
                    : "Ajouter une oeuvre"}
                    </Header>
                <Form 
                    action={async (formData) => {
                        await onSubmit(formData)
                    }}
                    className='flex flex-col w-full gap-4'
                >
                    <Label>
                        Titre
                        <Input 
                            defaultValue={artwork?.title}
                            name="title"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label>
                        Prix
                        <Input 
                            defaultValue={artwork?.price}
                            name="price"
                            className="bg-white text-black"
                        />
                    </Label>
                    <SubmitButton/>
                </Form>
            </div>
        </Card>
        
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
