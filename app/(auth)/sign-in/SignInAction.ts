"use server";

import { signIn } from "@/src/lib/auth/auth";
import { executeAction } from "@/src/lib/executeAction";

export const CredentialsSignInAction = async(formData: FormData)=> {
    const email = String(formData.get("email"))
    const password = String(formData.get("password"))
    if (!email || !password) throw new Error("Email ou password manquant")

    await executeAction({
        actionFn: async () => {
            await signIn("credentials", {email,
                password,
                redirect: false
            })
        }
    })
}