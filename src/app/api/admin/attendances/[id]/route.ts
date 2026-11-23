import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const markAttendanceSchema = z.object({
  presences: z.array(z.object({
    inscriptionId: z.string().uuid(),
    statut: z.enum(['PRESENT', 'RETARD', 'ABSENT', 'JUSTIFIE']),
  }))
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const resolvedParams = await params
    const seanceId = resolvedParams.id
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = markAttendanceSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { presences } = validation.data

    // 1. Vérifier que la séance existe
    const seance = await prisma.seanceCours.findUnique({ where: { id: seanceId } })
    if (!seance) return NextResponse.json({ error: 'Séance introuvable.' }, { status: 404 })

    // 2. Enregistrer les présences dans une transaction
    await prisma.$transaction(async (tx) => {
      for (const presence of presences) {
        await tx.presence.upsert({
          where: {
            seanceId_inscriptionId: {
              seanceId,
              inscriptionId: presence.inscriptionId
            }
          },
          create: {
            seanceId,
            inscriptionId: presence.inscriptionId,
            statut: presence.statut
          },
          update: {
            statut: presence.statut
          }
        })
      }
    })

    await logAction({
      adminUserId: admin.id,
      action: 'ATTENDANCE_MARKED',
      entityType: 'SeanceCours',
      entityId: seanceId,
      details: { totalEtudiants: presences.length },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, message: 'Présences enregistrées avec succès.' })

  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}