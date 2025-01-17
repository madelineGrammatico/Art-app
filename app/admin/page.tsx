import React from 'react'
import { Card, CardContent} from '@/src/components/ui/card'
import Link from 'next/link'
import { buttonVariants } from '@/src/components/ui/button'
import { prisma } from '@/src/lib/prisma'
import { DeleteArtButton } from './deleteArtButton'

export default async function Page() {
     const arts = await prisma.art.findMany({
        orderBy: {
            createdAt: "desc"
        }
    })
    return (
        <Card className='w-full'>
            
            <CardContent className='flex flex-col w-full p-6 gap-4'>
                { arts.map((art)=> 
                    <Card className="flex items-start gap-4 p-4" key={art.id}>
                        <div className='flex flex-col flex-1 gap-2'>
                            <h2 className=''>{art.title}</h2>
                            <p>{art.price}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <DeleteArtButton id={art.id}/>
                            <Link
                                href={`admin/arts/${art.id}`}
                                className={buttonVariants({size: "sm", variant: "outline"})}
                            >edit</Link>
                        </div>
                        
                    </Card>
                )}
                <Link 
                    href="/admin/arts/new"
                    className={buttonVariants({size:"lg"})} 
                >
                    Ajouter une nouvelle oeuvre
                </Link>
            </CardContent>
        </Card>
    )
}
