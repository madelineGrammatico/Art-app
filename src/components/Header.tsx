import React, { PropsWithChildren } from 'react'

type HeaderProps = PropsWithChildren

export function Header({children}: HeaderProps ) {
  return (
    <header className='bg-slate-300'>
        {children}
    </header>
  )
}
