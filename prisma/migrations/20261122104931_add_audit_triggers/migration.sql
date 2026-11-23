-- This is an empty migration.-- ==========================================
-- TRIGGERS D'AUDIT AUTOMATIQUE
-- ==========================================

-- 1. Fonction générique pour l'audit
-- Elle insère une ligne dans "AuditLog" à chaque action
CREATE OR REPLACE FUNCTION log_audit_action()
RETURNS TRIGGER AS $$
DECLARE
    action_name TEXT;
    entity_type TEXT := TG_TABLE_NAME;
    entity_id TEXT;
    details_json JSONB;
BEGIN
    -- Déterminer l'action
    IF TG_OP = 'INSERT' THEN
        action_name := 'CREATE';
        entity_id := NEW.id::text;
        details_json := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        action_name := 'UPDATE';
        entity_id := NEW.id::text;
        -- On ne garde que les champs modifiés dans les détails
        details_json := jsonb_object_agg(key, value) FROM jsonb_each(to_jsonb(NEW)) 
                        WHERE to_jsonb(NEW) ->> key IS DISTINCT FROM to_jsonb(OLD) ->> key;
    ELSIF TG_OP = 'DELETE' THEN
        action_name := 'DELETE';
        entity_id := OLD.id::text;
        details_json := to_jsonb(OLD);
    END IF;

    -- Insérer dans l'AuditLog (on laisse adminUserId NULL pour l'instant, 
    -- on le remplira via l'API plus tard)
    INSERT INTO "AuditLog" (id, action, "entityType", "entityId", details, "createdAt")
    VALUES (
        gen_random_uuid(),
        action_name,
        entity_type,
        entity_id,
        details_json,
        NOW()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Attacher le trigger aux tables sensibles
-- (On ne met pas sur Etudiant car il y a déjà le soft delete RGPD)

-- Audit sur les AdminUser (création/suppression)
DROP TRIGGER IF EXISTS trigger_audit_admin_user ON "AdminUser";
CREATE TRIGGER trigger_audit_admin_user
AFTER INSERT OR UPDATE OR DELETE ON "AdminUser"
FOR EACH ROW EXECUTE FUNCTION log_audit_action();

-- Audit sur les Cotes (modification manuelle)
DROP TRIGGER IF EXISTS trigger_audit_cote ON "Cote";
CREATE TRIGGER trigger_audit_cote
AFTER INSERT OR UPDATE OR DELETE ON "Cote"
FOR EACH ROW EXECUTE FUNCTION log_audit_action();

-- Audit sur les Inscriptions (validation, rejet, blocage)
DROP TRIGGER IF EXISTS trigger_audit_inscription ON "Inscription";
CREATE TRIGGER trigger_audit_inscription
AFTER UPDATE OF statut ON "Inscription"
FOR EACH ROW EXECUTE FUNCTION log_audit_action();

-- Audit sur les Communiqués (suppression par erreur)
DROP TRIGGER IF EXISTS trigger_audit_communique ON "Communique";
CREATE TRIGGER trigger_audit_communique
AFTER INSERT OR DELETE ON "Communique"
FOR EACH ROW EXECUTE FUNCTION log_audit_action();