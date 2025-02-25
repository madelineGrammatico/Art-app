import React, { PropsWithChildren } from 'react'
import { Header } from '@/src/components/Header'
import { auth } from '@/src/lib/auth/auth'
import { redirect } from 'next/navigation'

export default async function layout({children}: PropsWithChildren) {
  const session = await auth()
  if(session?.user.role !== "ADMIN") {redirect("/")}
  return (
    <div className='flex flex-col w-full  gap-4'>
                <Header>URL : /admin</Header>
        {children}
    </div>
  )
}
