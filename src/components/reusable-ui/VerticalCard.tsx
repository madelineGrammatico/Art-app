import React from 'react'
import { buttonVariants } from '../ui/button'
import Link from 'next/link'
import AddToBasketButton from '../basket/AddToBasketButton'

type VerticalCardProps = {
  title: string, 
  linkPage: string, 
  index: number,
  artworkId: string,
}
export default function VerticalCard({title, linkPage, index, artworkId }: VerticalCardProps) {
  return (
    <div 
    
      className='2xl:max-w-7xl grid grid-cols-2 h-full w-full pt-16 pb-20 pl-32 pr-16 hover:bg-secondary/40 text-white hover:text-black'>
        {/* <Link
          href={`/preview/${artwork.id}`}
          key={artwork.id}
          className='text-secondary-foreground shadow-sm '
        > */}
        <div 
        className={index%2===0?'col-start-1 row-start-1 aspect-square w-1/1 min-w-96 bg-slate-800': 'col-start-2 row-start-1 aspect-square w-1/1 min-w-96 bg-slate-800'}>
        
        </div>
        <div
          className={index%2===0?'col-start-2 row-start-1 pl-32 gap-4 flex flex-col aspect-square w-1/1 h-full text-right':'col-start-1 row-start-1 pr-32 gap-4 flex flex-col aspect-square w-1/1'}>
            
            <div className='flex flex-col gap-1'>
              <h3 className='text-3xl font-bold uppercase'>
                {title}
              </h3>
              <p className='text-sm font-medium uppercase'>Peinture</p>
              <p className='text-sm font-medium'>50 x 50 cm</p>
              <p className='text-sm font-medium uppercase'>2025</p>
            </div>
            
            <p
              className='flex-1 overflow-hidden text-ellipsis'
            >Isdem diebus Apollinaris Domitiani gener, paulo ante agens palatii Caesaris curam, ad Mesopotamiam missus a socero per militares numeros immodice scrutabatur, an quaedam altiora meditantis iam Galli secreta susceperint scripta, qui conpertis Antiochiae gestis per minorem Armeniam lapsus Constantinopolim petit exindeque per protectores retractus artissime tenebatur.</p>
            <div className='flex flex-col gap-4'>
              <Link 
              href={linkPage}
              className={buttonVariants({ variant:"bubule"})}
            >Voir plus</Link>
              <AddToBasketButton artworkId={artworkId} variant="bubule" />
            </div>
        </div>

      {/* <Link>  */}
    </div>
  )
}
