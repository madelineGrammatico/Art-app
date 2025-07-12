import { UserRole } from "@prisma/client"
 
declare module "next-auth" {
  interface User  {
    id: string
    firstName?: string | null
    lastName?: string | null
    role: UserRole
    password?: string | null
    emailVerified?: Date | null
    createdAt?: Date
    updatedAt?: Date 
    email?: string | null
    image?: string | null 
  } 

  interface Session {
    user: User
    id: string  | null
    userId: string
    sessionToken: string  | null
    createdAt: Date 
    updatedAt: Date
  }
}