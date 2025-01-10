import { buttonVariants } from "@/src/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="bg-slate-200 flex flex-col gap-4 w-full p-4">
        <h1>URL : Home</h1>
        <Link 
            href="/admin"
            className={buttonVariants({size:"lg", variant:"outline"})} 
        >admin</Link>
      </div>
      <div className="flex flex-col gap-4 w-full">
        <Link
          href="/admin/arts/truc"
          className={buttonVariants({size:"lg", variant:"secondary"})} 
        >
          truc
        </Link>
        <Link
          href="/admin/arts/machin"
          className={buttonVariants({size:"lg", variant:"secondary"})} 
        >
          machin
        </Link>
        <Link
          href="/admin/arts/bidule"
          className={buttonVariants({size:"lg", variant:"secondary"})} 
        >
          bidule
        </Link>
      </div>
      
    </div>
  );
}
