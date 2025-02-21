import {z} from "zod"

export const credentialShema = z.object({
    email: z.string().email(),
    password: z.string().min(3, 'Mot de passe trop court ( min 3 caractères)')
})

export const credentialPasswordShema = z.object({
    password: z.string().min(3, 'Mot de passe trop court ( min 3 caractères)')
})

export const forgotPasswordSchema = z.object({
    email: z.string().email(),
})

export const resetPassordSchema = z.object({
    token: z.string().min(1, "Token manquant"),
    password: z.string().min(3, 'Mot de passe trop court ( min 3 caractères)')
})