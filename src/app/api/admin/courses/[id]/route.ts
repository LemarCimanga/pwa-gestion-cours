import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const updateCourseSchema = z.object({
  isActive: z.boolean().optional(),
  titre: z.string().min(3).optional(),
  description: z.string().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const resolvedParams = await params
    const courseId = resolvedParams.id
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = updateCourseSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const cours = await prisma.cours.findUnique({ where: { id: courseId }, include: { classe: { include: { anneeAcademique: true } } } })
    if (!cours) return NextResponse.json({ error: 'Cours introuvable.' }, { status: 404 })
    if (cours.classe.anneeAcademique.isClosed) {
      return NextResponse.json({ error: 'Impossible de modifier un cours d\'une année clôturée.' }, { status: 400 })
    }

    const updatedCours = await prisma.cours.update({
      where: { id: courseId },
      data: validation.data
    })

    await logAction({
      adminUserId: admin.id,
      action: validation.data.isActive !== undefined ? (validation.data.isActive ? 'COURSE_ACTIVATED' : 'COURSE_DEACTIVATED') : 'COURSE_UPDATED',
      entityType: 'Cours',
      entityId: courseId,
      details: validation.data,
      ipAddress: ip
    })

    return NextResponse.json({ success: true, data: updatedCours })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}