import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'

const sendMessageSchema = z.object({
  inscriptionId: z.string().uuid(),
  sujet: z.string().min(2),
  contenu: z.string().min(5),
})

export async function POST(req: Request) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const body = await req.json()

    const validation = sendMessageSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { inscriptionId, sujet, contenu } = validation.data

    // Vérifier que l'étudiant existe
    const inscription = await prisma.inscription.findUnique({ where: { id: inscriptionId } })
    if (!inscription) return NextResponse.json({ error: 'Étudiant introuvable.' }, { status: 404 })

    const message = await prisma.messagePrive.create({
      data: {
        typeFil: 'INDIVIDUEL',
        sujet,
        contenu,
        expediteurEstAdmin: true,
        inscriptionId
      }
    })

    return NextResponse.json({ success: true, data: message }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}