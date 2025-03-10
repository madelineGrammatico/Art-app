import { UserRole } from "@prisma/client"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    firstName?: string | null
    lastName?: string | null
    role: UserRole
    accessToken?: string
    refreshToken?: string
  }
  
  interface Session{
    user: User & DefaultSession["user"]
    accessToken?: string
    error?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT extends Partial<Pick<User,"refreshToken" | "id"| "email"| "role">> {
  accessTokenExpires: number
  error?: string
  } 
}