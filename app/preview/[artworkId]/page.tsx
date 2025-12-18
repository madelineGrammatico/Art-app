import { buttonVariants } from '@/src/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card'
import { prisma } from '@/src/lib/prisma'
import Link from 'next/link'
import React from 'react'
import AddToBasketButton from '@/src/components/basket/AddToBasketButton'

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
    
    const price = Number(artwork.price)
    const isAvailable = artwork.ownerId === null
    
    return (
        <div className='flex flex-col w-full py-4 gap-4'>
            <Link
                href="/"
                className={buttonVariants({size:"lg", variant:"secondary"})}
            >Home
            </Link>

            <Card className='w-full'>
                <CardHeader>
                    <CardTitle>{artwork.title}</CardTitle>
                </CardHeader>
                <CardContent className='flex flex-col gap-4'>
                    <p className='text-2xl font-bold'>{price.toFixed(2)} €</p>
                    {isAvailable ? (
                        <AddToBasketButton 
                            artworkId={artwork.id}
                            variant="default"
                            size="lg"
                        />
                    ) : (
                        <p className='text-destructive'>Cette oeuvre n'est plus disponible</p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
