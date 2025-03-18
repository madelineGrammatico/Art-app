import { User } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { prisma } from '../prisma'
import { JWT } from 'next-auth/jwt'

const SECRET_KEY = process.env.JWT_SECRET!
if (!SECRET_KEY) {
  throw new Error("JWT_SECRET is not defined in the environment variables");
}

export function signAccessToken(user: Partial<Pick<User, "id"| "email"| "role">>) {
  const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET_KEY, { expiresIn: '15m' })
  // const accessTokenExpires= Date.now() + 15 * 60 * 1000
  return {accessToken}
}

export function signRefreshToken(user: Omit<User, "password">) {
  return jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '7d' })
}

export function verifyToken(token: string) {
  return jwt.verify(token, SECRET_KEY)
}
export async function refreshAccessToken(token:JWT) {
  try {
    if (!token.refreshToken ) throw new Error('Refresh token is missing');
    const existingToken = await prisma.refreshToken.findUnique({
      where: { token: token.refreshToken as string },
    })

    if (!existingToken || new Date() > existingToken.expires) {
      throw new Error('Refresh token expiré ou invalide')
    }

    const newAccessToken = signAccessToken({ id: token.id, email: token.email, role: token.role });

    return {
      ...token,
      accessToken: newAccessToken,
      accessTokenExpires: Date.now() + 15 * 60 * 1000,
    };
  } catch (error) {
    console.error('Error refreshing access token:', error)
    return { ...token, error: 'RefreshTokenError' }
  }
}