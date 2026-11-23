-- ==========================================
-- 1. VUE DES COTES VISIBLES (Éphémères)
-- ==========================================
-- Cette vue filtre automatiquement les cotes dont le délai de visibilité 
-- est expiré. Le backend utilisera TOUJOURS cette vue pour les étudiants.

CREATE OR REPLACE VIEW v_cotes_visibles AS
SELECT 
    c.id,
    c.valeur,
    c.commentaire,
    c."inscriptionId",
    e.titre AS "evaluationTitre",
    e."maxPoints",
    e."visibleFrom",
    e."visibleUntil"
FROM "Cote" c
JOIN "Evaluation" e ON e.id = c."evaluationId"
WHERE 
    e."isPublished" = true 
    AND (e."visibleFrom" IS NULL OR e."visibleFrom" <= NOW())
    AND (e."visibleUntil" IS NULL OR e."visibleUntil" >= NOW());

-- ==========================================
-- 2. VUE DES INSCRIPTIONS ACTIVES
-- ==========================================
-- Cette vue exclut automatiquement les étudiants dont l'année est clôturée
-- ou dont le compte est bloqué/rejeté.

CREATE OR REPLACE VIEW v_inscriptions_actives AS
SELECT 
    i.id,
    i."etudiantId",
    i."anneeAcademiqueId",
    i."classeId",
    i.statut,
    i."mustChangePassword",
    i."lastLoginAt",
    i."loginCount"
FROM "Inscription" i
JOIN "AnneeAcademique" a ON a.id = i."anneeAcademiqueId"
WHERE 
    a."isClosed" = false 
    AND i.statut = 'VALIDEE';