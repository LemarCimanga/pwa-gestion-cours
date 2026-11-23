import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'

// On définit la structure d'une mutation envoyée par le front
const syncSchema = z.object({
  mutations: z.array(z.object({
    clientMutationId: z.string().uuid(),
    actionType: z.enum(['SUBMIT_TP', 'SEND_MESSAGE', 'SUBMIT_QUIZ']),
    payload: z.any()
  }))
})

export async function POST(req: Request) {
  try {
    const currentUser = await requireAuth(['STUDENT'])
    const body = await req.json()

    const validation = syncSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Format de synchronisation invalide' }, { status: 400 })
    }

    const { mutations } = validation.data
    const results = []

    // On traite chaque mutation envoyée par le client
    for (const mutation of mutations) {
      
      // 1. Vérifier si cette action n'a pas déjà été exécutée (Idempotence)
      const existingLog = await prisma.syncMutationLog.findUnique({
        where: { clientMutationId: mutation.clientMutationId }
      })

      if (existingLog) {
        results.push({ clientMutationId: mutation.clientMutationId, status: 'ALREADY_PROCESSED' })
        continue // On passe à la suivante
      }

      // 2. Traiter l'action selon son type
      try {
        await prisma.$transaction(async (tx) => {
          if (mutation.actionType === 'SUBMIT_TP') {
            const { tpId, fichierUrl } = mutation.payload
            
            // Vérification basique
            const tp = await tx.travauxPratiques.findUnique({ where: { id: tpId } })
            if (!tp) throw new Error('TP introuvable')

            await tx.soumissionTP.upsert({
              where: { tpId_inscriptionId: { tpId, inscriptionId: currentUser.id } },
              create: { tpId, inscriptionId: currentUser.id, fichierUrl, statut: 'EN_COURS' },
              update: { fichierUrl, submittedAt: new Date(), statut: 'EN_COURS' }
            })
          } 
          
          else if (mutation.actionType === 'SEND_MESSAGE') {
            const { sujet, contenu } = mutation.payload
            await tx.messagePrive.create({
              data: {
                typeFil: 'SUPPORT',
                sujet,
                contenu,
                expediteurEstAdmin: false,
                inscriptionId: currentUser.id
              }
            })
          }

          // 3. Enregistrer la mutation comme traitée
          await tx.syncMutationLog.create({
            data: {
              clientMutationId: mutation.clientMutationId,
              actionType: mutation.actionType,
              inscriptionId: currentUser.id
            }
          })
        })

        results.push({ clientMutationId: mutation.clientMutationId, status: 'SUCCESS' })
      } catch (err) {
        // Si une action échoue (ex: TP expiré), on continue les autres
        results.push({ clientMutationId: mutation.clientMutationId, status: 'FAILED', error: (err as Error).message })
      }
    }

    return NextResponse.json({ success: true, results })

  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}