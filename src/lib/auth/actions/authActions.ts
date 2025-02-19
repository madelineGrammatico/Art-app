import { executeAction } from "../../executeAction"
import { prisma } from "../../prisma"
import { credentialShema } from "../../shema"
import bcrypt from "bcryptjs"

export const signUp = async (formData: FormData) => {
    return executeAction({
        actionFn: async () => {
            const email = formData.get("email")
            const password = formData.get("password")
            const firstName = String(formData.get("firstName"))
            const lastName = String(formData.get("LastName"))

            if (!email || !password) {
                throw new Error("Email et mot de passe sont requis.");
            }

            const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS)
            const validedData = credentialShema.parse({email, password})

            validedData.password = await bcrypt.hash(validedData.password, saltRounds);

            const newUser = await prisma.user.create({
                data: {
                    email: validedData.email,
                    password: validedData.password,
                    name: firstName + " " + lastName,
                    firstName: firstName,
                    lastName: lastName

                }
            })
            await prisma.account.create({
                data: {
                  userId: newUser.id,
                  type: "credentials",
                  provider: "credentials",
                  providerAccountId: newUser.id,
                }
            });
        }
    })
}