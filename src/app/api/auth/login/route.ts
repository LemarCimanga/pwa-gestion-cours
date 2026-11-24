import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { loginSchema } from '@/lib/validation/auth.schema'
import { verifyPassword } from '@/lib/auth/password'
import { signAccessToken, signRefreshToken } from '@/lib/auth/jwt'
import { setAuthCookies } from '@/lib/auth/cookies'
import { checkRateLimit, resetRateLimit } from '@/lib/auth/rate-limit'
import { logAction } from '@/lib/audit/log'
import crypto from 'crypto'

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'
    
    const rateLimit = checkRateLimit(ip, 5, 15 * 60 * 1000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const validation = loginSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten().fieldErrors }, 
        { status: 400 }
      )
    }

    const { email, password } = validation.data
    let userId = ''
    let userRole: 'PROF' | 'STAFF' | 'STUDENT' = 'STUDENT'
    let mustChangePassword = false

    // 1. On cherche d'abord dans les Admins (PROF / STAFF)
    const admin = await prisma.adminUser.findUnique({ where: { email } })
    
    if (admin) {
      if (!admin.isActive) {
        return NextResponse.json({ error: 'Compte désactivé.' }, { status: 401 })
      }
      
      const isValid = await verifyPassword(password, admin.passwordHash)
      if (!isValid) {
        return NextResponse.json({ error: 'Identifiants invalides.' }, { status: 401 })
      }

      userId = admin.id
      userRole = admin.role
      mustChangePassword = false

      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() }
      })
    } 
    // 2. Si on ne trouve pas dans les Admins, on cherche dans les Étudiants
    else {
      const inscription = await prisma.inscription.findFirst({
        where: {
          etudiant: { email },
          statut: 'VALIDEE'
        }
      })

      if (!inscription || !inscription.passwordHash) {
        return NextResponse.json({ error: 'Identifiants invalides ou compte en attente.' }, { status: 401 })
      }

      const isValid = await verifyPassword(password, inscription.passwordHash)
      if (!isValid) {
        return NextResponse.json({ error: 'Identifiants invalides.' }, { status: 401 })
      }

      userId = inscription.id
      userRole = 'STUDENT'
      mustChangePassword = inscription.mustChangePassword

      await prisma.inscription.update({
        where: { id: inscription.id },
        data: { lastLoginAt: new Date() }
      })
    }

    // 3. Génération des tokens
    const accessToken = signAccessToken({ id: userId, role: userRole })
    const signedRefreshToken = signRefreshToken({ id: userId })

    // 4. Enregistrement du Refresh Token en base
    const rawRefreshToken = crypto.randomBytes(40).toString('hex')
    const hashedRefreshToken = crypto.createHash('sha256').update(rawRefreshToken).digest('hex')

    await prisma.refreshToken.create({
      data: {
        tokenHash: hashedRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        adminUserId: userRole !== 'STUDENT' ? userId : null,
        inscriptionId: userRole === 'STUDENT' ? userId : null,
      }
    })

    // 5. Configuration des cookies
    await setAuthCookies(accessToken, signedRefreshToken)
    resetRateLimit(ip)

    // 6. Audit log
    if (userRole !== 'STUDENT') {
      await logAction({
        adminUserId: userId,
        action: 'LOGIN_SUCCESS',
        entityType: 'AdminUser',
        entityId: userId,
        ipAddress: ip
      })
    }

    return NextResponse.json({ 
      success: true, 
      role: userRole,
      mustChangePassword
    })

  } catch (error) {
    console.error('Erreur de connexion:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}