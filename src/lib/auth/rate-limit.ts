// Un système de limitation en mémoire (idéal pour un déploiement sur un seul serveur)
// Pour un déploiement multi-serveurs, on utiliserait Redis, mais commençons simple et robuste.

type RateLimitData = {
  count: number
  expiresAt: number
}

const attempts = new Map<string, RateLimitData>()

// Nettoyage périodique pour éviter les fuites de mémoire
setInterval(() => {
  const now = Date.now()
  for (const [key, data] of attempts.entries()) {
    if (now > data.expiresAt) {
      attempts.delete(key)
    }
  }
}, 60000) // Toutes les minutes

export function checkRateLimit(ip: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): { allowed: boolean, remaining: number } {
  const now = Date.now()
  const record = attempts.get(ip)

  if (!record) {
    attempts.set(ip, { count: 1, expiresAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (now > record.expiresAt) {
    // Le temps est écoulé, on réinitialise
    attempts.set(ip, { count: 1, expiresAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (record.count >= maxAttempts) {
    return { allowed: false, remaining: 0 }
  }

  record.count++
  return { allowed: true, remaining: maxAttempts - record.count }
}

export function resetRateLimit(ip: string) {
  attempts.delete(ip)
}