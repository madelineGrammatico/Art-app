import React from 'react'
import { Card, CardHeader, CardTitle } from '@/src/components/ui/card'
import Link from 'next/link'
import { buttonVariants } from '@/src/components/ui/button'

export default function Page() {
  return (
    <div>
        <Link 
            href="/"
            className={buttonVariants({size:"lg", variant:"outline"})} 
        >Art
        </Link>
        <Card className='w-full'>
            <CardHeader>
                <CardTitle>URL : /admin</CardTitle>
            </CardHeader>
        </Card>
    </div>
  )
}
