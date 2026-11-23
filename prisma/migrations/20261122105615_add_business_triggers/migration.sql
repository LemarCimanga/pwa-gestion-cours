-- ==========================================
-- 1. BLOCAGE DE FIN D'ANNÉE (Workflow de clôture)
-- ==========================================

-- Quand une année est clôturée, toutes les inscriptions de cette année 
-- passent automatiquement en statut 'BLOQUEE'.
CREATE OR REPLACE FUNCTION close_year_inscriptions()
RETURNS TRIGGER AS $$
BEGIN
    -- Si on passe de isClosed=false à isClosed=true
    IF NEW."isClosed" = true AND OLD."isClosed" = false THEN
        
        -- 1. Bloquer toutes les inscriptions
        UPDATE "Inscription"
        SET statut = 'BLOQUEE'
        WHERE "anneeAcademiqueId" = NEW.id 
          AND statut != 'BLOQUEE';
          
        -- 2. Révoquer tous les tokens de rafraîchissement actifs 
        -- (pour forcer la déconnexion immédiate)
        UPDATE "RefreshToken" rt
        SET "revokedAt" = NOW()
        FROM "Inscription" i
        WHERE rt."inscriptionId" = i.id
          AND i."anneeAcademiqueId" = NEW.id
          AND rt."revokedAt" IS NULL;
          
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_close_year ON "AnneeAcademique";
CREATE TRIGGER trigger_close_year
AFTER UPDATE OF "isClosed" ON "AnneeAcademique"
FOR EACH ROW EXECUTE FUNCTION close_year_inscriptions();

-- ==========================================
-- 2. SÉCURITÉ : PREVENIR LE SOFT DELETE PHYSIQUE
-- ==========================================

-- Empêcher la suppression physique d'un étudiant
-- (On utilise uniquement le soft delete avec deletedAt)
CREATE OR REPLACE FUNCTION prevent_etudiant_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'La suppression physique d''un étudiant est interdite. Utilisez le soft delete (deletedAt).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_etudiant_delete ON "Etudiant";
CREATE TRIGGER trigger_prevent_etudiant_delete
BEFORE DELETE ON "Etudiant"
FOR EACH ROW EXECUTE FUNCTION prevent_etudiant_delete();

-- ==========================================
-- 3. GESTION DES MOTS DE PASSE (mustChangePassword)
-- ==========================================

-- Après la première connexion réussie d'un étudiant, 
-- on passe mustChangePassword à false automatiquement
CREATE OR REPLACE FUNCTION reset_must_change_password()
RETURNS TRIGGER AS $$
BEGIN
    -- Si l'étudiant a mis à jour son mot de passe
    IF NEW."passwordHash" IS DISTINCT FROM OLD."passwordHash" THEN
        NEW."mustChangePassword" := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reset_must_change ON "Inscription";
CREATE TRIGGER trigger_reset_must_change
BEFORE UPDATE OF "passwordHash" ON "Inscription"
FOR EACH ROW EXECUTE FUNCTION reset_must_change_password();

-- ==========================================
-- 4. MISE À JOUR AUTOMATIQUE DU COMPTEUR DE CONNEXION
-- ==========================================

-- Quand un étudiant se connecte, on incrémente son loginCount
CREATE OR REPLACE FUNCTION increment_login_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."lastLoginAt" IS DISTINCT FROM OLD."lastLoginAt" AND NEW."lastLoginAt" IS NOT NULL THEN
        NEW."loginCount" := OLD."loginCount" + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_increment_login ON "Inscription";
CREATE TRIGGER trigger_increment_login
BEFORE UPDATE OF "lastLoginAt" ON "Inscription"
FOR EACH ROW EXECUTE FUNCTION increment_login_count();