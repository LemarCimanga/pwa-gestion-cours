import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, AuthError } from '@/lib/auth/rbac'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Vérification des droits
    await requireAuth(['PROF', 'STAFF'])
    
    const resolvedParams = await params
    const inscriptionId = resolvedParams.id

    // 2. Récupération de l'inscription avec toutes les données liées
    const inscription = await prisma.inscription.findUnique({
      where: { id: inscriptionId },
      include: {
        etudiant: true,
        classe: true,
        anneeAcademique: true,
        // On inclut l'historique des présences
        presences: {
          include: {
            seance: {
              include: { cours: { select: { titre: true } } }
            }
          },
          orderBy: { seance: { date: 'desc' } }
        },
        // On inclut toutes les cotes avec le nom de l'évaluation
        cotes: {
          include: {
            evaluation: {
              include: { cours: { select: { titre: true } } }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!inscription) {
      return NextResponse.json({ error: 'Étudiant introuvable.' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true, data: inscription })

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Erreur lors de la récupération du dossier étudiant:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}