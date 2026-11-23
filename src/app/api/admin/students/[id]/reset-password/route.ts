import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, canChangePassword } from '@/lib/auth/rbac'
import { hashPassword, generateRandomPassword } from '@/lib/auth/password'
import { logAction } from '@/lib/audit/log'
import { sendMail } from '@/lib/mail/client'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const resolvedParams = await params
    const targetId = resolvedParams.id
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    // 1. Déterminer si la cible est un étudiant ou un admin
    let targetRole = 'STUDENT'
    let targetEmail = ''
    let targetName = ''

    const inscription = await prisma.inscription.findUnique({
      where: { id: targetId },
      include: { etudiant: true }
    })

    if (inscription) {
      targetRole = 'STUDENT'
      targetEmail = inscription.etudiant.email
      targetName = `${inscription.etudiant.prenom} ${inscription.etudiant.nom}`
    } else {
      const adminTarget = await prisma.adminUser.findUnique({
        where: { id: targetId }
      })
      if (adminTarget) {
        targetRole = adminTarget.role
        targetEmail = adminTarget.email
        targetName = `${adminTarget.prenom} ${adminTarget.nom}`
      }
    }

    if (!targetEmail) {
      return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 })
    }

    // 2. VÉRIFICATION DE LA RÈGLE MÉTIER STRICTE (§2.2)
    if (!canChangePassword(admin.role, targetRole)) {
      return NextResponse.json(
        { error: 'Action interdite. Vous n\'avez pas les droits pour modifier ce mot de passe.' }, 
        { status: 403 }
      )
    }

    // 3. Génération et hachage du nouveau mot de passe
    const rawPassword = generateRandomPassword(12)
    const hashedPassword = await hashPassword(rawPassword)

    // 4. Mise à jour en base
    if (targetRole === 'STUDENT') {
      await prisma.inscription.update({
        where: { id: targetId },
        data: { 
          passwordHash: hashedPassword,
          mustChangePassword: true // L'étudiant devra le changer
        }
      })
    } else {
      await prisma.adminUser.update({
        where: { id: targetId },
        data: { passwordHash: hashedPassword }
      })
    }

    // 5. Envoi de l'email
    await sendMail({
      to: targetEmail,
      subject: 'Réinitialisation de votre mot de passe',
      html: `
        <h2>Bonjour ${targetName},</h2>
        <p>Votre mot de passe a été réinitialisé par l'administration.</p>
        <p>Voici votre nouveau mot de passe temporaire :</p>
        <p style="font-size: 20px; font-weight: bold; padding: 10px; background-color: #f0f0f0; display: inline-block;">
          ${rawPassword}
        </p>
        <p>Veuillez vous connecter et changer ce mot de passe dès que possible.</p>
      `
    })

    // 6. Audit log
    await logAction({
      adminUserId: admin.id,
      action: 'PASSWORD_RESET_BY_ADMIN',
      entityType: targetRole === 'STUDENT' ? 'Inscription' : 'AdminUser',
      entityId: targetId,
      details: { targetRole },
      ipAddress: ip
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Mot de passe réinitialisé avec succès. L\'email a été envoyé.',
      devPassword: process.env.NODE_ENV === 'development' ? rawPassword : undefined
    })

  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: error.message.includes('insuffisants') ? 403 : 401 })
    }
    console.error('Erreur de réinitialisation:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}