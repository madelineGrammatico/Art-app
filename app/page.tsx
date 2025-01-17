import { Header } from "@/src/components/Header";
import { buttonVariants } from "@/src/components/ui/button";
import { prisma } from "@/src/lib/prisma";
import Link from "next/link";

export default async function Home() {
  const arts = await prisma.art.findMany({
    orderBy: {
      createdAt: "desc"
    }
  })
  return (
    <div className="flex flex-col gap-4 w-full">
      <Header>URL : Home</Header>
      <div className="flex flex-col gap-4 w-full">  
        { arts.map((art)=> 
          <Link
            href={`/preview/${art.id}`}
            key={art.id}
            className={buttonVariants({size:"lg", variant:"secondary"})} 
          >
            {art.title}
          </Link>
        )}  
        
      </div>
      
    </div>
  );
}
