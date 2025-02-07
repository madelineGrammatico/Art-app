import {z} from "zod"

export const credentialShema = z.object({
    email: z.string().email(),
    password: z.string().min(3)
})