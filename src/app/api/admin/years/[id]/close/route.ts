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
    const anneeId = resolvedParams.id
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const annee = await prisma.anneeAcademique.findUnique({ where: { id: anneeId } })
    if (!annee) return NextResponse.json({ error: 'Année introuvable.' }, { status: 404 })
    if (annee.isClosed) return NextResponse.json({ error: 'Cette année est déjà clôturée.' }, { status: 400 })

    // La mise à jour va déclencher notre Trigger SQL (close_year_inscriptions)
    // qui va bloquer toutes les inscriptions et révoquer les tokens.
    const closedAnnee = await prisma.anneeAcademique.update({
      where: { id: anneeId },
      data: { 
        isClosed: true,
        isActive: false,
        closedAt: new Date()
      }
    })

    await logAction({
      adminUserId: admin.id,
      action: 'ACADEMIC_YEAR_CLOSED',
      entityType: 'AnneeAcademique',
      entityId: anneeId,
      details: { libelle: annee.libelle },
      ipAddress: ip
    })

    return NextResponse.json({ 
      success: true, 
      message: `L'année ${annee.libelle} a été clôturée. Tous les comptes étudiants ont été bloqués.`,
      data: closedAnnee
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}