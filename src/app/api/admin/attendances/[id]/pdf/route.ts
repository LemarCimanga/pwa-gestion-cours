import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth/rbac'
import PDFDocument from 'pdfkit'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(['PROF', 'STAFF'])
    const resolvedParams = await params
    const seanceId = resolvedParams.id

    // 1. Récupérer les données de la séance
    const seance = await prisma.seanceCours.findUnique({
      where: { id: seanceId },
      include: {
        cours: {
          include: {
            classe: { include: { anneeAcademique: true } }
          }
        },
        presences: {
          include: {
            inscription: { include: { etudiant: true } }
          }
        }
      }
    })

    if (!seance) return NextResponse.json({ error: 'Séance introuvable.' }, { status: 404 })

    // 2. Créer le document PDF
    const doc = new PDFDocument({ margin: 50 })
    const chunks: Buffer[] = []

    doc.on('data', (chunk) => chunks.push(chunk))

    // --- EN-TÊTE DU PDF ---
    doc.fontSize(20).text('FEUILLE DE PRÉSENCE', { align: 'center' })
    doc.moveDown()
    doc.fontSize(12).text(`Cours : ${seance.cours.titre}`)
    doc.text(`Classe : ${seance.cours.classe.nom}`)
    doc.text(`Année : ${seance.cours.classe.anneeAcademique.libelle}`)
    doc.text(`Date : ${new Date(seance.date).toLocaleDateString('fr-FR')}`)
    if (seance.sujet) doc.text(`Sujet : ${seance.sujet}`)
    doc.moveDown()

    // --- TABLEAU DES ÉTUDIANTS ---
    // On trie les étudiants par nom
    const presencesTriées = seance.presences.sort((a, b) => 
      a.inscription.etudiant.nom.localeCompare(b.inscription.etudiant.nom)
    )

    doc.fontSize(12).text('Liste des étudiants :', { underline: true })
    doc.moveDown(0.5)

    presencesTriées.forEach((p) => {
      const etudiant = p.inscription.etudiant
      doc.fontSize(10).text(
        `${etudiant.matricule} - ${etudiant.nom} ${etudiant.postNom} ${etudiant.prenom} : ${p.statut}`
      )
    })

    // --- PIED DE PAGE ---
    doc.moveDown(2)
    doc.fontSize(10).text('Signature du Professeur : ___________________', { align: 'right' })

    doc.end()

    // 3. Attendre la fin de la génération
    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
    })

    // 4. Renvoyer le PDF
    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="presence_${seance.date.toISOString().split('T')[0]}.pdf"`
      }
    })

  } catch (error) {
    console.error('Erreur PDF:', error)
    return NextResponse.json({ error: 'Erreur lors de la génération du PDF.' }, { status: 500 })
  }
}