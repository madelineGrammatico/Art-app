import React, { PropsWithChildren } from 'react'

type HeaderProps = {title?: string} &PropsWithChildren

export function Header({title, children}: HeaderProps ) {
  return (
    <header className='flex flex-row p-4  items-center bg-slate-300'>
        {title && <p className='flex-1'>{title}</p>}
        {children}
    </header>
  )
}
