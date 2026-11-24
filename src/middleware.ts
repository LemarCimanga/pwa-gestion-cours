import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const accessToken = request.cookies.get('access_token')?.value

  // 1. Routes publiques (pas besoin d'être connecté)
  const isPublicRoute = 
    pathname.startsWith('/api/auth/login') ||
    pathname.startsWith('/api/auth/register') ||
    pathname.startsWith('/api/auth/forgot-password') ||
    pathname.startsWith('/api/auth/reset-password') ||
    pathname.startsWith('/api/public/') ||
    pathname.startsWith('/api/health')

  if (isPublicRoute) {
    return NextResponse.next()
  }

  // 2. Protection des routes privées
  const isAdminRoute = pathname.startsWith('/api/admin')
  const isStudentRoute = pathname.startsWith('/api/student')

  if ((isAdminRoute || isStudentRoute) && !accessToken) {
    return NextResponse.json(
      { error: 'Non autorisé. Veuillez vous connecter.' }, 
      { status: 401 }
    )
  }

  // 3. En-têtes de sécurité
  const response = NextResponse.next()
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')       // <-- Correction ici
  response.headers.set('X-XSS-Protection', '1; mode=block') // <-- Correction ici
  
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  return response
}

export const config = {
  matcher: '/api/:path*',
}