import React from 'react'
import { prisma } from "@/src/lib/prisma";
// import Link from 'next/link';
// import { Button, buttonVariants } from './ui/button';
import VerticalCard from './reusable-ui/VerticalCard';

export default async function Porfolio() {
    const artworks = await prisma.artwork.findMany({
        orderBy: {
          createdAt: "desc"
        }
      })
  return (
    
      <div className="flex flex-col items-center gap-4 w-full ">  
        { artworks.map((artwork, index)=> 
         
          
            <VerticalCard title={artwork.title} linkPage={`/preview/${artwork.id}`}  index={index} key={artwork.id}/>
          
          // </Link>
        )}  
        
      </div>
      
  )
}
