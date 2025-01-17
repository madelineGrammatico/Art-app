import React, { PropsWithChildren } from 'react'

type HeaderProps = {title?: string} &PropsWithChildren

export function Header({title, children}: HeaderProps ) {
  return (
    <header className='p-4  bg-slate-300'>
        <p>{title ? title : children}</p>
    </header>
  )
}
