import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { registerSchema } from '@/lib/validation/auth.schema'
import { logAction } from '@/lib/audit/log'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // 1. Validation stricte des données (Zod)
    const validation = registerSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: validation.error.flatten().fieldErrors }, 
        { status: 400 }
      )
    }
    
    const data = validation.data

    // 2. Vérification des doublons (Email et Matricule)
    const existingEtudiant = await prisma.etudiant.findFirst({
      where: {
        OR: [
          { email: data.email },
          { matricule: data.matricule }
        ]
      }
    })

    if (existingEtudiant) {
      return NextResponse.json(
        { error: 'Un étudiant avec cet email ou ce matricule existe déjà.' }, 
        { status: 409 }
      )
    }

    // 3. Vérification de l'existence de la classe et de l'année
    const classe = await prisma.classe.findUnique({
      where: { id: data.classeId },
      include: { anneeAcademique: true }
    })

    if (!classe) {
      return NextResponse.json({ error: 'Classe introuvable.' }, { status: 404 })
    }

    if (classe.anneeAcademiqueId !== data.anneeAcademiqueId) {
      return NextResponse.json({ error: 'La classe ne correspond pas à l\'année académique.' }, { status: 400 })
    }

    if (classe.anneeAcademique.isClosed) {
      return NextResponse.json({ error: 'Les inscriptions sont fermées pour cette année académique.' }, { status: 400 })
    }

    // 4. Création dans une transaction (Etudiant + Inscription)
    const result = await prisma.$transaction(async (tx) => {
      // Créer l'identité pérenne
      const etudiant = await tx.etudiant.create({
        data: {
          nom: data.nom,
          postNom: data.postNom,
          prenom: data.prenom,
          email: data.email,
          telephone: data.telephone,
          matricule: data.matricule,
          rgpdConsent: data.rgpdConsent,
        }
      })

      // Créer le rattachement de l'année (statut EN_ATTENTE)
      const inscription = await tx.inscription.create({
        data: {
          etudiantId: etudiant.id,
          anneeAcademiqueId: data.anneeAcademiqueId,
          classeId: data.classeId,
          statut: 'EN_ATTENTE',
        }
      })

      return { etudiant, inscription }
    })

    // 5. Journalisation de l'audit
    await logAction({
      action: 'STUDENT_REGISTERED',
      entityType: 'Inscription',
      entityId: result.inscription.id,
      details: { email: data.email, matricule: data.matricule },
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Inscription soumise avec succès. En attente de validation par le staff.',
      inscriptionId: result.inscription.id
    }, { status: 201 })

  } catch (error) {
    console.error('Erreur d\'inscription:', error)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}