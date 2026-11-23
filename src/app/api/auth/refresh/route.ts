import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyRefreshToken, signAccessToken, signRefreshToken } from '@/lib/auth/jwt'
import { getRefreshToken, setAuthCookies, clearAuthCookies } from '@/lib/auth/cookies'
import crypto from 'crypto'

export async function POST() {
  try {
    const rawRefreshToken = await getRefreshToken()

    if (!rawRefreshToken) {
      return NextResponse.json({ error: 'Refresh token manquant.' }, { status: 401 })
    }

    // 1. Vérification de la signature du JWT
    let payload
    try {
      payload = verifyRefreshToken(rawRefreshToken)
    } catch {
      await clearAuthCookies()
      return NextResponse.json({ error: 'Refresh token invalide ou expiré.' }, { status: 401 })
    }

    // 2. Vérification en base de données (le token doit exister et ne pas être révoqué)
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex')
    
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        adminUser: true,
        inscription: true
      }
    })

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      await clearAuthCookies()
      return NextResponse.json({ error: 'Session expirée. Veuillez vous reconnecter.' }, { status: 401 })
    }

    // 3. Détermination du rôle
    let userRole: 'PROF' | 'STAFF' | 'STUDENT' = 'STUDENT'
    if (storedToken.adminUser) {
      userRole = storedToken.adminUser.role
    } else if (!storedToken.inscription) {
      await clearAuthCookies()
      return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 401 })
    }

    // 4. Rotation des tokens (Sécurité maximale)
    // On révoque l'ancien refresh token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() }
    })

    // On génère de nouveaux tokens
    const newAccessToken = signAccessToken({ id: payload.id, role: userRole })
    const newRawRefreshToken = crypto.randomBytes(40).toString('hex')
    const newSignedRefreshToken = signRefreshToken({ id: payload.id })
    const newHashedRefreshToken = crypto.createHash('sha256').update(newRawRefreshToken).digest('hex')

    // On sauvegarde le nouveau refresh token
    await prisma.refreshToken.create({
      data: {
        tokenHash: newHashedRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        adminUserId: storedToken.adminUserId,
        inscriptionId: storedToken.inscriptionId,
      }
    })

    // On met à jour les cookies
    await setAuthCookies(newAccessToken, newSignedRefreshToken)

    return NextResponse.json({ success: true, message: 'Session rafraîchie.' })

  } catch (error) {
    console.error('Erreur de rafraîchissement:', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}