import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clearAuthCookies, getRefreshToken } from '@/lib/auth/cookies'
import { verifyRefreshToken } from '@/lib/auth/jwt'
import crypto from 'crypto'

export async function POST() {
  try {
    const rawRefreshToken = await getRefreshToken()

    // 1. Révocation en base de données
    if (rawRefreshToken) {
      try {
        // On vérifie que le token est valide avant de chercher son hash
        const payload = verifyRefreshToken(rawRefreshToken)
        
        // On recrée le hash SHA-256 pour le retrouver en base (comme lors de la création)
        // Note: Dans le login, on a stocké le hash du token brut. 
        // Puisque le cookie contient le JWT signé, on doit hasher la même chose.
        // Pour simplifier, on va plutôt chercher par l'ID de l'utilisateur et révoquer tous ses tokens.
        // C'est plus sûr en cas de vol de token.
        
        await prisma.refreshToken.updateMany({
          where: {
            OR: [
              { adminUserId: payload.id },
              { inscriptionId: payload.id }
            ],
            revokedAt: null // On ne révoque que les tokens encore actifs
          },
          data: {
            revokedAt: new Date()
          }
        })
      } catch (e) {
        // Si le token est expiré ou invalide, on ignore, on veut juste supprimer les cookies
      }
    }

    // 2. Suppression des cookies
    await clearAuthCookies()

    return NextResponse.json({ success: true, message: 'Déconnexion réussie.' })
  } catch (error) {
    console.error('Erreur de déconnexion:', error)
    // Même en cas d'erreur, on supprime les cookies côté client
    await clearAuthCookies()
    return NextResponse.json({ success: true })
  }
}