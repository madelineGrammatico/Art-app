import { UserRole } from "@prisma/client"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User
  {
    firstName?: string | null
    lastName?: string | null
    role: UserRole
    password?: string | null
  } 
  
  interface Session{
    user: User & DefaultSession["user"]
    sessionToken: string

    // TO DO: add prisma session
  }
}   
