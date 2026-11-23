import { prisma } from '@/lib/prisma'

interface AuditLogParams {
  adminUserId?: string | null
  action: string
  entityType: string
  entityId?: string
  details?: any
  ipAddress?: string
}

/**
 * Enregistre une action dans la table AuditLog.
 * Ne fait jamais échouer la requête principale si le log échoue (on catch l'erreur).
 */
export async function logAction({
  adminUserId,
  action,
  entityType,
  entityId,
  details,
  ipAddress
}: AuditLogParams) {
  try {
    await prisma.auditLog.create({
      data: {
        adminUserId: adminUserId || null,
        action,
        entityType,
        entityId: entityId || null,
        details: details || {},
        ipAddress: ipAddress || null,
      }
    })
  } catch (error) {
    // On loggue l'erreur côté serveur mais on ne bloque pas l'utilisateur
    console.error('⚠️ Échec de l\'écriture du log d\'audit:', error)
  }
}