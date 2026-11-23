import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, AuthError } from '@/lib/auth/rbac'
import { z } from 'zod'

const sendMessageSchema = z.object({
  sujet: z.string().min(2, 'Le sujet est requis'),
  contenu: z.string().min(5, 'Le message doit faire au moins 5 caractères'),
})

export async function GET() {
  try {
    const currentUser = await requireAuth(['STUDENT'])
    
    const messages = await prisma.messagePrive.findMany({
      where: { inscriptionId: currentUser.id },
      orderBy: { createdAt: 'desc' }
    })

    // Marquer les messages reçus comme lus
    await prisma.messagePrive.updateMany({
      where: { inscriptionId: currentUser.id, expediteurEstAdmin: true, lu: false },
      data: { lu: true }
    })

    return NextResponse.json({ success: true, data: messages })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode })
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await requireAuth(['STUDENT'])
    const body = await req.json()
    
    const validation = sendMessageSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { sujet, contenu } = validation.data

    const message = await prisma.messagePrive.create({
      data: {
        typeFil: 'SUPPORT',
        sujet,
        contenu,
        expediteurEstAdmin: false,
        inscriptionId: currentUser.id
      }
    })

    return NextResponse.json({ success: true, data: message }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode })
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}