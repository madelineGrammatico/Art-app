import React from 'react'
import { Card, CardContent} from '@/src/components/ui/card'
import Link from 'next/link'
import { Button, buttonVariants } from '@/src/components/ui/button'
import { prisma } from '@/src/lib/prisma'
import { DeleteArtworkButton } from './deleteArtworkButton' 
import { hasPermissions } from '@/src/lib/auth/permissions/permissions'
import { auth } from '@/src/lib/auth/auth'
import { UserRole } from '@prisma/client'

export default async function Page() {
    const session = await auth()
    const role = session?.user?.role as UserRole
     const artworks = await prisma.artwork.findMany({
        orderBy: {
            createdAt: "desc"
        },
        include:{certificate:true}
    })
    return (
        <Card className='w-full rounded-2xl'>
            <CardContent className='flex flex-col w-full p-6 gap-4 bg-slate-400'>
                { artworks.map((artwork)=> 
                    <Card className="flex items-start gap-4 p-4" key={artwork.id}>
                        <div className='flex flex-col flex-1 gap-2'>
                            <h2 className=''>{artwork.title}</h2>
                            <p>{artwork.price}</p>
                        </div>
                        <div className="flex flex-col gap-2">

                            { hasPermissions(role, 'update:artworks') &&<Link
                                href={`admin/artworks/${artwork.id}`}
                                className={buttonVariants({size: "sm", variant: "outline"})}
                            >edit</Link>}

                            { hasPermissions(role, 'update:artworks') && artwork.certificate &&
                                <><Button>Voir certificat</Button><Button>Modifier certificat</Button></> }

                            { hasPermissions(role, 'delete:artworks') && (<DeleteArtworkButton id={artwork.id}/>) }
                        </div>
                        
                    </Card>
                )}
                <Link 
                    href="/admin/artworks/newArtwork"
                    className={buttonVariants({size:"lg"})} 
                >
                    Ajouter une nouvelle oeuvre
                </Link>
            </CardContent>
        </Card>
    )
}
