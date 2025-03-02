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
    return (
        <div className='flex flex-col w-full p-4 gap-4'>
            <Link
                href="/"
                className={buttonVariants({size:"lg", variant:"secondary"})}
            >Home
            </Link>

            <ArtworkForm artwork={artwork}/>
        </div>
    )
}
