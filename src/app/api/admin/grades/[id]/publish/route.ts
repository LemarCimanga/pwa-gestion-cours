import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const publishEvaluationSchema = z.object({
  // Durée de visibilité (max 24h)
  visibilityDurationHours: z.number().min(1).max(24),
  // Liste des cotes à enregistrer
  cotes: z.array(z.object({
    inscriptionId: z.string().uuid(),
    valeur: z.number().min(0),
    commentaire: z.string().optional(),
  }))
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const resolvedParams = await params
    const evaluationId = resolvedParams.id
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = publishEvaluationSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { visibilityDurationHours, cotes } = validation.data

    // 1. Vérifier l'évaluation
    const evaluation = await prisma.evaluation.findUnique({ where: { id: evaluationId } })
    if (!evaluation) return NextResponse.json({ error: 'Évaluation introuvable.' }, { status: 404 })

    // 2. Calculer les dates d'expiration (Horloge serveur !)
    const visibleFrom = new Date()
    const visibleUntil = new Date(visibleFrom.getTime() + visibilityDurationHours * 60 * 60 * 1000)

    // 3. Enregistrer les cotes et publier l'évaluation dans une transaction
    await prisma.$transaction(async (tx) => {
      
      // A. Mettre à jour l'évaluation
      await tx.evaluation.update({
        where: { id: evaluationId },
        data: {
          isPublished: true,
          visibleFrom,
          visibleUntil
        }
      })

      // B. Insérer ou Mettre à jour les cotes
      for (const cote of cotes) {
        // Vérification de sécurité : la cote ne peut pas dépasser le maxPoints
        if (cote.valeur > evaluation.maxPoints) {
          throw new Error(`La cote ${cote.valeur} dépasse le maximum de ${evaluation.maxPoints}.`)
        }

        await tx.cote.upsert({
          where: {
            evaluationId_inscriptionId: {
              evaluationId,
              inscriptionId: cote.inscriptionId
            }
          },
          create: {
            evaluationId,
            inscriptionId: cote.inscriptionId,
            valeur: cote.valeur,
            commentaire: cote.commentaire
          },
          update: {
            valeur: cote.valeur,
            commentaire: cote.commentaire
          }
        })
      }
    })

    // 4. Audit log
    await logAction({
      adminUserId: admin.id,
      action: 'EVALUATION_PUBLISHED',
      entityType: 'Evaluation',
      entityId: evaluationId,
      details: { titre: evaluation.titre, cotesSaisies: cotes.length },
      ipAddress: ip
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Évaluation publiée et cotes enregistrées.',
      expiresAt: visibleUntil 
    })

  } catch (error: any) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    // Gestion de l'erreur métier remontée par la transaction (cote > max)
    if (error.message?.includes('dépasse le maximum')) {
       return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Erreur de publication:', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}