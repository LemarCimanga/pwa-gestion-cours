import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/rbac'

export async function GET() {
  try {
    // 1. On récupère l'utilisateur depuis le cookie (sans faire planter si pas connecté)
    const currentUser = await getCurrentUser()

    if (!currentUser) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    // 2. On récupère les détails en base selon le rôle
    if (currentUser.role === 'STUDENT') {
      const inscription = await prisma.inscription.findUnique({
        where: { id: currentUser.id },
        include: { etudiant: true, classe: true }
      })

      if (!inscription || inscription.statut !== 'VALIDEE') {
        return NextResponse.json({ authenticated: false }, { status: 401 })
      }

      return NextResponse.json({
        authenticated: true,
        role: 'STUDENT',
        name: `${inscription.etudiant.prenom} ${inscription.etudiant.nom}`,
        email: inscription.etudiant.email,
        matricule: inscription.etudiant.matricule,
        classe: inscription.classe.nom,
        mustChangePassword: inscription.mustChangePassword
      })
    } else {
      const admin = await prisma.adminUser.findUnique({
        where: { id: currentUser.id }
      })

      if (!admin || !admin.isActive) {
        return NextResponse.json({ authenticated: false }, { status: 401 })
      }

      return NextResponse.json({
        authenticated: true,
        role: admin.role,
        name: `${admin.prenom} ${admin.nom}`,
        email: admin.email,
        mustChangePassword: false
      })
    }

  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 500 })
  }
}