import { prisma } from "@/src/lib/prisma";
import { forgotPasswordSchema } from "@/src/lib/shema";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendResetPasswordEmail } from "@/src/lib/mail/resetPawordMail";


export async function POST(request: Request) {
    try {
        const body = await request.json()
        console.log(body)
        const { email } = forgotPasswordSchema.parse(body)

        const user = await prisma.user.findUnique({ 
            where: { email }
        })

        if (!user || !user.password){
            return NextResponse.json(
                { message: "Aucun compte associé ou Google login" },
                { status: 400 }
            )
        }

        const token = randomBytes(32).toString('hex')
        const expireAt = new Date(Date.now() + 1000 * 60 * 60)

        await prisma.passwordResetToken.create({
            data: {
                token,
                userId: user.id,
                expireAt
            }
        })

        const resResend = await sendResetPasswordEmail(email, token)
        console.log(resResend)
        return NextResponse.json({ message: "Email de reinitialisation envoyé"})

    } catch(error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { message: "Données invalides", error: error },
                { status: 400 }
            )
        }
        return NextResponse.json(
            { message: "Error server"},
            { status: 500 }
        )
    }
} 