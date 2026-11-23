import { verifyAccessToken, TokenPayload } from './jwt'
import { getAccessToken } from './cookies'

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Récupère l'utilisateur actuel à partir du cookie.
 * Renvoie null si non connecté.
 */
export async function getCurrentUser(): Promise<TokenPayload | null> {
  const token = await getAccessToken()
  if (!token) return null
  
  try {
    return verifyAccessToken(token)
  } catch {
    return null
  }
}

/**
 * Middleware de garde : Bloque l'accès si l'utilisateur n'a pas le bon rôle.
 */
export async function requireAuth(allowedRoles?: ('PROF' | 'STAFF' | 'STUDENT')[]): Promise<TokenPayload> {
  const user = await getCurrentUser()
  
  if (!user) {
    throw new AuthError('Non authentifié', 401)
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new AuthError('Accès refusé : droits insuffisants', 403)
  }
  
  return user
}

/**
 * Règle métier STRICTE (Cahier des charges v5.1 - Section 2.2).
 * 
 * - Le Staff peut modifier le mot de passe du Professeur et des étudiants.
 * - Le Professeur NE PEUT PAS modifier le mot de passe du Staff.
 * - Le Professeur et le Staff peuvent modifier les étudiants.
 */
export function canChangePassword(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'STAFF') return true 
  if (actorRole === 'PROF') return targetRole === 'STUDENT' 
  return false
}