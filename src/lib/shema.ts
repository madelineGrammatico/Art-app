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

const positiveDimension = z
    .number({ invalid_type_error: "Doit être un nombre" })
    .finite("Doit être un nombre valide")
    .positive("Doit être strictement supérieur à 0")

// Dimension descriptive de l'œuvre : optionnelle ("" → null côté form). Si fournie, doit
// rester un nombre positif valide. Ne pilote NI le devis NI les seuils (cf. package*).
const optionalPositiveDimension = positiveDimension.nullish()

// Dimensions à la création ET à l'édition d'une œuvre (US0.1) :
//  - colis (package*) OBLIGATOIRE — sans lui, aucun devis transporteur possible
//    (cf. artworkBlocksDelivery) ; c'est le colis expédié qui compte, pas l'œuvre nue ;
//  - œuvre (weightKg…) DESCRIPTIF, optionnel — purement informatif.
export const artworkDimensionsSchema = z.object({
    packageWeightKg: positiveDimension,
    packageLengthCm: positiveDimension,
    packageWidthCm: positiveDimension,
    packageHeightCm: positiveDimension,
    weightKg: optionalPositiveDimension,
    lengthCm: optionalPositiveDimension,
    widthCm: optionalPositiveDimension,
    heightCm: optionalPositiveDimension,
    pickupOnly: z.boolean(),
})