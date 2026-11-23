import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import crypto from 'crypto'
import { hashPassword } from '@/lib/auth/password'

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
  isStudent: z.boolean().optional().default(false),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const validation = resetSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 })
    }

    const { token, newPassword, isStudent } = validation.data
    
    // 1. Hacher le token reçu pour le comparer à la base
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

    // 2. Chercher le token valide et non expiré
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashedToken }
    })

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 })
    }

    // 3. Hacher le nouveau mot de passe
    const newHash = await hashPassword(newPassword)

    // 4. Mettre à jour et révoquer le token
    await prisma.$transaction(async (tx) => {
      if (isStudent && storedToken.inscriptionId) {
        await tx.inscription.update({
          where: { id: storedToken.inscriptionId },
          data: { passwordHash: newHash, mustChangePassword: false }
        })
      } else if (!isStudent && storedToken.adminUserId) {
        await tx.adminUser.update({
          where: { id: storedToken.adminUserId },
          data: { passwordHash: newHash }
        })
      }

      // Révoquer le token utilisé
      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() }
      })
    })

    return NextResponse.json({ success: true, message: 'Mot de passe réinitialisé avec succès.' })

  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}