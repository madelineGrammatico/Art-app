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

// Vue sérialisée d'une œuvre pour le formulaire (client) : les Decimal Prisma sont
// convertis en string/number côté serveur avant de traverser la frontière RSC → pas de
// warning « Decimal objects are not supported ».
export type ArtworkFormData = {
  id: string
  title: string
  price: number | string
  weightKg: number | string | null
  lengthCm: number | string | null
  widthCm: number | string | null
  heightCm: number | string | null
  packageWeightKg: number | string | null
  packageLengthCm: number | string | null
  packageWidthCm: number | string | null
  packageHeightCm: number | string | null
  pickupOnly: boolean
  requiresSpecialistCarrier: boolean
}

export function ArtworkForm({artwork}: {artwork?: ArtworkFormData}) {

    // "" → null (donnée manquante), sinon nombre. cleanDim côté action revalide (> 0, fini).
    const dimOrNull = (raw: FormDataEntryValue | null): number | null => {
        const s = String(raw ?? "").trim()
        return s === "" ? null : Number(s)
    }

    const onSubmit = async (FormData: FormData) => {
        let error: null | string = null
        const dims = {
            // Colis (obligatoire) — pilote le devis et les seuils transporteur.
            packageWeightKg: dimOrNull(FormData.get('packageWeightKg')),
            packageLengthCm: dimOrNull(FormData.get('packageLengthCm')),
            packageWidthCm: dimOrNull(FormData.get('packageWidthCm')),
            packageHeightCm: dimOrNull(FormData.get('packageHeightCm')),
            // Œuvre (descriptif, optionnel).
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

    const dimDefault = (v: number | string | null | undefined): string =>
        v != null ? String(v) : ""

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
                            defaultValue={dimDefault(artwork?.price)}
                            name="price"
                            className="bg-white text-black"
                        />
                    </Label>

                    <p className="text-sm font-semibold text-black">
                        Dimensions du colis expédié (obligatoire)
                    </p>
                    <p className="text-xs text-black/70 -mt-2">
                        Œuvre emballée (caisse, calage). Sert au calcul des frais de port ;
                        sans elles, seul le retrait sur place est possible.
                    </p>
                    <Label>
                        Poids du colis (kg)
                        <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            defaultValue={dimDefault(artwork?.packageWeightKg)}
                            name="packageWeightKg"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label>
                        Longueur du colis (cm)
                        <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            defaultValue={dimDefault(artwork?.packageLengthCm)}
                            name="packageLengthCm"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label>
                        Largeur du colis (cm)
                        <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            defaultValue={dimDefault(artwork?.packageWidthCm)}
                            name="packageWidthCm"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label>
                        Hauteur du colis (cm)
                        <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            defaultValue={dimDefault(artwork?.packageHeightCm)}
                            name="packageHeightCm"
                            className="bg-white text-black"
                        />
                    </Label>

                    <p className="text-sm font-semibold text-black mt-2">
                        Dimensions de l&apos;œuvre (obligatoire)
                    </p>
                    <p className="text-xs text-black/70 -mt-2">
                        Descriptif de l&apos;œuvre nue (fiche) — n&apos;entre pas dans le
                        calcul des frais de port.
                    </p>
                    <Label>
                        Poids de l&apos;œuvre (kg)
                        <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            defaultValue={dimDefault(artwork?.weightKg)}
                            name="weightKg"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label>
                        Longueur de l&apos;œuvre (cm)
                        <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            defaultValue={dimDefault(artwork?.lengthCm)}
                            name="lengthCm"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label>
                        Largeur de l&apos;œuvre (cm)
                        <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            defaultValue={dimDefault(artwork?.widthCm)}
                            name="widthCm"
                            className="bg-white text-black"
                        />
                    </Label>
                    <Label>
                        Hauteur de l&apos;œuvre (cm)
                        <Input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            defaultValue={dimDefault(artwork?.heightCm)}
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
