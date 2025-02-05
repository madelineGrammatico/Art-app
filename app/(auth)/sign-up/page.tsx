import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import Link from "next/link";

const Page = async () => {
  return (
    <div className="w-full max-w-sm mx-auto space-y-6  text-white">
      <h1 className="text-2xl font-bold text-center mb-6">Créer un compte</h1>
        <p>Connection par Google bientôt!</p>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
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
        />
        <Input
          name="password"
          placeholder="Password"
          type="password"
          required
          autoComplete="new-password"
        />
        <Button className="w-full" type="submit">
          Créer un compte
        </Button>
      </form>

      <div className="text-center">
        <Button asChild variant="link">
          <Link href="/sign-in">Déja un compte? Sign in</Link>
        </Button>
      </div>
    </div>
  );
};

export default Page;