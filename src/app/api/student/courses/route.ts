import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, AuthError } from '@/lib/auth/rbac'

export async function GET() {
  try {
    // 1. On récupère l'étudiant connecté
    const currentUser = await requireAuth(['STUDENT'])
    
    // 2. On trouve son inscription pour connaître sa classe
    const inscription = await prisma.inscription.findUnique({
      where: { id: currentUser.id }
    })

    if (!inscription) {
      return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 })
    }

    // 3. On récupère uniquement les cours ACTIVÉS de sa classe
    const cours = await prisma.cours.findMany({
      where: { 
        classeId: inscription.classeId, 
        isActive: true 
      },
      include: {
        // On inclut les horaires pour que l'étudiant sache quand ont lieu les cours
        horaires: { 
          include: { salle: true } 
        },
        // On inclut juste les titres des TP et Quiz pour l'affichage
        tps: { 
          select: { id: true, titre: true, dateLimite: true } 
        },
        quizzes: { 
          select: { id: true, titre: true } 
        }
      }
    })

    return NextResponse.json({ success: true, data: cours })
    
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Erreur lors de la récupération des cours:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}