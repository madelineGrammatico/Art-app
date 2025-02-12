import { Button } from "@/src/components/ui/button";
import React from 'react'
import { signIn } from "../lib/auth/auth";

export default function GoogleSignIn() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google")
      }}
    >
      <Button className="w-full text-black" variant="outline">
        Continue with Google
      </Button>
    </form>
  )
}



