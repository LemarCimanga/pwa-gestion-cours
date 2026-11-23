import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { hashPassword, generateRandomPassword } from '@/lib/auth/password'
import { logAction } from '@/lib/audit/log'
// Nous créerons le client mail juste après
import { sendMail } from '@/lib/mail/client' 

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Seul le PROF ou le STAFF peut approuver
    const admin = await requireAuth(['PROF', 'STAFF'])
    const resolvedParams = await params
    const inscriptionId = resolvedParams.id
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip'

    // 2. Récupérer l'inscription
    const inscription = await prisma.inscription.findUnique({
      where: { id: inscriptionId },
      include: { etudiant: true }
    })

    if (!inscription) {
      return NextResponse.json({ error: 'Inscription introuvable.' }, { status: 404 })
    }

    if (inscription.statut !== 'EN_ATTENTE') {
      return NextResponse.json({ error: 'Cette inscription a déjà été traitée.' }, { status: 400 })
    }

    // 3. Générer le mot de passe et le hacher
    const rawPassword = generateRandomPassword(12)
    const hashedPassword = await hashPassword(rawPassword)

    // 4. Mettre à jour l'inscription (Validée + Mot de passe)
    await prisma.inscription.update({
      where: { id: inscriptionId },
      data: {
        statut: 'VALIDEE',
        passwordHash: hashedPassword,
        mustChangePassword: true // L'étudiant devra le changer à la 1ère connexion
      }
    })

    // 5. Envoyer l'email (On catch l'erreur pour ne pas bloquer l'approbation si l'email échoue)
    try {
      await sendMail({
        to: inscription.etudiant.email,
        subject: 'Validation de votre inscription - Cabinet de Professeur',
        html: `
          <h2>Bienvenue, ${inscription.etudiant.prenom} ${inscription.etudiant.nom}</h2>
          <p>Votre inscription a été validée par l'administration.</p>
          <p>Voici vos identifiants de connexion temporaires :</p>
          <ul>
            <li><strong>Email :</strong> ${inscription.etudiant.email}</li>
            <li><strong>Mot de passe :</strong> <code>${rawPassword}</code></li>
          </ul>
          <p style="color: red;"><strong>Attention :</strong> Lors de votre première connexion, vous devrez obligatoirement changer ce mot de passe.</p>
        `
      })
    } catch (mailError) {
      console.error('Erreur envoi email:', mailError)
      // On log mais on ne bloque pas l'approbation
    }

    // 6. Audit log
    await logAction({
      adminUserId: admin.id,
      action: 'STUDENT_APPROVED',
      entityType: 'Inscription',
      entityId: inscriptionId,
      details: { email: inscription.etudiant.email },
      ipAddress: ip
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Étudiant approuvé et email envoyé.',
      // En développement, on peut renvoyer le mot de passe pour tester facilement
      // En production, à retirer impérativement :
      devPassword: process.env.NODE_ENV === 'development' ? rawPassword : undefined
    })

  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Erreur d\'approbation:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}