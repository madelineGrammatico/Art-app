import React from 'react'
import { prisma } from "@/src/lib/prisma";
// import Link from 'next/link';
// import { Button, buttonVariants } from './ui/button';
import VerticalCard from './reusable-ui/VerticalCard';

export default async function Porfolio() {
    const artworks = await prisma.artwork.findMany({
        orderBy: {
          createdAt: "desc"
        },
        include: {
          // Image primaire uniquement pour la vignette galerie (B15).
          images: { where: { isPrimary: true }, take: 1 },
        },
      })
  return (
    
      <div className="flex flex-col items-center gap-4 w-full ">  
        { artworks.map((artwork, index)=> 
         
          
            <VerticalCard title={artwork.title} linkPage={`/preview/${artwork.id}`}  index={index} artworkId={artwork.id} imageUrl={artwork.images[0]?.url ?? null} key={artwork.id}/>
          
          // </Link>
        )}  
        
      </div>
      
  )
}
