"use client"
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import Link from "next/link";

const Page = () => {
    
  return (
    <Card className="w-full max-w-sm mx-auto rounded-2xl my-8  bg-slate-400">
      <div className="space-y-6 p-6 text-white">
        <h1 className="text-2xl font-bold text-center mb-6">Mot de passe oublier</h1>

        <form
          className="space-y-4"
          action={ async(formData: FormData) => 
            { 
              const data = {email: String(formData.get("email"))}
              const res = await fetch("/api/auth/forgotPassword", {
                  method: "POST",
                  body: JSON.stringify(data),
              });

              if (res.ok) {
                  alert("lien envoyé !");
              } else {
                  alert("Erreur lors de l'envois");
              }
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
         
          <Button className="w-full" type="submit">
            Envoyer un lien par email
          </Button>
        </form>

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
