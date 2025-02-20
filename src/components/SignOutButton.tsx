"use client"
import { Button } from "@/src/components/ui/button";
import { signOut } from "next-auth/react";

export const SignOutButton = () => {
  const handleSignOut = async () => {
    await signOut()
  };

  return (
      <Button variant="ghost" onClick={handleSignOut}
      className="justify-start w-full h-1/2 p-0 m-0 rounded-sm text-sm font-normal hover:bg-transparent hover:text-destructive hover:font-medium  bg-transparent"
      >
        Déconnection
      </Button>
  );
};
