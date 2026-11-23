import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'

export async function GET() {
  try {
    const currentUser = await requireAuth(['STUDENT'])

    // Récupération de toutes les présences de l'étudiant
    const presences = await prisma.presence.findMany({
      where: { inscriptionId: currentUser.id },
      include: {
        seance: {
          include: {
            cours: {
              select: { titre: true, code: true }
            }
          }
        }
      },
      orderBy: { seance: { date: 'desc' } }
    })

    // Calcul des statistiques (Taux de présence)
    const totalSeances = presences.length
    const presents = presences.filter(p => p.statut === 'PRESENT').length
    const retards = presences.filter(p => p.statut === 'RETARD').length
    const absents = presences.filter(p => p.statut === 'ABSENT').length
    const justifies = presences.filter(p => p.statut === 'JUSTIFIE').length

    // Le taux de présence prend en compte les présents, les retards et les justifiés
    const tauxPresence = totalSeances > 0 
      ? ((presents + retards + justifies) / totalSeances) * 100 
      : 0

    return NextResponse.json({
      success: true,
      data: {
        statistiques: {
          totalSeances,
          presents,
          retards,
          absents,
          justifies,
          tauxPresence: Number(tauxPresence.toFixed(1))
        },
        historique: presences
      }
    })

  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}