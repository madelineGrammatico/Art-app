import { Button } from "@/src/components/ui/button";
import React from 'react'
import { GoogleActionSignIn } from "../lib/auth/actions/GoogleActionSignIn";

export default function GoogleSignIn() {
  return (
    <form
      action={GoogleActionSignIn}
    >
      <Button className="w-full text-black" variant="outline">
        Continue with Google
      </Button>
    </form>
  )
}



