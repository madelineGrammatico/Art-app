"use client";
import { Button } from "@/src/components/ui/button";

export const SignOut = () => {
  const handleSignOut = async () => {};

  return (
    <div className="flex justify-center">
      <Button variant="destructive" onClick={handleSignOut}>
        Déconnection
      </Button>
    </div>
  );
};
