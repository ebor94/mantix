-- =====================================================================
-- SerVentas CRM — Migración 023: visitas de Prenecesidad en salas de velación
--
-- 1) Fuente SALA_VELACION ("Sala de velación") en Prenecesidad.
-- 2) sv_crm_gestiones.gest_homenaje_sala_id: homenaje en sala (Homenajes360)
--    donde se hizo la visita. Sin FK para no acoplar los módulos.
-- 3) sv_crm_salas_contratantes: qué cliente de Prenecesidad es el contratante
--    de cada homenaje (uno por homenaje).
-- Idempotente. Inofensiva para el código anterior.
-- =====================================================================

SET NAMES utf8mb4;

INSERT INTO sv_cfg_fuentes_prospecto (fuente_area_id, fuente_codigo, fuente_nombre, fuente_es_masiva, fuente_orden)
SELECT a.area_id, 'SALA_VELACION', 'Sala de velación', 0, 7
  FROM sv_cfg_areas_negocio a
 WHERE a.area_codigo = 'PRENEC'
   AND NOT EXISTS (SELECT 1 FROM sv_cfg_fuentes_prospecto f
                    WHERE f.fuente_area_id = a.area_id AND f.fuente_codigo = 'SALA_VELACION');

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME   = 'sv_crm_gestiones'
                  AND COLUMN_NAME  = 'gest_homenaje_sala_id');
SET @sql = IF(@existe = 0,
  'ALTER TABLE sv_crm_gestiones ADD COLUMN gest_homenaje_sala_id INT NULL AFTER gest_ubicacion_lng',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME   = 'sv_crm_gestiones'
                  AND INDEX_NAME   = 'idx_gest_homenaje');
SET @sql = IF(@existe = 0,
  'ALTER TABLE sv_crm_gestiones ADD INDEX idx_gest_homenaje (gest_homenaje_sala_id)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS sv_crm_salas_contratantes (
  sc_id               INT      AUTO_INCREMENT PRIMARY KEY,
  sc_homenaje_sala_id INT      NOT NULL,
  sc_prosp_id         INT      NOT NULL,
  sc_usr_id           INT      NOT NULL,
  sc_created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sc_homenaje (sc_homenaje_sala_id),
  INDEX idx_sc_prosp (sc_prosp_id),
  CONSTRAINT fk_sc_prosp FOREIGN KEY (sc_prosp_id) REFERENCES sv_crm_prospectos(prosp_id),
  CONSTRAINT fk_sc_usr   FOREIGN KEY (sc_usr_id)   REFERENCES sv_org_usuarios(usr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: contratante (cliente PRENEC) de cada homenaje en sala';
