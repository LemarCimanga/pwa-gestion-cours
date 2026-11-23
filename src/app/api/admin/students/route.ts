import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, AuthError } from '@/lib/auth/rbac' // On importe AuthError

export async function GET(req: Request) {
  try {
    // 1. Vérifier que l'utilisateur est un PROF ou un STAFF
    await requireAuth(['PROF', 'STAFF'])

    // 2. Récupérer toutes les inscriptions avec les infos de l'étudiant et de la classe
    const inscriptions = await prisma.inscription.findMany({
      include: {
        etudiant: true,
        classe: true,
        anneeAcademique: true
      },
      orderBy: { createdAt: 'desc' } // Les plus récents en premier
    })

    return NextResponse.json({ 
      success: true, 
      count: inscriptions.length,
      data: inscriptions 
    })

  } catch (error) {
    // On vérifie si l'erreur est bien une AuthError
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    
    console.error('Erreur lors de la récupération des étudiants:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}