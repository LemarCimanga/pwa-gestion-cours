import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const createEvaluationSchema = z.object({
  titre: z.string().min(3, 'Le titre est requis'),
  maxPoints: z.number().positive().default(20),
  coursId: z.string().uuid(),
  // Durée de visibilité en heures (entre 1h et 24h)
  visibilityDurationHours: z.number().min(1).max(24).optional(),
})

export async function GET(req: Request) {
  try {
    await requireAuth(['PROF', 'STAFF'])
    const evaluations = await prisma.evaluation.findMany({
      include: {
        cours: { select: { titre: true, classe: { select: { nom: true } } } },
        _count: { select: { cotes: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ success: true, data: evaluations })
  } catch (error) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = createEvaluationSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { titre, maxPoints, coursId, visibilityDurationHours } = validation.data

    // Vérifier que le cours existe
    const cours = await prisma.cours.findUnique({ where: { id: coursId } })
    if (!cours) return NextResponse.json({ error: 'Cours introuvable.' }, { status: 404 })

    // Calculer les dates de visibilité (si une durée est fournie)
    let visibleFrom = null
    let visibleUntil = null
    if (visibilityDurationHours) {
      visibleFrom = new Date()
      visibleUntil = new Date(visibleFrom.getTime() + visibilityDurationHours * 60 * 60 * 1000)
    }

    const evaluation = await prisma.evaluation.create({
      data: {
        titre,
        maxPoints,
        coursId,
        isPublished: false, // Non publiée par défaut
        visibleFrom,
        visibleUntil
      }
    })

    await logAction({
      adminUserId: admin.id,
      action: 'EVALUATION_CREATED',
      entityType: 'Evaluation',
      entityId: evaluation.id,
      details: { titre, coursId, maxPoints },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, data: evaluation }, { status: 201 })

  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}