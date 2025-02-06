import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { auth } from "@/src/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/src/components/ui/card";
import GoogleSignIn from "@/src/components/Google-Sign-In";
import { Separator } from "@/src/components/ui/separator";

const Page = async () => {
  const session = await auth()
  if(session) {redirect("/")}

  return (
    <Card className="w-full rounded-2xl max-w-sm mx-auto my-8">
    <div className="space-y-6 p-6 text-white bg-slate-400">
      <h1 className="text-2xl font-bold text-center mb-6">Créer un compte</h1>
        <GoogleSignIn/>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator />
        </div>
        
        <div className="relative flex justify-center text-sm">
          <span className="bg-background px-2 text-muted-foreground rounded-sm">
            Connection par mail
          </span>
        </div>
      </div>

      {/* Email/Password Sign Up */}
      <form
        className="space-y-4"
        action={async () => {
          "use server";
        }}
      >
        <Input
          name="email"
          placeholder="Email"
          type="email"
          required
          autoComplete="email"
          className="bg-white"
        />
        <Input
          name="password"
          placeholder="Mot de passe"
          type="password"
          required
          autoComplete="new-password"
          className="bg-white"
        />
        <Button className="w-full" type="submit">
          Créer un compte
        </Button>
      </form>
      <div className="text-center">
        <Button asChild variant="link">
          <Link href="/sign-in">Déja un compte ? Sign in</Link>
        </Button>
      </div>
    </div>
    </Card>
  );
};

export default Page;