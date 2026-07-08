import { buttonVariants } from '@/src/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card'
import { prisma } from '@/src/lib/prisma'
import Link from 'next/link'
import Image from 'next/image'
import React from 'react'
import AddToBasketButton from '@/src/components/basket/AddToBasketButton'
import { ArtworkImage } from '@/src/components/reusable-ui/ArtworkImage'

type Pageprops = {params: Promise<{artworkId: string}>}

export default async function page({params}: Pageprops) {
    const {artworkId} = await params
    const artwork = await prisma.artwork.findFirst({
        where: {
            id: String(artworkId)
        },
        include: {
            // Toutes les vues dans l'ordre défini en admin (B15).
            images: { orderBy: { position: 'asc' } },
        },
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
    const primaryImage = artwork.images.find((img) => img.isPrimary) ?? artwork.images[0] ?? null

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
                    <div className='relative aspect-square w-full max-w-xl overflow-hidden rounded-lg bg-slate-800'>
                        <ArtworkImage
                            url={primaryImage?.url}
                            alt={artwork.title}
                            sizes='(min-width: 640px) 36rem, 100vw'
                            priority
                        />
                    </div>
                    {artwork.images.length > 1 && (
                        <div className='flex flex-wrap gap-2'>
                            {artwork.images.map((img) => (
                                <div
                                    key={img.id}
                                    className='relative h-20 w-20 overflow-hidden rounded-md bg-slate-800'
                                >
                                    <Image
                                        src={img.url}
                                        alt={artwork.title}
                                        fill
                                        sizes='5rem'
                                        className='object-cover'
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                    <p className='text-2xl font-bold'>{price.toFixed(2)} €</p>
                    {isAvailable ? (
                        <AddToBasketButton 
                            artworkId={artwork.id}
                            variant="default"
                            size="lg"
                        />
                    ) : (
                        <p className='text-destructive'>Cette oeuvre n&apos;est plus disponible</p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
