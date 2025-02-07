import { executeAction } from "../executeAction"
import { prisma } from "../prisma"
import { credentialShema } from "../shema"

export const signUp = async (formData: FormData) => {
    return executeAction({
        actionFn: async () => {
            const email = formData.get("email")
            const password = formData.get("password")
            const validedData = credentialShema.parse({email, password})
            await prisma.user.create({
                data: {
                    email: validedData.email,
                    password: validedData.password
                }
            })
        }
    })
}