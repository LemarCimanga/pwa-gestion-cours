import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const createTpSchema = z.object({
  titre: z.string().min(3),
  consignes: z.string().min(10),
  dateLimite: z.string().datetime(), // Format ISO
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

    const validation = createTpSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { titre, consignes, dateLimite } = validation.data

    const cours = await prisma.cours.findUnique({ where: { id: coursId } })
    if (!cours) return NextResponse.json({ error: 'Cours introuvable.' }, { status: 404 })

    const tp = await prisma.travauxPratiques.create({
      data: {
        coursId,
        titre,
        consignes,
        dateLimite: new Date(dateLimite)
      }
    })

    await logAction({
      adminUserId: admin.id,
      action: 'TP_CREATED',
      entityType: 'TravauxPratiques',
      entityId: tp.id,
      details: { titre, coursId },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, data: tp }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}