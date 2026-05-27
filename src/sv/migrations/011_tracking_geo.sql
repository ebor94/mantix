-- =====================================================================
-- SerVentas CRM — Migración 011: Tracking de recorridos GPS (Fase 7)
--
-- Permite registrar la ruta completa que recorre un asesor durante su
-- jornada laboral, no solo el punto donde hace una gestión.
--
-- Habeas Data (Ley 1581/2012):
--  - usr_consentimiento_geo_at: marca explícita de consentimiento del asesor.
--  - usr_horario_laboral JSON: horario declarado; fuera de él no se almacena.
--  - Retención 90 días (purga vía cron job).
--
-- Objetos creados:
--   1) ALTER sv_org_usuarios: consentimiento + horario laboral
--   2) sv_org_jornadas    — inicio/fin de cada jornada de tracking
--   3) sv_org_tracking_puntos — puntos GPS append-only
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1) ALTER sv_org_usuarios: campos para tracking
-- ---------------------------------------------------------------------
SET @col_existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'sv_org_usuarios'
                      AND COLUMN_NAME = 'usr_consentimiento_geo_at');
SET @sql = IF(@col_existe = 0,
  'ALTER TABLE sv_org_usuarios ADD COLUMN usr_consentimiento_geo_at DATETIME NULL AFTER usr_ultimo_login',
  'SELECT "usr_consentimiento_geo_at ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'sv_org_usuarios'
                      AND COLUMN_NAME = 'usr_horario_laboral');
SET @sql = IF(@col_existe = 0,
  'ALTER TABLE sv_org_usuarios ADD COLUMN usr_horario_laboral JSON NULL AFTER usr_consentimiento_geo_at',
  'SELECT "usr_horario_laboral ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 2) sv_org_jornadas — registro maestro de jornadas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_jornadas (
  jor_id                CHAR(36)      NOT NULL PRIMARY KEY,
  jor_usr_id            INT           NOT NULL,
  jor_fecha             DATE          NOT NULL,
  jor_inicio_at         DATETIME      NOT NULL,
  jor_fin_at            DATETIME      NULL,
  jor_inicio_lat        DECIMAL(10, 8) NULL,
  jor_inicio_lng        DECIMAL(11, 8) NULL,
  jor_fin_lat           DECIMAL(10, 8) NULL,
  jor_fin_lng           DECIMAL(11, 8) NULL,
  jor_puntos_total      INT           NOT NULL DEFAULT 0,
  jor_km_recorridos     DECIMAL(8, 2) NULL,
  jor_duracion_min      INT           NULL,
  jor_estado            VARCHAR(20)   NOT NULL DEFAULT 'activa',  -- activa | finalizada | auto_cerrada
  jor_dispositivo       VARCHAR(255)  NULL,
  jor_ip_inicio         VARCHAR(45)   NULL,
  jor_consentimiento_at DATETIME      NULL,                       -- snapshot al iniciar
  jor_created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  jor_updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_jor_usr_inicio (jor_usr_id, jor_fecha, jor_inicio_at),
  INDEX idx_jor_usr_fecha (jor_usr_id, jor_fecha),
  INDEX idx_jor_estado    (jor_estado, jor_inicio_at),
  CONSTRAINT fk_jor_usr FOREIGN KEY (jor_usr_id) REFERENCES sv_org_usuarios(usr_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: jornadas de tracking GPS de los asesores (Fase 7)';

-- ---------------------------------------------------------------------
-- 3) sv_org_tracking_puntos — puntos GPS append-only
--    Inmutables (no se editan ni borran salvo por job de purga).
--    Retención 90 días — purga automática nocturna.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_tracking_puntos (
  tp_id         BIGINT        AUTO_INCREMENT PRIMARY KEY,
  tp_jor_id     CHAR(36)      NOT NULL,
  tp_usr_id     INT           NOT NULL,                          -- denormalizado para queries rápidas
  tp_fecha_hora DATETIME(3)   NOT NULL,                          -- timestamp del GPS, no del server (precisión ms)
  tp_lat        DECIMAL(10, 8) NOT NULL,
  tp_lng        DECIMAL(11, 8) NOT NULL,
  tp_precision_m FLOAT        NULL,                              -- accuracy reportado por GPS
  tp_altitud    FLOAT         NULL,
  tp_velocidad  FLOAT         NULL,                              -- m/s
  tp_bateria    TINYINT       NULL,                              -- 0-100 si el browser lo expone
  tp_fuente     VARCHAR(20)   NOT NULL DEFAULT 'foreground',     -- foreground | service_worker | manual
  tp_created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tp_usr_fecha (tp_usr_id, tp_fecha_hora),
  INDEX idx_tp_jornada   (tp_jor_id, tp_fecha_hora),
  CONSTRAINT fk_tp_jornada FOREIGN KEY (tp_jor_id) REFERENCES sv_org_jornadas(jor_id) ON DELETE CASCADE,
  CONSTRAINT fk_tp_usr     FOREIGN KEY (tp_usr_id) REFERENCES sv_org_usuarios(usr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: puntos GPS append-only del tracking de jornada (Fase 7, retención 90 días)';

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'sv_org_jornadas'         AS tabla, COUNT(*) AS registros FROM sv_org_jornadas
UNION ALL SELECT 'sv_org_tracking_puntos', COUNT(*) FROM sv_org_tracking_puntos;

SELECT 'Columnas usr_consentimiento_geo_at + usr_horario_laboral añadidas' AS info,
       COUNT(*) AS cols
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME = 'sv_org_usuarios'
   AND COLUMN_NAME IN ('usr_consentimiento_geo_at', 'usr_horario_laboral');
