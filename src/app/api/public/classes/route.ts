import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // On récupère uniquement les classes dont l'année académique est OUVERTE
    const classes = await prisma.classe.findMany({
      where: {
        anneeAcademique: {
          isClosed: false,
          isActive: true
        }
      },
      select: {
        id: true,
        nom: true,
        code: true,
        anneeAcademiqueId: true,
        anneeAcademique: {
          select: { libelle: true }
        }
      },
      orderBy: { nom: 'asc' }
    })

    return NextResponse.json({ success: true, data: classes })
  } catch (error) {
    console.error('Erreur classes publiques:', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}