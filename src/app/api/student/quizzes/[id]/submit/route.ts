import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import { z } from 'zod'

// L'étudiant envoie un tableau de réponses.
// Le format dépendra de la structure de ton JSON, mais on suppose ici un tableau d'index ou de valeurs.
const submitQuizSchema = z.object({
  reponses: z.array(z.any()), 
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAuth(['STUDENT'])
    const resolvedParams = await params
    const quizId = resolvedParams.id

    const body = await req.json()
    const validation = submitQuizSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json({ error: 'Données invalides.' }, { status: 400 })
    }

    const { reponses } = validation.data

    // 1. Récupérer le quiz
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId }
    })

    if (!quiz || !quiz.isActive) {
      return NextResponse.json({ error: 'Quiz introuvable ou inactif.' }, { status: 404 })
    }

    // 2. Vérifier si l'étudiant n'a pas déjà soumis ce quiz
    const existingResult = await prisma.resultatQuiz.findUnique({
      where: {
        quizId_inscriptionId: {
          quizId,
          inscriptionId: currentUser.id
        }
      }
    })

    if (existingResult) {
      return NextResponse.json({ error: 'Vous avez déjà soumis ce quiz.' }, { status: 400 })
    }

    // 3. Calculer le score
    // On suppose que quiz.questions est un tableau d'objets : [{ id, question, options, bonneReponse }, ...]
    const questions = quiz.questions as any[]
    let score = 0
    let maxScore = questions.length

    // On compare les réponses de l'étudiant avec les bonnes réponses
    // (Cette logique dépendra du format exact défini par le front)
    questions.forEach((q, index) => {
      if (reponses[index] === q.bonneReponse) {
        score += 1
      }
    })

    // On met le score sur 20
    const scoreSur20 = maxScore > 0 ? (score / maxScore) * 20 : 0

    // 4. Enregistrer le résultat
    const resultat = await prisma.resultatQuiz.create({
      data: {
        quizId,
        inscriptionId: currentUser.id,
        score: scoreSur20,
        maxScore: 20
      }
    })

    // 5. Retourner le résultat (on renvoie le score calculé)
    return NextResponse.json({
      success: true,
      data: {
        score: resultat.score,
        maxScore: resultat.maxScore,
        message: `Quiz terminé. Votre score est de ${scoreSur20.toFixed(2)}/20.`
      }
    })

  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Erreur de soumission quiz:', error)
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })
  }
}