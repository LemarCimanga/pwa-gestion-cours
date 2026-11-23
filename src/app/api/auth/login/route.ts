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
    // 1. Récupération de l'IP pour le Rate Limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'
    
    // 2. Vérification du Rate Limit (5 tentatives max)
    const rateLimit = checkRateLimit(ip, 5, 15 * 60 * 1000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.' },
        { status: 429 }
      )
    }

    // 3. Validation des données
    const body = await req.json()
    const validation = loginSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten().fieldErrors }, 
        { status: 400 }
      )
    }

    const { email, password, isStudent } = validation.data
    let userId = ''
    let userRole: 'PROF' | 'STAFF' | 'STUDENT' = 'STUDENT'

    // 4. Authentification
    if (isStudent) {
      // --- CONNEXION ÉTUDIANT ---
      const inscription = await prisma.inscription.findFirst({
        where: {
          etudiant: { email },
          statut: 'VALIDEE' // L'étudiant doit être approuvé
        },
        include: { etudiant: true }
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

      // Mise à jour de la dernière connexion
      await prisma.inscription.update({
        where: { id: inscription.id },
        data: { lastLoginAt: new Date() }
      })

    } else {
      // --- CONNEXION ADMIN (PROF / STAFF) ---
      const user = await prisma.adminUser.findUnique({ where: { email } })
      
      if (!user || !user.isActive) {
        return NextResponse.json({ error: 'Identifiants invalides ou compte désactivé.' }, { status: 401 })
      }

      const isValid = await verifyPassword(password, user.passwordHash)
      if (!isValid) {
        return NextResponse.json({ error: 'Identifiants invalides.' }, { status: 401 })
      }

      userId = user.id
      userRole = user.role

      // Mise à jour de la dernière connexion
      await prisma.adminUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      })
    }

    // 5. Création de la session (Tokens)
    const accessToken = signAccessToken({ id: userId, role: userRole })
    
    // Le Refresh Token est stocké en base pour permettre la révocation
    const rawRefreshToken = crypto.randomBytes(40).toString('hex')
    const hashedRefreshToken = crypto.createHash('sha256').update(rawRefreshToken).digest('hex')
    
    // On signe aussi le refresh token JWT pour la validation
    const signedRefreshToken = signRefreshToken({ id: userId })

    // Enregistrement en base
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashedRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 jours
        adminUserId: userRole !== 'STUDENT' ? userId : null,
        inscriptionId: userRole === 'STUDENT' ? userId : null,
      }
    })

    // 6. Configuration des cookies
    await setAuthCookies(accessToken, signedRefreshToken)

    // 7. Réinitialisation du Rate Limit en cas de succès
    resetRateLimit(ip)

    // 8. Audit log
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
      // Si l'étudiant doit changer son mot de passe, on le signale au front-end
      mustChangePassword: userRole === 'STUDENT' ? (await prisma.inscription.findUnique({ where: { id: userId } }))?.mustChangePassword : false
    })

  } catch (error) {
    console.error('Erreur de connexion:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}