import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { logAction } from '@/lib/audit/log'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const resolvedParams = await params
    const inscriptionId = resolvedParams.id
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const inscription = await prisma.inscription.findUnique({
      where: { id: inscriptionId },
      include: { etudiant: true }
    })

    if (!inscription) {
      return NextResponse.json({ error: 'Inscription introuvable.' }, { status: 404 })
    }

    if (inscription.statut !== 'EN_ATTENTE') {
      return NextResponse.json({ error: 'Cette inscription a déjà été traitée.' }, { status: 400 })
    }

    // Mise à jour du statut
    await prisma.inscription.update({
      where: { id: inscriptionId },
      data: { statut: 'REJETEE' }
    })

    // Audit log
    await logAction({
      adminUserId: admin.id,
      action: 'STUDENT_REJECTED',
      entityType: 'Inscription',
      entityId: inscriptionId,
      details: { email: inscription.etudiant.email },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, message: 'Inscription rejetée.' })

  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Erreur de rejet:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}