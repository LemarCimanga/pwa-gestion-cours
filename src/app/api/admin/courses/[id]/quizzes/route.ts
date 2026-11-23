import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

// On accepte n'importe quelle structure JSON pour les questions du quiz
const createQuizSchema = z.object({
  titre: z.string().min(3),
  questions: z.any(), // Le format sera défini par le Front (ex: array d'objets)
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const resolvedParams = await params
    const coursId = resolvedParams.id
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = createQuizSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { titre, questions } = validation.data

    const cours = await prisma.cours.findUnique({ where: { id: coursId } })
    if (!cours) return NextResponse.json({ error: 'Cours introuvable.' }, { status: 404 })

    const quiz = await prisma.quiz.create({
      data: {
        coursId,
        titre,
        questions
      }
    })

    await logAction({
      adminUserId: admin.id,
      action: 'QUIZ_CREATED',
      entityType: 'Quiz',
      entityId: quiz.id,
      details: { titre, coursId },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, data: quiz }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}