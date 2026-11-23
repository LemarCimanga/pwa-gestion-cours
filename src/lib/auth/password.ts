import bcrypt from 'bcryptjs'

/**
 * Hache un mot de passe avec un coût de 12.
 * Le coût 12 est un excellent compromis sécurité/performance (environ 250ms par hash).
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12)
}

/**
 * Vérifie si un mot de passe correspond au hash.
 * Utilise une comparaison à temps constant pour éviter les timing attacks.
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash)
}

/**
 * Génère un mot de passe aléatoire cryptographiquement sûr.
 * Utilisé lors de l'approbation d'une inscription.
 */
export function generateRandomPassword(length = 12): string {
  // On exclut les caractères ambigus (0, O, l, 1) pour faciliter la saisie
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$"
  const array = new Uint8Array(length)
  crypto.getRandomValues(array) // Utilisation de l'API crypto native (plus sûr que Math.random)
  
  return Array.from(array, (byte) => chars[byte % chars.length]).join("")
}