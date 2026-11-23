import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'
import { logAction } from '@/lib/audit/log'

const createCommuniqueSchema = z.object({
  titre: z.string().min(3, 'Le titre est requis'),
  contenu: z.string().min(10, 'Le contenu est trop court'),
  anneeAcademiqueId: z.string().uuid(),
  classeId: z.string().uuid().optional(), // Si null, c'est pour toute l'année
})

export async function POST(req: Request) {
  try {
    const admin = await requireAuth(['PROF', 'STAFF'])
    const body = await req.json()
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    const validation = createCommuniqueSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides', details: validation.error.flatten().fieldErrors }, { status: 400 })
    }

    const { titre, contenu, anneeAcademiqueId, classeId } = validation.data

    const communique = await prisma.communique.create({
      data: {
        titre,
        contenu,
        anneeAcademiqueId,
        classeId: classeId || null,
      }
    })

    // Ici, on pourrait ajouter le déclenchement des emails et des Web Push.
    // On le fera dans une fonction utilitaire plus tard.

    await logAction({
      adminUserId: admin.id,
      action: 'COMMUNIQUE_CREATED',
      entityType: 'Communique',
      entityId: communique.id,
      details: { titre, classeId },
      ipAddress: ip
    })

    return NextResponse.json({ success: true, data: communique }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}