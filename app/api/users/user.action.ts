"use server"
import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"
import { User, PostalAddress } from "@prisma/client"
import bcrypt from "bcryptjs"
import { credentialPasswordShema } from "@/src/lib/shema"

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

export const updateUserEmailAction = async (id: string, email: string) => {
    try {
        const session = await auth()
        if (!session?.user ) throw new Error("non authorisé")
        if ((session.user.id === id || session.user.role === "ADMIN")) {
            const user = await prisma.user.update({
                where: { id },
                data: { email }
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

export const changePasswordAction = async (
    userId: string,
    currentPassword: string,
    newPassword: string
) => {
    try {
        const session = await auth()
        if (!session?.user) throw new Error("non authorisé")
        if (session.user.id !== userId && session.user.role !== "ADMIN") {
            throw new Error("non authorisé")
        }

        // Vérifier le mot de passe actuel
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

        if (!user) throw new Error("Utilisateur non trouvé")

        const hasCredentialsAccount = user.accounts.some(account => account.provider === "credentials")
        if (!hasCredentialsAccount || !user.password) {
            throw new Error("Cet utilisateur n'a pas de mot de passe défini")
        }

        const passwordMatch = await bcrypt.compare(currentPassword, user.password)
        if (!passwordMatch) {
            throw new Error("Mot de passe actuel incorrect")
        }

        // Valider le nouveau mot de passe
        const validatedPassword = credentialPasswordShema.parse({ password: newPassword })

        // Hasher le nouveau mot de passe
        const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
        const hashedPassword = await bcrypt.hash(validatedPassword.password, saltRounds)

        // Mettre à jour le mot de passe
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        })

        if (!updated) throw new Error("Erreur lors de la mise à jour du mot de passe")
        return updated
    } catch (error) {
        console.error(error)
        throw error
    }
}

export const getUserAddressesAction = async (userId: string) => {
    try {
        const session = await auth()
        if (!session?.user) throw new Error("non authorisé")
        if (session.user.id !== userId && session.user.role !== "ADMIN") {
            throw new Error("non authorisé")
        }

        // Vérifier si le modèle postalAddress est disponible
        if (!prisma.postalAddress) {
            console.warn("Le modèle PostalAddress n'est pas disponible. La migration n'a peut-être pas été appliquée.")
            return []
        }

        const addresses = await prisma.postalAddress.findMany({
            where: { userId },
            orderBy: [
                { isDefaultBilling: 'desc' },
                { isDefaultShipping: 'desc' },
                { createdAt: 'desc' }
            ]
        })

        return addresses
    } catch (error: any) {
        // Si l'erreur est liée à une table inexistante, retourner un tableau vide
        if (error?.code === 'P2021' || error?.message?.includes('does not exist') || error?.message?.includes('PostalAddress')) {
            console.warn("La table PostalAddress n'existe pas encore. Veuillez appliquer la migration.")
            return []
        }
        console.error("Erreur lors de la récupération des adresses:", error)
        throw error
    }
}

type AddressData = {
    street: string
    postalCode: string
    city: string
    country: string
    isDefaultBilling?: boolean
    isDefaultShipping?: boolean
}

export const createAddressAction = async (userId: string, addressData: AddressData) => {
    try {
        const session = await auth()
        if (!session?.user) throw new Error("non authorisé")
        if (session.user.id !== userId && session.user.role !== "ADMIN") {
            throw new Error("non authorisé")
        }

        // Vérifier si le modèle postalAddress est disponible
        if (!prisma.postalAddress) {
            throw new Error("Le modèle PostalAddress n'est pas disponible. Veuillez redémarrer le serveur Next.js et appliquer la migration Prisma.")
        }

        // Si cette adresse doit être par défaut, mettre à false toutes les autres
        if (addressData.isDefaultBilling) {
            try {
                await prisma.postalAddress.updateMany({
                    where: { userId },
                    data: { isDefaultBilling: false }
                })
            } catch (error: any) {
                // Ignorer l'erreur si la table n'existe pas encore
                if (error?.code !== 'P2021' && !error?.message?.includes('does not exist')) {
                    throw error
                }
            }
        }

        if (addressData.isDefaultShipping) {
            try {
                await prisma.postalAddress.updateMany({
                    where: { userId },
                    data: { isDefaultShipping: false }
                })
            } catch (error: any) {
                // Ignorer l'erreur si la table n'existe pas encore
                if (error?.code !== 'P2021' && !error?.message?.includes('does not exist')) {
                    throw error
                }
            }
        }

        const address = await prisma.postalAddress.create({
            data: {
                userId,
                street: addressData.street,
                postalCode: addressData.postalCode,
                city: addressData.city,
                country: addressData.country,
                isDefaultBilling: addressData.isDefaultBilling ?? false,
                isDefaultShipping: addressData.isDefaultShipping ?? false,
            }
        })

        return address
    } catch (error: any) {
        // Si l'erreur est liée à une table inexistante, donner un message plus clair
        if (error?.code === 'P2021' || error?.message?.includes('does not exist') || error?.message?.includes('PostalAddress')) {
            throw new Error("La table PostalAddress n'existe pas encore. Veuillez appliquer la migration Prisma avec 'npx prisma migrate deploy' ou 'npx prisma migrate dev'.")
        }
        console.error(error)
        throw error
    }
}

export const updateAddressAction = async (
    userId: string, 
    addressId: string, 
    addressData: AddressData
) => {
    try {
        const session = await auth()
        if (!session?.user) throw new Error("non authorisé")
        if (session.user.id !== userId && session.user.role !== "ADMIN") {
            throw new Error("non authorisé")
        }

        // Vérifier si le modèle postalAddress est disponible
        if (!prisma.postalAddress) {
            throw new Error("Le modèle PostalAddress n'est pas disponible. Veuillez redémarrer le serveur Next.js et appliquer la migration Prisma.")
        }

        // Vérifier que l'adresse appartient à l'utilisateur
        const existingAddress = await prisma.postalAddress.findFirst({
            where: { id: addressId, userId }
        })

        if (!existingAddress) {
            throw new Error("Adresse non trouvée")
        }

        // Si cette adresse doit être par défaut, mettre à false toutes les autres
        if (addressData.isDefaultBilling) {
            await prisma.postalAddress.updateMany({
                where: { 
                    userId,
                    id: { not: addressId }
                },
                data: { isDefaultBilling: false }
            })
        }

        if (addressData.isDefaultShipping) {
            await prisma.postalAddress.updateMany({
                where: { 
                    userId,
                    id: { not: addressId }
                },
                data: { isDefaultShipping: false }
            })
        }

        const updatedAddress = await prisma.postalAddress.update({
            where: { id: addressId },
            data: {
                street: addressData.street,
                postalCode: addressData.postalCode,
                city: addressData.city,
                country: addressData.country,
                isDefaultBilling: addressData.isDefaultBilling ?? existingAddress.isDefaultBilling,
                isDefaultShipping: addressData.isDefaultShipping ?? existingAddress.isDefaultShipping,
            }
        })

        return updatedAddress
    } catch (error: any) {
        // Si l'erreur est liée à une table inexistante, donner un message plus clair
        if (error?.code === 'P2021' || error?.message?.includes('does not exist') || error?.message?.includes('PostalAddress')) {
            throw new Error("La table PostalAddress n'existe pas encore. Veuillez appliquer la migration Prisma avec 'npx prisma migrate deploy' ou 'npx prisma migrate dev'.")
        }
        console.error(error)
        throw error
    }
}

export const deleteAddressAction = async (userId: string, addressId: string) => {
    try {
        const session = await auth()
        if (!session?.user) throw new Error("non authorisé")
        if (session.user.id !== userId && session.user.role !== "ADMIN") {
            throw new Error("non authorisé")
        }

        // Vérifier si le modèle postalAddress est disponible
        if (!prisma.postalAddress) {
            throw new Error("Le modèle PostalAddress n'est pas disponible. Veuillez redémarrer le serveur Next.js et appliquer la migration Prisma.")
        }

        // Vérifier que l'adresse appartient à l'utilisateur
        const existingAddress = await prisma.postalAddress.findFirst({
            where: { id: addressId, userId }
        })

        if (!existingAddress) {
            throw new Error("Adresse non trouvée")
        }

        await prisma.postalAddress.delete({
            where: { id: addressId }
        })

        return { success: true }
    } catch (error: any) {
        // Si l'erreur est liée à une table inexistante, donner un message plus clair
        if (error?.code === 'P2021' || error?.message?.includes('does not exist') || error?.message?.includes('PostalAddress')) {
            throw new Error("La table PostalAddress n'existe pas encore. Veuillez appliquer la migration Prisma avec 'npx prisma migrate deploy' ou 'npx prisma migrate dev'.")
        }
        console.error(error)
        throw error
    }
}