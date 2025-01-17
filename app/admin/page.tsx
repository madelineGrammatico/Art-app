import React from 'react'
import { Card, CardHeader, CardTitle } from '@/src/components/ui/card'
import Link from 'next/link'
import { buttonVariants } from '@/src/components/ui/button'
import { prisma } from '@/src/lib/prisma'
import { DeleteCitationButton } from './delete-citation-button'

export default async function Page() {
     const arts = await prisma.art.findMany({
        orderBy: {
            createdAt: "desc"
        }
    })
  return (
    <div className='flex flex-col w-full p-4 gap-4'>
        <Link 
            href="/"
            className={buttonVariants({size:"lg", variant:"outline"})} 
        >Arts
        </Link>
        <Card className='w-full'>
            <CardHeader>
                <CardTitle>URL : /admin</CardTitle>
            </CardHeader>
        </Card>
        { arts.map((art)=> 
            <Card className="flex items-start gap-4 p-4" key={art.id}>
                <div className='flex flex-col flex-1 gap-2'>
                    <h2 className=''>{art.title}</h2>
                    <p>{art.price}</p>
                </div>
                <DeleteCitationButton id={art.id}/>
            </Card>
        )}
        <Link 
            href="/admin/arts/new"
            className={buttonVariants({size:"lg"})} 
        >Ajouter une nouvelle oeuvre
        </Link>
    </div>
  )
}
