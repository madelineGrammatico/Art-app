import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"

export const { auth, handlers, signIn, signOut } = NextAuth({ 
    providers: [Google, Credentials({
        credentials: {
            email: {},
            password: {},
        },
        authorize: async (credentials) => {
            const email= "admin@admin.fr"
            const password = "123"

            if (credentials.email === email && credentials.password === password) {
                return { email, password}
            } else {
                throw new Error("Invalid credentials")
            }
        }
    })] 
})
