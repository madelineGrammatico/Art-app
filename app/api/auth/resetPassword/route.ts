import { prisma } from "@/src/lib/prisma";
import { credentialPasswordShema, resetPassordSchema } from "@/src/lib/shema";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {token, password} = resetPassordSchema.parse(body)

        const passwordResetToken = await prisma.passwordResetToken.findFirst({
            where: {
                token: token,
                expireAt: { gt: new Date() }
            }, include: {user: true}
        })

        if (!passwordResetToken) {
            return NextResponse.json({ message: 'Token invalide ou expiré' }, { status: 400 });
          }

        const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS)
        const {password: validedPassword} = credentialPasswordShema.parse({ password })
        const hashedPassword = await bcrypt.hash(validedPassword, saltRounds);

        await prisma.user.update({
            where: { id: passwordResetToken.userId },
            data: {
                password: hashedPassword,
            }
        })
        await prisma.passwordResetToken.deleteMany({
            where: { userId: passwordResetToken.userId}
        })

        return NextResponse.json({ message: 'Mot de passe réinitialisé avec succès' })

    } catch(error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ message: 'Données invalides', errors: error.errors }, { status: 400 });
          }
          return NextResponse.json({ message: 'Erreur serveur' }, { status: 500 });
    }
}