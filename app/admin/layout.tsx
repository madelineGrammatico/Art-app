import React, { PropsWithChildren } from 'react'
import { Header } from '@/src/components/Header'

export default function layout({children}: PropsWithChildren) {
  return (
    <div className='flex flex-col w-full p-4 gap-4'>
                <Header>URL : /admin</Header>
        {children}
    </div>
  )
}
