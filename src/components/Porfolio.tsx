import React from 'react'
import { prisma } from "@/src/lib/prisma";
import Link from 'next/link';
import { Button, buttonVariants } from './ui/button';

export default async function Porfolio() {
    const artworks = await prisma.artwork.findMany({
        orderBy: {
          createdAt: "desc"
        }
      })
  return (
    
      <div className="flex flex-col items-center gap-4 w-full ">  
        { artworks.map((artwork, index)=> 
         
          // <Link
          //   href={`/preview/${artwork.id}`}
          //   key={artwork.id}
          //   className='text-secondary-foreground shadow-sm '
          // >
            <div 
              key={artwork.id}
              className='2xl:max-w-7xl grid grid-cols-2 h-full w-full pt-16 pb-20 pl-32 pr-16 hover:bg-secondary/40 text-white hover:text-black'>
                <div 
                className={index%2===0?'col-start-1 row-start-1 aspect-square w-1/1 min-w-96 bg-slate-800': 'col-start-2 row-start-1 aspect-square w-1/1 min-w-96 bg-slate-800'}>
                
                </div>
                <div
                  className={index%2===0?'col-start-2 row-start-1 pl-32 gap-4 flex flex-col aspect-square w-1/1 h-full text-right':'col-start-1 row-start-1 pr-32 gap-4 flex flex-col aspect-square w-1/1'}>
                    
                    <div className='flex flex-col gap-1'>
                      <h3 className='text-3xl font-bold uppercase'>
                        {artwork.title}
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
                      href={`/preview/${artwork.id}`}
                      className={buttonVariants({ variant:"bubule"})}
                    >Voir plus</Link>
                      <Button>Acheter</Button>
                    </div>
                </div>
            </div>
            
          // </Link>
        )}  
        
      </div>
      
  )
}
