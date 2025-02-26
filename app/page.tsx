// import { Header } from "@/src/components/Header";
import { buttonVariants } from "@/src/components/ui/button";
import { prisma } from "@/src/lib/prisma";
import Link from "next/link";

export default async function Home() {
  const arts = await prisma.artwork.findMany({
    orderBy: {
      createdAt: "desc"
    }
  })
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-4 w-full">  
        { arts.map((artwork)=> 
          <Link
            href={`/preview/${artwork.id}`}
            key={artwork.id}
            className={buttonVariants({size:"lg", variant:"secondary"})} 
          >
            {artwork.title}
          </Link>
        )}  
        
      </div>
      
    </div>
  );
}
