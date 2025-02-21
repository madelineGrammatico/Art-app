"use client"
import GoogleSignIn from "@/src/components/Google-Sign-In";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Separator } from "@/src/components/ui/separator";
import Link from "next/link";
import { CredentialsSignInAction} from "./SignInAction";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {useRouter} from "next/navigation";

const Page = () => {
    const {data: session, update} = useSession()
    
    const [isSubmit, setIsSubmit] = useState(false)
    const router= useRouter()

    useEffect(()=>{ 
      if(session) router.push("/")
    }, [session, router])

    useEffect(()=> {
      update()
    }, [isSubmit])
    
  return (
    <Card className="w-full max-w-sm mx-auto rounded-2xl my-8  bg-slate-400">
      <div className="space-y-6 p-6 text-white">
        <h1 className="text-2xl font-bold text-center mb-6">Se connecter</h1>
          <GoogleSignIn/>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator/>
          </div>
          <div className="relative flex justify-center text-sm">
            <p className="bg-background px-2 text-muted-foreground rounded-sm">
              Connection par mail
            </p>
          </div>
        </div>

        <form
          className="space-y-4"
          action={ async(formData: FormData) => 
            { 
              await CredentialsSignInAction(formData)
              setIsSubmit(true) 
            }
          }
        >
          <Input
            name="email"
            placeholder="Email"
            type="email"
            required
            autoComplete="email"
            className="bg-white text-black"
          />
          <Input
            name="password"
            placeholder="Mot de passe"
            type="password"
            required
            autoComplete="current-password"
            className="bg-white text-black"
          />
          <Button className="w-full" type="submit">
            Se connecter
          </Button>
          
        </form>
        <Link href="/forgotPassword">mot de passe oublier</Link>
        <div className="text-center">
          <Button asChild variant="link">
            <Link href="/sign-up">Pas encore de compte ? Sign up</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default Page;
