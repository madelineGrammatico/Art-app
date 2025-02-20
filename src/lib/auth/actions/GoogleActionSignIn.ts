"use server";
import { signIn } from "../auth";

export const GoogleActionSignIn = async () => {
    await signIn("google")
  }