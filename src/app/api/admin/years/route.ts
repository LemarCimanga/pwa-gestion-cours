import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'

export async function GET(req: Request) {
  try {
    await requireAuth(['PROF', 'STAFF'])
    const years = await prisma.anneeAcademique.findMany({
      include: { _count: { select: { classes: true, inscriptions: true } } },
      orderBy: { libelle: 'desc' }
    })
    return NextResponse.json({ success: true, data: years })
  } catch (error) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 })
  }
}