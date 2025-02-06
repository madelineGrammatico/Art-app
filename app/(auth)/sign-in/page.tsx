import GoogleSignIn from "@/src/components/Google-Sign-In";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { auth } from "@/src/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

const Page = async () => {
  const session = await auth()
  if(session) redirect("/")
    
  return (
    <Card className="w-full max-w-sm mx-auto rounded-2xl my-8  bg-slate-400">
      <div className="space-y-6 p-6 text-white">
        <h1 className="text-2xl font-bold text-center mb-6">Se connecter</h1>
          <GoogleSignIn/>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-sm">
            <p className="bg-background px-2 text-muted-foreground rounded-sm">
              Connection par mail
            </p>
          </div>
        </div>

        {/* Email/Password Sign In */}
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
            autoComplete="current-password"
            className="bg-white"
          />
          <Button className="w-full" type="submit">
            Se connecter
          </Button>
        </form>

        <div className="text-center">
          <Button asChild variant="link">
            <Link href="/sign-up">Pas encore de compte? Sign up</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default Page;
