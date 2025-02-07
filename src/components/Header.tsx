import React, { PropsWithChildren } from 'react'

type HeaderProps = PropsWithChildren

export function Header({children}: HeaderProps ) {
  return (
    <header 
      className='text-2xl font-bold'
    >
        {children}
    </header>
  )
}
