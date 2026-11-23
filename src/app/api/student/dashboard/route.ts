import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'

export async function GET() {
  try {
    // 1. On récupère l'étudiant connecté via son token
    const currentUser = await requireAuth(['STUDENT'])

    // 2. On récupère ses données (Inscription = son compte pour l'année)
    const inscription = await prisma.inscription.findUnique({
      where: { id: currentUser.id },
      include: {
        etudiant: true,
        classe: true,
        anneeAcademique: true,
        notifications: {
          where: { estLue: false },
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    })

    if (!inscription) {
      return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 })
    }

    // 3. On récupère les cours de sa classe qui sont ACTIVÉS par le prof
    const coursActifs = await prisma.cours.findMany({
      where: {
        classeId: inscription.classeId,
        isActive: true
      },
      select: {
        id: true,
        titre: true,
        code: true,
        description: true,
      }
    })

    // 4. On renvoie un objet propre (sans le hash du mot de passe !)
    return NextResponse.json({
      success: true,
      data: {
        etudiant: {
          nom: inscription.etudiant.nom,
          postNom: inscription.etudiant.postNom,
          prenom: inscription.etudiant.prenom,
          matricule: inscription.etudiant.matricule,
        },
        classe: inscription.classe.nom,
        annee: inscription.anneeAcademique.libelle,
        mustChangePassword: inscription.mustChangePassword,
        cours: coursActifs,
        notificationsNonLues: inscription.notifications
      }
    })

  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}