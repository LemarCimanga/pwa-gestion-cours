import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const createRoomSchema = z.object({
  nom: z.string().min(2),
  capacite: z.number().int().positive().optional(),
})

export async function GET(req: Request) {
  try {
    await requireAuth(['PROF', 'STAFF'])
    const rooms = await prisma.salle.findMany({ orderBy: { nom: 'asc' } })
    return NextResponse.json({ success: true, data: rooms })
  } catch (error) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = createRoomSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { nom, capacite } = validation.data

    const room = await prisma.salle.create({
      data: { nom, capacite: capacite || null }
    })

    await logAction({
      adminUserId: admin.id,
      action: 'ROOM_CREATED',
      entityType: 'Salle',
      entityId: room.id,
      details: { nom },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, data: room }, { status: 201 })
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Une salle avec ce nom existe déjà.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}