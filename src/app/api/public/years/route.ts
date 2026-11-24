import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // On renvoie uniquement les années ouvertes aux inscriptions
    const years = await prisma.anneeAcademique.findMany({
      where: {
        isClosed: false,
        isActive: true
      },
      select: {
        id: true,
        libelle: true
      },
      orderBy: { libelle: 'desc' }
    })

    return NextResponse.json({ success: true, data: years })
  } catch (error) {
    console.error('Erreur années publiques:', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}