import { buttonVariants } from '@/src/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/src/components/ui/card'
import { prisma } from '@/src/lib/prisma'
import Link from 'next/link'
import React from 'react'
import { ArtworkForm } from '../artworkForm'

type Pageprops = {params: Promise<{artworkId: string}>}

export default async function page({params}: Pageprops) {
    const {artworkId} = await params
    const artwork = await prisma.artwork.findFirst({
        where: {
            id: String(artworkId)
        }
    })
    if (!artwork) return (
        <Card className='w-full'>
            <CardHeader>
                <CardTitle>{`l'oeuvre avec l'id ${artwork} n'exixte pas`}</CardTitle>
            </CardHeader>
        </Card>
    )
    // Sérialiser les Decimal Prisma en string avant de traverser la frontière RSC
    // (un composant client ne peut pas recevoir d'objets Decimal, cf. warning console).
    const dim = (d: { toString(): string } | null) => (d != null ? d.toString() : null)
    const artworkForForm = {
        id: artwork.id,
        title: artwork.title,
        price: artwork.price.toString(),
        weightKg: dim(artwork.weightKg),
        lengthCm: dim(artwork.lengthCm),
        widthCm: dim(artwork.widthCm),
        heightCm: dim(artwork.heightCm),
        packageWeightKg: dim(artwork.packageWeightKg),
        packageLengthCm: dim(artwork.packageLengthCm),
        packageWidthCm: dim(artwork.packageWidthCm),
        packageHeightCm: dim(artwork.packageHeightCm),
        pickupOnly: artwork.pickupOnly,
        requiresSpecialistCarrier: artwork.requiresSpecialistCarrier,
    }

    return (
        <div className='flex flex-col w-full p-4 gap-4'>
            <Link
                href="/"
                className={buttonVariants({size:"lg", variant:"secondary"})}
            >Home
            </Link>

            <ArtworkForm artwork={artworkForForm}/>
        </div>
    )
}
