import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    firstName?: string | null
    lastName?: string | null
  }

  interface Session extends DefaultSession{
    user: User & DefaultSession["user"]
  }

  interface JWT {
    firstName?: string | null
    lastName?: string | null
  }
}