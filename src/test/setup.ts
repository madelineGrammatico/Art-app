import { beforeEach, afterAll } from "vitest"
import { prisma } from "@/src/lib/prisma"

const TABLES = [
  "BasketItem",
  "Basket",
  "Invoice",
  "Certificate",
  "PostalAddress",
  "Session",
  "Account",
  "RefreshToken",
  "PasswordResetToken",
  "Artwork",
  "User",
]

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
  )
})

afterAll(async () => {
  await prisma.$disconnect()
})
