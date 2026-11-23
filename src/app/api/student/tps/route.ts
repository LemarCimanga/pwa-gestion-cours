import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, AuthError } from '@/lib/auth/rbac'

export async function GET() {
  try {
    const currentUser = await requireAuth(['STUDENT'])
    
    const inscription = await prisma.inscription.findUnique({
      where: { id: currentUser.id }
    })

    if (!inscription) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 })

    // On récupère les TP des cours de sa classe
    const tps = await prisma.travauxPratiques.findMany({
      where: {
        cours: { classeId: inscription.classeId, isActive: true }
      },
      include: {
        cours: { select: { titre: true } },
        soumissions: {
          where: { inscriptionId: currentUser.id }
        }
      },
      orderBy: { dateLimite: 'asc' }
    })

    return NextResponse.json({ success: true, data: tps })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode })
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}