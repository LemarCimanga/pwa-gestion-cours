import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const createClasseSchema = z.object({
  nom: z.string().min(2),
  code: z.string().min(2),
  anneeAcademiqueId: z.string().uuid(),
})

export async function GET(req: Request) {
  try {
    await requireAuth(['PROF', 'STAFF'])
    const classes = await prisma.classe.findMany({
      include: { anneeAcademique: true, _count: { select: { inscriptions: true } } },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ success: true, data: classes })
  } catch (error) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 })
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = createClasseSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { nom, code, anneeAcademiqueId } = validation.data

    // Vérifier que l'année existe
    const annee = await prisma.anneeAcademique.findUnique({ where: { id: anneeAcademiqueId } })
    if (!annee) return NextResponse.json({ error: 'Année académique introuvable.' }, { status: 404 })
    if (annee.isClosed) return NextResponse.json({ error: 'Impossible de créer une classe dans une année clôturée.' }, { status: 400 })

    // Création
    const classe = await prisma.classe.create({
      data: { nom, code, anneeAcademiqueId }
    })

    await logAction({
      adminUserId: admin.id,
      action: 'CLASSE_CREATED',
      entityType: 'Classe',
      entityId: classe.id,
      details: { nom, code },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, data: classe }, { status: 201 })
  } catch (error: any) {
    // Gestion des erreurs d'unicité (code déjà utilisé pour cette année)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Ce code de classe existe déjà pour cette année.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}