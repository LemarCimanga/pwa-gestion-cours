import jwt from 'jsonwebtoken'

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error("FATAL: Les secrets JWT ne sont pas définis dans les variables d'environnement.")
}

export type TokenPayload = {
  id: string
  role: 'PROF' | 'STAFF' | 'STUDENT'
}

/**
 * Signe un Access Token (courte durée : 15 minutes).
 * Contient l'ID et le rôle pour éviter les requêtes en base à chaque appel.
 */
export const signAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ACCESS_SECRET, { 
    expiresIn: '15m',
    algorithm: 'HS256' 
  })
}

/**
 * Signe un Refresh Token (longue durée : 7 jours).
 * Ne contient que l'ID, car il sert uniquement à regénérer l'Access Token.
 */
export const signRefreshToken = (payload: { id: string }): string => {
  return jwt.sign(payload, REFRESH_SECRET, { 
    expiresIn: '7d',
    algorithm: 'HS256'
  })
}

/**
 * Vérifie et décode un Access Token.
 * Lance une erreur si le token est expiré ou invalide.
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, ACCESS_SECRET) as TokenPayload
  } catch (error) {
    throw new Error('Token d\'accès invalide ou expiré')
  }
}

/**
 * Vérifie et décode un Refresh Token.
 */
export const verifyRefreshToken = (token: string): { id: string } => {
  try {
    return jwt.verify(token, REFRESH_SECRET) as { id: string }
  } catch (error) {
    throw new Error('Refresh token invalide ou expiré')
  }
}