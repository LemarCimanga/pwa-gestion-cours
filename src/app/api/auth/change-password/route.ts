import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { changePasswordSchema } from '@/lib/validation/auth.schema'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { logAction } from '@/lib/audit/log'

export async function POST(req: Request) {
  try {
    // 1. Vérifier que l'utilisateur est connecté
    const currentUser = await requireAuth()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    // 2. Valider les données
    const body = await req.json()
    const validation = changePasswordSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten().fieldErrors }, 
        { status: 400 }
      )
    }

    const { oldPassword, newPassword } = validation.data

    // 3. Récupérer l'utilisateur en base
    if (currentUser.role === 'STUDENT') {
      const inscription = await prisma.inscription.findUnique({
        where: { id: currentUser.id }
      })

      if (!inscription || !inscription.passwordHash) {
        return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 })
      }

      // Vérifier l'ancien mot de passe
      const isValid = await verifyPassword(oldPassword, inscription.passwordHash)
      if (!isValid) {
        return NextResponse.json({ error: 'Ancien mot de passe incorrect.' }, { status: 401 })
      }

      // Mettre à jour
      const newHash = await hashPassword(newPassword)
      await prisma.inscription.update({
        where: { id: inscription.id },
        data: {
          passwordHash: newHash,
          mustChangePassword: false // Le trigger BD le fera aussi, mais on s'assure de la cohérence
        }
      })

    } else {
      // Admin (PROF ou STAFF)
      const admin = await prisma.adminUser.findUnique({
        where: { id: currentUser.id }
      })

      if (!admin) {
        return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 })
      }

      const isValid = await verifyPassword(oldPassword, admin.passwordHash)
      if (!isValid) {
        return NextResponse.json({ error: 'Ancien mot de passe incorrect.' }, { status: 401 })
      }

      const newHash = await hashPassword(newPassword)
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { passwordHash: newHash }
      })
    }

    // 4. Audit log
    await logAction({
      adminUserId: currentUser.role !== 'STUDENT' ? currentUser.id : null,
      action: 'PASSWORD_CHANGED',
      entityType: currentUser.role === 'STUDENT' ? 'Inscription' : 'AdminUser',
      entityId: currentUser.id,
      ipAddress: ip
    })

    return NextResponse.json({ success: true, message: 'Mot de passe mis à jour avec succès.' })

  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Erreur de changement de mot de passe:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}