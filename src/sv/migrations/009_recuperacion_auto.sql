-- =====================================================================
-- SerVentas CRM — Migración 009: Recuperación automática cross-área
-- Cuando un prospecto de Previsión queda en estado final NO ganado,
-- se genera automáticamente un prospecto en SVC sin asesor para distribuir.
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. Permitir prospectos sin asesor asignado (cola del supervisor SVC)
-- ---------------------------------------------------------------------
-- Verificar si ya es NULL para idempotencia
SET @es_nullable = (SELECT IS_NULLABLE FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE()
                       AND TABLE_NAME = 'sv_crm_prospectos'
                       AND COLUMN_NAME = 'prosp_asesor_id');

SET @sql = IF(@es_nullable = 'NO',
  'ALTER TABLE sv_crm_prospectos MODIFY COLUMN prosp_asesor_id INT NULL',
  'SELECT "prosp_asesor_id ya es nullable" AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Índice específico para consultar "sin asignar" por área (queries supervisor).
-- MySQL NO soporta CREATE INDEX IF NOT EXISTS, así que usamos workaround condicional:
SET @ix_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 'sv_crm_prospectos'
                     AND INDEX_NAME = 'idx_prosp_sin_asesor');
SET @sql = IF(@ix_exists = 0,
  'ALTER TABLE sv_crm_prospectos ADD INDEX idx_prosp_sin_asesor (prosp_area_id, prosp_asesor_id, prosp_activo)',
  'SELECT "Indice idx_prosp_sin_asesor ya existe" AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

SELECT 'OK: prosp_asesor_id nullable + indice idx_prosp_sin_asesor' AS resultado;
