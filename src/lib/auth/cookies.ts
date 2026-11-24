import { cookies } from 'next/headers'

export const ACCESS_COOKIE = 'access_token'
export const REFRESH_COOKIE = 'refresh_token'

/**
 * Configure les cookies d'authentification de manière sécurisée et compatible.
 */
export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies()
  const isProd = process.env.NODE_ENV === 'production'

  // En production, on utilise SameSite=Lax pour permettre les requêtes cross-origin
  // tout en gardant une bonne protection CSRF. En développement (localhost), 
  // on utilise 'lax' aussi, et on désactive Secure pour que localhost (http) accepte le cookie.
  
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,           // false en local (http), true en prod (https)
    sameSite: 'lax' as const, // 'lax' permet le cross-origin tout en bloquant le CSRF pur
    path: '/',
  }

  // ACCESS TOKEN (15 min)
  cookieStore.set(ACCESS_COOKIE, accessToken, {
    ...cookieOptions,
    maxAge: 60 * 15,
  })

  // REFRESH TOKEN (7 jours)
  cookieStore.set(REFRESH_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 7,
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

export async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(ACCESS_COOKIE)?.value
}

export async function getRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(REFRESH_COOKIE)?.value
}