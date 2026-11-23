import { Resend } from 'resend'

/**
 * Initialisation du client Resend.
 * On utilise une clé factice si la variable n'est pas définie pour éviter 
 * que l'application ne crashe au démarrage.
 */
const resend = new Resend(process.env.RESEND_API_KEY || 're_mock_key')

interface MailOptions {
  to: string
  subject: string
  html: string
}

/**
 * Envoie un email via le service Resend.
 * 
 * @param to L'adresse email du destinataire
 * @param subject Le sujet de l'email
 * @param html Le contenu de l'email au format HTML
 * @returns Un objet indiquant le succès ou l'échec de l'envoi
 */
export async function sendMail({ to, subject, html }: MailOptions) {
  try {
    // 1. Si on n'a pas de clé API (ex: en local sans .env), on simule l'envoi
    if (!process.env.RESEND_API_KEY) {
      console.log('--------------------------------------------------')
      console.log(`[MODE DEV - EMAIL SIMULE]`)
      console.log(`Destinataire : ${to}`)
      console.log(`Sujet        : ${subject}`)
      console.log(`Contenu      :\n${html}`)
      console.log('--------------------------------------------------')
      
      return { success: true, messageId: 'mock-id-' + Date.now() }
    }

    // 2. Envoi réel via l'API Resend
    const data = await resend.emails.send({
      // L'adresse d'expédition. 
      // Avec le plan gratuit de Resend, on utilise "onboarding@resend.dev" 
      // tant qu'on n'a pas acheté et configuré un nom de domaine personnalisé.
      from: 'Cabinet Professeur <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html,
    })

    // 3. Gestion des erreurs renvoyées par l'API Resend
    if (data.error) {
      console.error('Erreur API Resend:', data.error)
      throw new Error(data.error.message)
    }

    return { success: true, messageId: data.data?.id }

  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email:', error)
    
    // IMPORTANT: On ne bloque pas l'action principale (ex: approbation d'un étudiant)
    // si l'email échoue. On log l'erreur pour pouvoir réessayer plus tard.
    return { success: false, error }
  }
}