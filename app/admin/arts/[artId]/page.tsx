import { buttonVariants } from '@/src/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/src/components/ui/card'
import Link from 'next/link'
import React from 'react'

type Pageprops = {params: Promise<{artId: string}>}

export default async function page({params}: Pageprops) {
    const {artId} = await params
    return (
        <div className='flex flex-col w-full p-4 gap-4'>
            <Link
                href="/"
                className={buttonVariants({size:"lg", variant:"secondary"})}
            >Home
            </Link>

            <Card className='w-full'>
                <CardHeader>
                    <CardTitle>{artId}</CardTitle>
                </CardHeader>
            </Card>
        </div>
    )
}
