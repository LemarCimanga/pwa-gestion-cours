import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, AuthError } from '@/lib/auth/rbac'
import { z } from 'zod'

const submitTpSchema = z.object({
  fichierUrl: z.string().url(),
  clientMutationId: z.string().uuid()
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAuth(['STUDENT'])
    const resolvedParams = await params
    const tpId = resolvedParams.id

    const body = await req.json()
    const validation = submitTpSchema.safeParse(body)
    if (!validation.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 })

    const { fichierUrl, clientMutationId } = validation.data

    const existingMutation = await prisma.syncMutationLog.findUnique({ where: { clientMutationId } })
    if (existingMutation) return NextResponse.json({ success: true, message: 'Action déjà synchronisée.' })

    const tp = await prisma.travauxPratiques.findUnique({ where: { id: tpId } })
    if (!tp) return NextResponse.json({ error: 'TP introuvable.' }, { status: 404 })
    if (new Date() > tp.dateLimite) return NextResponse.json({ error: 'La date limite est dépassée.' }, { status: 400 })

    const result = await prisma.$transaction(async (tx) => {
      const soumission = await tx.soumissionTP.upsert({
        where: { tpId_inscriptionId: { tpId, inscriptionId: currentUser.id } },
        create: { tpId, inscriptionId: currentUser.id, fichierUrl, statut: 'EN_COURS' },
        update: { fichierUrl, submittedAt: new Date(), statut: 'EN_COURS' }
      })

      await tx.syncMutationLog.create({
        data: { clientMutationId, actionType: 'SUBMIT_TP', inscriptionId: currentUser.id }
      })

      return soumission
    })

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode })
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}