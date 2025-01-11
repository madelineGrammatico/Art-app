import React from 'react'
import { Card, CardHeader, CardTitle } from '@/src/components/ui/card'
import Link from 'next/link'
import { buttonVariants } from '@/src/components/ui/button'

export default function Page() {
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
        <Link 
            href="/admin/arts/new"
            className={buttonVariants({size:"lg"})} 
        >Ajouter une nouvelle oeuvre
        </Link>
    </div>
  )
}
