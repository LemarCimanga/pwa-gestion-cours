import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // On fait une requête très légère pour réveiller la base de données
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', database: 'connected', timestamp: new Date() })
  } catch (error) {
    return NextResponse.json({ status: 'error', database: 'disconnected' }, { status: 500 })
  }
}