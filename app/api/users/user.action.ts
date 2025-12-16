"use server"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { User } from "@prisma/client"
import bcrypt from "bcryptjs"

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

export const updateUserAction = async (
    id: string, 
    newUser: Pick<User, 'firstName' | 'lastName' | 'image'> 
) => {

    try {
        const session = await auth()
        if (!session?.user ) throw new Error("non authorisé")
        if ((session.user.id === id || session.user.role === "ADMIN")) {
            const user = await prisma.user.update({
                where: {
                    id: id
                },
                data: newUser
            })

            if (!user) throw new Error("User not found")
            return user
        } else throw new Error("non authorisé")
        
    } catch (error) {
        console.error(error)
        return error
    }
}

export const verifyPasswordAction = async (userId: string, password: string) => {
    try {
        const session = await auth()
        if (!session?.user) throw new Error("non authorisé")
        if (session.user.id !== userId && session.user.role !== "ADMIN") {
            throw new Error("non authorisé")
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                password: true,
                email: true,
                accounts: {
                    select: {
                        provider: true
                    }
                }
            }
        })

        if (!user) throw new Error("Utilisateur non trouvé")

        // Vérifier si l'utilisateur a un compte credentials
        const hasCredentialsAccount = user.accounts.some(account => account.provider === "credentials")
        if (!hasCredentialsAccount || !user.password) {
            throw new Error("Cet utilisateur n'a pas de mot de passe défini")
        }

        const passwordMatch = await bcrypt.compare(password, user.password)
        if (!passwordMatch) {
            throw new Error("Mot de passe incorrect")
        }

        return { success: true }
    } catch (error) {
        console.error(error)
        throw error
    }
}

export const hasPasswordAction = async (userId: string) => {
    try {
        const session = await auth()
        if (!session?.user) throw new Error("non authorisé")
        if (session.user.id !== userId && session.user.role !== "ADMIN") {
            throw new Error("non authorisé")
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                password: true,
                accounts: {
                    select: {
                        provider: true
                    }
                }
            }
        })

        if (!user) return { hasPassword: false }

        const hasCredentialsAccount = user.accounts.some(account => account.provider === "credentials")
        return { hasPassword: hasCredentialsAccount && !!user.password }
    } catch (error) {
        console.error(error)
        return { hasPassword: false }
    }
}