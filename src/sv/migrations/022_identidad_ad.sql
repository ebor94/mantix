-- =====================================================================
-- SerVentas CRM — Migración 022: login único contra el directorio activo
--
-- 1) org_identidad.ad_usuario + índice único (vínculo con sAMAccountName).
-- 2) org_identidad.password_hash y sv_org_usuarios.usr_password_hash pasan a
--    NULL: el código deja de usarlas. Los hashes existentes NO se borran
--    (red de reversión); se limpian en un paso posterior.
-- Idempotente.
-- =====================================================================

SET NAMES utf8mb4;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME   = 'org_identidad'
                  AND COLUMN_NAME  = 'ad_usuario');
SET @sql = IF(@existe = 0,
  'ALTER TABLE org_identidad ADD COLUMN ad_usuario VARCHAR(64) NULL AFTER email_norm',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME   = 'org_identidad'
                  AND INDEX_NAME   = 'uq_identidad_ad_usuario');
SET @sql = IF(@existe = 0,
  'ALTER TABLE org_identidad ADD UNIQUE INDEX uq_identidad_ad_usuario (ad_usuario)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

ALTER TABLE org_identidad   MODIFY password_hash     VARCHAR(255) NULL;
ALTER TABLE sv_org_usuarios MODIFY usr_password_hash VARCHAR(255) NULL;
