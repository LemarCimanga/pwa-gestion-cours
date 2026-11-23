import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const accessToken = request.cookies.get('access_token')?.value

  // ==========================================
  // 1. PROTECTION DES ROUTES PRIVÉES
  // ==========================================
  const isAdminRoute = pathname.startsWith('/api/admin')
  const isStudentRoute = pathname.startsWith('/api/student')

  if ((isAdminRoute || isStudentRoute) && !accessToken) {
    return NextResponse.json(
      { error: 'Non autorisé. Veuillez vous connecter.' }, 
      { status: 401 }
    )
  }

  // ==========================================
  // 2. EN-TÊTES DE SÉCURITÉ (OWASP)
  // ==========================================
  const response = NextResponse.next()
  
  // Anti-XSS (Force le navigateur à respecter le Content-Type)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  // Anti-Clickjacking (Empêche l'intégration dans une iframe)
  response.headers.set('X-Frame-Options', 'DENY')
  // Protection XSS basique pour les anciens navigateurs
  response.headers.set('X-XSS-Protection', '1; mode=block')
  // Force HTTPS (HSTS) - À activer en production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  return response
}

// On applique ce middleware uniquement aux routes API (pas aux pages statiques)
export const config = {
  matcher: '/api/:path*',
}