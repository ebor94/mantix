-- =====================================================================
-- SerVentas CRM — Migración 012: Renovación anual de convenios B2B
--
-- Las empresas firman convenio con vigencia (típicamente 1 año). Antes de
-- vencer, el sistema crea automáticamente un prospecto nuevo "En renovación"
-- asignado al mismo asesor original. Si vence sin renovarse, queda visible
-- en el dashboard de recuperación.
--
-- Objetos:
--   1) ALTER sv_crm_prospectos: prosp_fecha_inicio_convenio + prosp_fecha_vencimiento_convenio
--      + prosp_origen_prosp_id (link al convenio anterior cuando es renovación)
--   2) Nuevos estados grupo 2 (Empresariales):
--        - EN_RENOVACION (orden 8, no final, color naranja)
--        - VENCIDO       (orden 9, final, no ganado, color rojo)
--   3) Nueva fuente: RENOVACION para marcar el origen del prospecto
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1) Columnas para vigencia del convenio
-- ---------------------------------------------------------------------
SET @ex = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'sv_crm_prospectos'
              AND COLUMN_NAME = 'prosp_fecha_inicio_convenio');
SET @sql = IF(@ex = 0,
  'ALTER TABLE sv_crm_prospectos ADD COLUMN prosp_fecha_inicio_convenio DATE NULL AFTER prosp_prox_gestion_hora',
  'SELECT "prosp_fecha_inicio_convenio ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ex = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'sv_crm_prospectos'
              AND COLUMN_NAME = 'prosp_fecha_vencimiento_convenio');
SET @sql = IF(@ex = 0,
  'ALTER TABLE sv_crm_prospectos ADD COLUMN prosp_fecha_vencimiento_convenio DATE NULL AFTER prosp_fecha_inicio_convenio',
  'SELECT "prosp_fecha_vencimiento_convenio ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ex = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'sv_crm_prospectos'
              AND COLUMN_NAME = 'prosp_origen_prosp_id');
SET @sql = IF(@ex = 0,
  'ALTER TABLE sv_crm_prospectos ADD COLUMN prosp_origen_prosp_id INT NULL AFTER prosp_fecha_vencimiento_convenio',
  'SELECT "prosp_origen_prosp_id ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Índice para query "prospectos por vencer"
SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'sv_crm_prospectos'
              AND INDEX_NAME = 'idx_prosp_vencimiento');
SET @sql = IF(@ix = 0,
  'ALTER TABLE sv_crm_prospectos ADD INDEX idx_prosp_vencimiento (prosp_fecha_vencimiento_convenio, prosp_estado_id)',
  'SELECT "idx_prosp_vencimiento ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Índice para encontrar renovaciones por convenio original
SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'sv_crm_prospectos'
              AND INDEX_NAME = 'idx_prosp_origen');
SET @sql = IF(@ix = 0,
  'ALTER TABLE sv_crm_prospectos ADD INDEX idx_prosp_origen (prosp_origen_prosp_id)',
  'SELECT "idx_prosp_origen ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 2) Estados nuevos en pipeline B2B (grupo_id=2)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sv_cfg_estados_gestion
  (estado_grupo_id, estado_codigo, estado_nombre, estado_orden, estado_color_hex, estado_es_final, estado_es_ganado, estado_requiere_fecha, estado_activo)
VALUES
  (2, 'EN_RENOVACION', 'En renovación',     8, '#C97B1A', 0, 0, 0, 1),
  (2, 'VENCIDO',       'Vencido sin renovar', 9, '#B83227', 1, 0, 0, 1);

-- ---------------------------------------------------------------------
-- 3) Fuente nueva para distinguir prospectos auto-creados por renovación
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sv_cfg_fuentes_prospecto
  (fuente_area_id, fuente_codigo, fuente_nombre, fuente_es_masiva, fuente_activa, fuente_orden)
VALUES
  (2, 'RENOVACION', 'Renovación automática de convenio', 0, 1, 90);

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'Columnas convenio en prospectos' AS info, COUNT(*) AS cols
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'sv_crm_prospectos'
   AND COLUMN_NAME IN ('prosp_fecha_inicio_convenio', 'prosp_fecha_vencimiento_convenio', 'prosp_origen_prosp_id');

SELECT 'Estados B2B (incluye nuevos)' AS info, estado_codigo, estado_orden
  FROM sv_cfg_estados_gestion
 WHERE estado_grupo_id = 2 AND estado_activo = 1
 ORDER BY estado_orden;

SELECT 'Fuente RENOVACION' AS info, fuente_codigo
  FROM sv_cfg_fuentes_prospecto
 WHERE fuente_codigo = 'RENOVACION';
