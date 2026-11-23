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

    const quizzes = await prisma.quiz.findMany({
      where: {
        cours: { classeId: inscription.classeId, isActive: true },
        isActive: true
      },
      include: {
        cours: { select: { titre: true } },
        resultats: {
          where: { inscriptionId: currentUser.id }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ success: true, data: quizzes })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode })
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}