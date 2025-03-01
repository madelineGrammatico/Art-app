import { buttonVariants } from '@/src/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/src/components/ui/card'
import { prisma } from '@/src/lib/prisma'
import Link from 'next/link'
import React from 'react'
import { ArtForm } from '../artForm'

type Pageprops = {params: Promise<{artId: string}>}

export default async function page({params}: Pageprops) {
    const {artId} = await params
    const art = await prisma.art.findFirst({
        where: {
            id: Number(artId)
        }
    })
    if (!art) return (
        <Card className='w-full'>
            <CardHeader>
                <CardTitle>{`l'oeuvre avec l'id ${art} n'exixte pas`}</CardTitle>
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

            <ArtForm art={art}/>
        </div>
    )
}
