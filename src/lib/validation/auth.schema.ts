import { z } from 'zod'

// ==========================================
// 1. CONNEXION (LOGIN)
// ==========================================
export const loginSchema = z.object({
  email: z.string().email('Format d\'email invalide').toLowerCase().trim(),
  password: z.string().min(1, 'Le mot de passe est requis'),
  isStudent: z.boolean().optional().default(false),
})

// ==========================================
// 2. INSCRIPTION ÉTUDIANT (REGISTER)
// ==========================================
export const registerSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').trim(),
  postNom: z.string().min(2, 'Le post-nom doit contenir au moins 2 caractères').trim(),
  prenom: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères').trim(),
  email: z.string().email('Format d\'email invalide').toLowerCase().trim(),
  telephone: z.string().min(8, 'Numéro de téléphone invalide').trim(),
  matricule: z.string().regex(/^\d{2}\/\d{8}$/, 'Le matricule doit être au format 00/00000000'),
  classeId: z.string().uuid('ID de classe invalide'),
  anneeAcademiqueId: z.string().uuid('ID d\'année académique invalide'),
  rgpdConsent: z.literal(true, { error: 'Vous devez accepter la politique de confidentialité' })})

// ==========================================
// 3. CHANGEMENT DE MOT DE PASSE
// ==========================================
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'L\'ancien mot de passe est requis'),
  newPassword: z.string()
    .min(8, 'Le nouveau mot de passe doit faire au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
})