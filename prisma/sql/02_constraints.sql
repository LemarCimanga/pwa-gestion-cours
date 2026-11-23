-- ==========================================
-- 1. FONCTION UTILITAIRE POUR LES HORAIRES
-- (Déclarée IMMUTABLE pour corriger l'erreur PostgreSQL)
-- ==========================================
CREATE OR REPLACE FUNCTION time_to_minutes(t text)
RETURNS integer AS $$
    SELECT (EXTRACT(HOUR FROM t::time) * 60 + EXTRACT(MINUTE FROM t::time))::integer;
$$ LANGUAGE sql IMMUTABLE STRICT;

-- ==========================================
-- 2. CONTRAINTES SUR LES COTES ET ÉVALUATIONS
-- ==========================================

-- Une cote ne peut pas dépasser le maxPoints de son évaluation
CREATE OR REPLACE FUNCTION check_cote_max_points()
RETURNS TRIGGER AS $$
DECLARE
    max_pts FLOAT;
BEGIN
    SELECT "maxPoints" INTO max_pts FROM "Evaluation" WHERE id = NEW."evaluationId";
    IF NEW.valeur > max_pts THEN
        RAISE EXCEPTION 'La cote (%) dépasse le maximum autorisé (%)', NEW.valeur, max_pts;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_cote_max
BEFORE INSERT OR UPDATE ON "Cote"
FOR EACH ROW EXECUTE FUNCTION check_cote_max_points();

-- Une évaluation éphémère ne peut pas dépasser 24h de visibilité
ALTER TABLE "Evaluation" ADD CONSTRAINT check_visible_until_max_24h
CHECK (
    "visibleUntil" IS NULL OR 
    "visibleFrom" IS NULL OR 
    ("visibleUntil" <= "visibleFrom" + INTERVAL '24 hours')
);

-- Un score de quiz ne peut pas dépasser le maxScore
ALTER TABLE "ResultatQuiz" ADD CONSTRAINT check_quiz_score_max
CHECK ("score" <= "maxScore");

-- ==========================================
-- 3. CONTRAINTES SUR LES INSCRIPTIONS
-- ==========================================

-- Un étudiant validé DOIT avoir un mot de passe
ALTER TABLE "Inscription" ADD CONSTRAINT check_password_if_validated
CHECK (
    statut != 'VALIDEE' OR 
    "passwordHash" IS NOT NULL
);

-- ==========================================
-- 4. CONTRAINTES SUR LES HORAIRES (CHEVAUCHEMENT)
-- ==========================================

-- Une salle ne peut pas avoir 2 cours qui se chevauchent le même jour
ALTER TABLE "Horaire" ADD CONSTRAINT no_overlap_same_room
EXCLUDE USING gist (
    "salleId" WITH =,
    "jourSemaine" WITH =,
    int4range(time_to_minutes("heureDebut"), time_to_minutes("heureFin")) WITH &&
);

-- Un cours ne peut pas avoir 2 horaires qui se chevauchent
ALTER TABLE "Horaire" ADD CONSTRAINT no_overlap_same_course
EXCLUDE USING gist (
    "coursId" WITH =,
    "jourSemaine" WITH =,
    int4range(time_to_minutes("heureDebut"), time_to_minutes("heureFin")) WITH &&
);

-- ==========================================
-- 5. CONTRAINTES SUR LES TP
-- ==========================================

-- La date limite d'un TP doit être après sa création
ALTER TABLE "TravauxPratiques" ADD CONSTRAINT check_tp_deadline_future
CHECK ("dateLimite" > "createdAt");