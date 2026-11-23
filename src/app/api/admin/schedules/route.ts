import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const createScheduleSchema = z.object({
  coursId: z.string().uuid(),
  salleId: z.string().uuid(),
  jourSemaine: z.number().int().min(1).max(7),
  heureDebut: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format HH:mm attendu'),
  heureFin: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format HH:mm attendu'),
}).refine(data => data.heureDebut < data.heureFin, {
  message: "L'heure de fin doit être après l'heure de début",
  path: ["heureFin"]
})

export async function GET(req: Request) {
  try {
    await requireAuth(['PROF', 'STAFF'])
    const schedules = await prisma.horaire.findMany({
      include: { cours: { include: { classe: true } }, salle: true },
      orderBy: [{ jourSemaine: 'asc' }, { heureDebut: 'asc' }]
    })
    return NextResponse.json({ success: true, data: schedules })
  } catch (error) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = createScheduleSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { coursId, salleId, jourSemaine, heureDebut, heureFin } = validation.data

    // Vérifications basiques
    const [cours, salle] = await Promise.all([
      prisma.cours.findUnique({ where: { id: coursId }, include: { classe: { include: { anneeAcademique: true } } } }),
      prisma.salle.findUnique({ where: { id: salleId } })
    ])

    if (!cours) return NextResponse.json({ error: 'Cours introuvable.' }, { status: 404 })
    if (!salle) return NextResponse.json({ error: 'Salle introuvable.' }, { status: 404 })
    if (cours.classe.anneeAcademique.isClosed) {
      return NextResponse.json({ error: 'Impossible de planifier un cours dans une année clôturée.' }, { status: 400 })
    }

    // L'insertion déclenchera la contrainte GIST de PostgreSQL si conflit
    const horaire = await prisma.horaire.create({
      data: { coursId, salleId, jourSemaine, heureDebut, heureFin }
    })

    await logAction({
      adminUserId: admin.id,
      action: 'SCHEDULE_CREATED',
      entityType: 'Horaire',
      entityId: horaire.id,
      details: { coursId, salleId, jourSemaine },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, data: horaire }, { status: 201 })
  } catch (error: any) {
    // P2004 = Erreur de contrainte d'exclusion PostgreSQL (GIST)
    // C'est ici qu'on capture les conflits d'horaires
    if (error.code === 'P2004' || error.message?.includes('no_overlap')) {
      return NextResponse.json({ 
        error: 'Conflit d\'horaire détecté. La salle ou le cours est déjà occupé sur ce créneau.' 
      }, { status: 409 })
    }
    console.error('Erreur création horaire:', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}