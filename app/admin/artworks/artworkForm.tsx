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
  
    // "" → null (donnée manquante), sinon nombre. cleanDim côté action revalide (> 0, fini).
    const dimOrNull = (raw: FormDataEntryValue | null): number | null => {
        const s = String(raw ?? "").trim()
        return s === "" ? null : Number(s)
    }

    const onSubmit = async (FormData: FormData) => {
        let error: null | string = null
        const dims = {
            weightKg: dimOrNull(FormData.get('weightKg')),
            lengthCm: dimOrNull(FormData.get('lengthCm')),
            widthCm: dimOrNull(FormData.get('widthCm')),
            heightCm: dimOrNull(FormData.get('heightCm')),
        }
        const pickupOnly = FormData.get('pickupOnly') === 'on'
        if(artwork) {
            const json = await editArtworkAction(artwork.id, {
                title: String(FormData.get('title')),
                price: Number(FormData.get('price')),
                ...dims,
                pickupOnly,
            })
            error= json.error
        } else {
            const json = await createArtworkAction({
                title: String(FormData.get('title')),
                price: Number(FormData.get('price')),
                ...dims,
                pickupOnly,
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
                            defaultValue={String(artwork?.price)}
                            name="price"
                            className="bg-white text-black"
                        />
                    </Label>
                    <p className="text-sm text-black/80">
                        Dimensions & poids (requis pour la livraison ; sinon retrait sur place uniquement)
                    </p>
                    <Label>
                        Poids (kg)
                        <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            defaultValue={artwork?.weightKg != null ? String(artwork.weightKg) : ""}
                            name="weightKg"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label>
                        Longueur (cm)
                        <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            defaultValue={artwork?.lengthCm != null ? String(artwork.lengthCm) : ""}
                            name="lengthCm"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label>
                        Largeur (cm)
                        <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            defaultValue={artwork?.widthCm != null ? String(artwork.widthCm) : ""}
                            name="widthCm"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label>
                        Hauteur (cm)
                        <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            defaultValue={artwork?.heightCm != null ? String(artwork.heightCm) : ""}
                            name="heightCm"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label className="flex items-center gap-2">
                        <Input
                            type="checkbox"
                            name="pickupOnly"
                            defaultChecked={artwork?.pickupOnly ?? false}
                            className="h-4 w-4 shrink-0"
                        />
                        Retrait sur place uniquement (choix manuel, indépendant des dimensions)
                    </Label>
                    {artwork?.pickupOnly && (
                        <p className="text-sm font-medium text-amber-900">
                            ⚠️ Retrait sur place uniquement — choix manuel, la livraison est désactivée pour cette œuvre.
                        </p>
                    )}
                    {artwork?.requiresSpecialistCarrier && (
                        <p className="text-sm font-medium text-amber-900">
                            ⚠️ Hors gabarit transporteur standard — retrait sur place ou transporteur spécialisé.
                        </p>
                    )}
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
