import { cookies } from 'next/headers'

export const ACCESS_COOKIE = 'access_token'
export const REFRESH_COOKIE = 'refresh_token'

/**
 * Configure les cookies d'authentification de manière ultra-sécurisée.
 */
export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies()
  const isProd = process.env.NODE_ENV === 'production'

  // ACCESS TOKEN (15 min) - Accessible uniquement par le serveur
  cookieStore.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,        // Inaccessible via JavaScript (anti-XSS)
    secure: isProd,        // Uniquement HTTPS en production
    sameSite: 'strict',    // Protection anti-CSRF
    maxAge: 60 * 15,       // 15 minutes
    path: '/',
  })

  // REFRESH TOKEN (7 jours) - Utilisé uniquement sur la route /api/auth/refresh
  cookieStore.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 jours
    path: '/',
  })
}

/**
 * Supprime les cookies (Déconnexion).
 */
export async function clearAuthCookies() {
  const cookieStore = await cookies()
  cookieStore.delete(ACCESS_COOKIE)
  cookieStore.delete(REFRESH_COOKIE)
}

/**
 * Récupère l'Access Token pour les middlewares.
 */
export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(ACCESS_COOKIE)?.value
}

/**
 * Récupère le Refresh Token pour la route de rafraîchissement.
 */
export async function getRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(REFRESH_COOKIE)?.value
}