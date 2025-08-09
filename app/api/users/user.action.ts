import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"

export const getUserAction = async (id: string)=> {
    try {
        const session = await auth()
        if (!session?.user ) throw new Error("non authorisé")
        if ((session.user.id === id || session.user.role === "ADMIN")) {
            if (!id) throw new Error("User ID is required")
            const user = await prisma.user.findUnique({
                where: { id },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    image: true,
                }
            })
            if (!user) throw new Error("User not found")
            return user
        } else throw new Error("non authorisé")
    } catch(error) { console.error(error) }
}