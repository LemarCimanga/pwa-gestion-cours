import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, AuthError } from '@/lib/auth/rbac'

export async function GET(req: Request) {
  try {
    await requireAuth(['PROF', 'STAFF'])
    
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    
    const logs = await prisma.auditLog.findMany({
      include: {
        adminUser: { select: { nom: true, prenom: true, role: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    return NextResponse.json({ success: true, data: logs })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode })
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}