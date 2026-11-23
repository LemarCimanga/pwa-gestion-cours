import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import crypto from 'crypto'
import { sendMail } from '@/lib/mail/client'

const forgotSchema = z.object({
  email: z.string().email(),
  isStudent: z.boolean().optional().default(false),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const validation = forgotSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json({ error: 'Email invalide.' }, { status: 400 })
    }

    const { email, isStudent } = validation.data

    let targetId = ''
    let targetName = ''

    if (isStudent) {
      const inscription = await prisma.inscription.findFirst({
        where: { etudiant: { email }, statut: 'VALIDEE' },
        include: { etudiant: true }
      })
      if (inscription) {
        targetId = inscription.id
        targetName = inscription.etudiant.prenom
      }
    } else {
      const admin = await prisma.adminUser.findUnique({ where: { email } })
      if (admin) {
        targetId = admin.id
        targetName = admin.prenom
      }
    }

    // Pour des raisons de sécurité, on renvoie TOUJOURS un succès 
    // même si l'email n'existe pas (pour éviter l'énumération d'emails).
    if (targetId) {
      // 1. Générer un token brut
      const resetToken = crypto.randomBytes(32).toString('hex')
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex')

      // 2. Le stocker en base (durée de vie : 1 heure)
      await prisma.refreshToken.create({
        data: {
          tokenHash: hashedToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), 
          adminUserId: !isStudent ? targetId : null,
          inscriptionId: isStudent ? targetId : null,
        }
      })

      // 3. Envoyer l'email avec le lien
      const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${resetToken}&student=${isStudent}`
      
      await sendMail({
        to: email,
        subject: 'Réinitialisation de votre mot de passe',
        html: `
          <h2>Bonjour ${targetName},</h2>
          <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
          <p>Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe. Ce lien expirera dans 1 heure.</p>
          <a href="${resetLink}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Réinitialiser mon mot de passe</a>
          <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
        `
      })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' 
    })

  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}