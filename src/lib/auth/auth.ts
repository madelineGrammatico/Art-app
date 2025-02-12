import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "../prisma"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { credentialShema } from "../shema"
import bcrypt from "bcrypt"
import { v4 as uuid } from "uuid"
import { encode as defaultEncode } from "next-auth/jwt"

const adapter = PrismaAdapter(prisma)

export const { auth, handlers, signIn, signOut } = NextAuth({ 
    adapter,
    providers: [Google, Credentials({
        credentials: {
            email: {},
            password: {},
        },
        authorize: async (credentials) => {
            const validatedCredentials = credentialShema.parse(credentials)
            const user = await prisma.user.findUnique({
                where: {
                    email: validatedCredentials.email
                },
                include: { accounts: true }
            })
            if (!user) throw new Error("Utilisateur non trouvé")

            const hasGoogleAccount = user.accounts.some(account => account.provider === "google")
            if (hasGoogleAccount) {
                throw new Error("Cet utilisateur est enregistré avec Google. Veuillez vous connecter avec Google.")
            }
            if (!user.password) throw new Error("Mot de passe non défini.")
              
            const passwordMatch = await bcrypt.compare(validatedCredentials.password, user.password);
            if (!passwordMatch) throw new Error("Mot de passe incorrect");
            
            return user
        }
    })],
    callbacks: {
        async jwt({token, account}) {
            if (account?.provider=== "credentials") {
                token.credentials = true 
            }
            return token
        }
    },
    jwt: {
        encode: async function (params) {
          if (params.token?.credentials) {
            const sessionToken = uuid();
    
            if (!params.token.sub) {
              throw new Error("No user ID found in token");
            }
    
            const createdSession = await adapter?.createSession?.({
              sessionToken: sessionToken,
              userId: params.token.sub,
              expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            });
    
            if (!createdSession) {
              throw new Error("Failed to create session");
            }
    
            return sessionToken;
          }
          return defaultEncode(params);
        },
      },
})
