"use server";

import { signIn } from "@/src/lib/auth/auth";
import { executeAction } from "@/src/lib/executeAction";

export const CredentialsSignInAction = async(formData: FormData)=> {
    await executeAction({
        actionFn: async () => {
            await signIn("credentials", formData)
        }
    })
}