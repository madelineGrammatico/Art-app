"use client";
import { Button } from "@/src/components/ui/button";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(false);
  const {token} = useParams()
  const router = useRouter();

  return (
    <Card className="w-full max-w-sm mx-auto rounded-2xl my-8  bg-slate-400">
      <div className="space-y-6 p-6 text-white">
        <h1 className="text-2xl font-bold text-center mb-6">Mot de passe oublier</h1>
        <form 
          className="space-y-4"
          action={ async(formData: FormData)=> {
            const data = {
              token: String(token), 
              password: String(formData.get("password"))
            }
            setLoading(true);
            const res = await fetch("/api/auth/resetPassword", {
              method: "POST",
              body: JSON.stringify(data),
            });

            if (res.ok) {
              alert("Mot de passe mis à jour !");
              router.push("/sign-in");
            } else {
              alert("Erreur lors de la mise à jour");
            }
            setLoading(false);
          }}
        >
          <Input
            type="password"
            name="password"
            placeholder="Nouveau mot de passe"
            required
            className=" bg-white text-black"
          />
          <Button 
            type="submit" 
            disabled={loading}
            className="w-full"
          >
            {loading ? "Mise à jour..." : "Changer le mot de passe"}
          </Button>
        </form>
      </div>  
    </Card>
  );
}