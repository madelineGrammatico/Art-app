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

// Poids/dimensions obligatoires à la création ET à l'édition d'une œuvre (US0.1) : sans
// elles, aucun devis transporteur n'est jamais possible (cf. artworkBlocksDelivery).
const positiveDimension = z
    .number({ invalid_type_error: "Doit être un nombre" })
    .finite("Doit être un nombre valide")
    .positive("Doit être strictement supérieur à 0")

export const artworkDimensionsSchema = z.object({
    weightKg: positiveDimension,
    lengthCm: positiveDimension,
    widthCm: positiveDimension,
    heightCm: positiveDimension,
    pickupOnly: z.boolean(),
})