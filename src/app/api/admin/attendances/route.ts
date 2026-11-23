import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const createSeanceSchema = z.object({
  coursId: z.string().uuid(),
  date: z.string().datetime(), // Format ISO : "2026-11-24T08:00:00.000Z"
  sujet: z.string().optional(),
})

export async function GET(req: Request) {
  try {
    await requireAuth(['PROF', 'STAFF'])
    const seances = await prisma.seanceCours.findMany({
      include: {
        cours: { select: { titre: true, classe: { select: { nom: true } } } },
        _count: { select: { presences: true } }
      },
      orderBy: { date: 'desc' }
    })
    return NextResponse.json({ success: true, data: seances })
  } catch (error) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = createSeanceSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { coursId, date, sujet } = validation.data

    const cours = await prisma.cours.findUnique({ 
      where: { id: coursId },
      include: { classe: { include: { anneeAcademique: true } } }
    })

    if (!cours) return NextResponse.json({ error: 'Cours introuvable.' }, { status: 404 })
    if (cours.classe.anneeAcademique.isClosed) {
      return NextResponse.json({ error: 'Impossible de créer une séance dans une année clôturée.' }, { status: 400 })
    }

    const seance = await prisma.seanceCours.create({
      data: {
        coursId,
        date: new Date(date),
        sujet
      }
    })

    await logAction({
      adminUserId: admin.id,
      action: 'SEANCE_CREATED',
      entityType: 'SeanceCours',
      entityId: seance.id,
      details: { coursId, date },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, data: seance }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}