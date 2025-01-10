import React from 'react'

type HeaderProps = {title: string}

export function Header({title}: HeaderProps ) {
  return (
    <header className='p-4  bg-slate-300'>
        <p>{title}</p>
    </header>
  )
}
