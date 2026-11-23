import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const createCourseSchema = z.object({
  titre: z.string().min(3),
  code: z.string().min(2),
  description: z.string().optional(),
  volumeHoraire: z.number().int().min(0).default(0),
  classeId: z.string().uuid(),
})

export async function GET(req: Request) {
  try {
    await requireAuth(['PROF', 'STAFF'])
    const courses = await prisma.cours.findMany({
      include: { classe: true },
      orderBy: { titre: 'asc' }
    })
    return NextResponse.json({ success: true, data: courses })
  } catch (error) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = createCourseSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { titre, code, description, volumeHoraire, classeId } = validation.data

    const classe = await prisma.classe.findUnique({ where: { id: classeId } })
    if (!classe) return NextResponse.json({ error: 'Classe introuvable.' }, { status: 404 })

    const cours = await prisma.cours.create({
      data: { titre, code, description, volumeHoraire, classeId, isActive: false }
    })

    await logAction({
      adminUserId: admin.id,
      action: 'COURSE_CREATED',
      entityType: 'Cours',
      entityId: cours.id,
      details: { titre, classeId },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, data: cours }, { status: 201 })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Un cours avec ce code existe déjà pour cette classe.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}