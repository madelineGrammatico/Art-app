import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "../prisma"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { credentialShema } from "../shema"
import bcrypt from "bcryptjs"
import { v4 as uuid } from "uuid"
import { encode as defaultEncode } from "next-auth/jwt"
import { UserRole } from "@prisma/client"

const adapter = PrismaAdapter(prisma)

export const { auth, handlers, signIn, signOut } = NextAuth({ 
  adapter,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          firstName: profile.given_name,
          lastName: profile.family_name,
          email: profile.email,
          role: profile.role,
          image: profile.picture
        }
      }
    }), 
    Credentials({
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

        const hasCredentialsAccount = user.accounts.some(account => account.provider === "credentials")
        if (!hasCredentialsAccount) {
          throw new Error("Cet utilisateur n'est pas enregistré avec un email et mot de passe. Veuillez vous connecter avec une autre méthode.")
        }
        if (!user.password) throw new Error("Mot de passe non défini. Veuillez vous connecter avec une autre méthode.")
          
        const passwordMatch = await bcrypt.compare(validatedCredentials.password, user.password);
        if (!passwordMatch) throw new Error("Mot de passe incorrect");
        
        return user
      }
    })
  ],
  callbacks: {
    async jwt({token, account, user}) {
      if (user) {
        token.id = user.id;
        token.firstName = user.firstName 
        token.lastName = user.lastName
        token.role = user.role
      }
        if (account?.provider=== "credentials") {
            token.credentials = true 
        }
        return token
    },
    async session({session, token}) {
        if (token) {
          session.user.id = token.id as string
          session.user.firstName = token.firstName as string
          session.user.lastName = token.lastName as string
          session.user.role = token.role as UserRole
        }
      return session
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
