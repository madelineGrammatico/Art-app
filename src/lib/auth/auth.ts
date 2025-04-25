import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "../prisma"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { credentialShema } from "../shema"
import bcrypt from "bcryptjs"
// import { v4 as uuid } from "uuid"
import { encode as defaultEncode } from "next-auth/jwt"
import { UserRole } from "@prisma/client"
// import { refreshAccessToken, signAccessToken, signRefreshToken } from "../tokens/tokens"
import { exclude } from "../utils"

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
          role: "CLIENT",
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
        console.log("authorize")
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
        
        const userSafe = exclude(user, ["password"])
        // const {accessToken} = signAccessToken(userSafe)
        // const refreshToken = signRefreshToken(userSafe)
        // await prisma.refreshToken.create({
        //   data: {
        //     token: refreshToken,
        //     userId: user.id,
        //     expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        //   },
        // })
        
        // return { ...userSafe, accessToken, refreshToken}
        return userSafe
      }
    })
  ],
  callbacks: {
    async jwt({token, account, user}) {
      console.log("callback.jwt")
      if (user) {
        token.id = user.id;
        token.firstName = user.firstName 
        token.lastName = user.lastName
        token.role = user.role
        // token.accessToken = user.accessToken;
        // token.refreshToken = user.refreshToken;
        // token.accessTokenExpires = Date.now() + 15 * 60 * 1000;
      } else{ throw new Error("pas d'utilisateur trouvé")}
      
      if (account?.provider === "credentials") {
        token.credentials = true 
      }
      // if (Date.now() < token.accessTokenExpires) {
      //   const tokenSafe = exclude(token, ["password"])
      //   return tokenSafe;
      // }
      // const tokenSafe = exclude(token, ["password"])
      // const {accessToken, } = await refreshAccessToken(tokenSafe)
      // return accessToken
    },
    async session({session, token}) {
      console.log("callback.session")
      if (token) {
        session.user.id = token.id as string
        session.user.firstName = token.firstName as string
        session.user.lastName = token.lastName as string
        session.user.role = token.role as UserRole
        session.accessToken = token.accessToken as string
        session.accessTokenExpires = token.accessTokenExpires
      }
      let userSessionSafe = session.user
      userSessionSafe = exclude(session.user, ["password"])
      session.user = userSessionSafe
      return session
    }
  },
  jwt: {
    encode: async function (params) {
      console.log("jwt.encode")
      if (params.token?.credentials) {
        const sessionToken = params.token.accessToken as string

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
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" 
        ? "__Secure-next-auth.session-token" 
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
    },
  },
})
