import { UserRole } from "@prisma/client"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User
  {
    firstName?: string | null
    lastName?: string | null
    role: UserRole
    // accessToken?: string
    // refreshToken?: string
    // accessTokenExpires?: number
    password?: string | null
  } 
  
  interface Session{
    user: User & DefaultSession["user"]
    // accessToken: string
    // accessTokenExpires: number
    // error?: string
    // sessionToken: string
  }
}

// declare module "next-auth/jwt" {
//   interface JWT extends Partial<Pick<User,"refreshToken"| "accessToken" |"accessTokenExpires"| "id"| "email"| "role">> {
//   error?: string
//   } 
// }