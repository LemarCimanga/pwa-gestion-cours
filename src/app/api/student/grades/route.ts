import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'

export async function GET() {
  try {
    const currentUser = await requireAuth(['STUDENT'])

    // On interroge la VUE SQL "v_cotes_visibles" au lieu de la table "Cote"
    // Cette vue filtre automatiquement les cotes dont la date d'expiration est dépassée.
    const cotes = await prisma.$queryRaw`
      SELECT 
        c.id,
        c.valeur,
        c.commentaire,
        c."evaluationTitre",
        c."maxPoints",
        c."visibleUntil"
      FROM v_cotes_visibles c
      WHERE c."inscriptionId" = ${currentUser.id}
    `

    // On calcule aussi la moyenne générale (en ignorant les notes non visibles)
    let totalPoints = 0
    let totalMax = 0
    
    // On s'assure que le résultat est un tableau typé
    const cotesArray = cotes as any[]
    cotesArray.forEach(cote => {
      totalPoints += cote.valeur
      totalMax += cote.maxPoints
    })

    const moyenne = totalMax > 0 ? (totalPoints / totalMax) * 20 : 0

    return NextResponse.json({
      success: true,
      data: {
        cotes: cotesArray,
        moyenne: Number(moyenne.toFixed(2))
      }
    })

  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}