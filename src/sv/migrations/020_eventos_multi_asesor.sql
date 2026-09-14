-- =====================================================================
-- SerVentas CRM — Migración 020: Eventos multi-asesor + pool público
--
-- Cambios:
-- 1) ALTER sv_org_eventos_agenda (rango fechas, apoyo, link público,
--    meta leads, grupo/area para scope).
-- 2) sv_org_eventos_asistentes  — N:N asesores por evento + métricas.
-- 3) sv_org_eventos_slots       — franjas horarias por día (modo SLOTS).
-- 4) sv_org_eventos_pool_registros — leads del form público antes de asignar.
-- 5) INSERT fuente 'EVENTO_PUBLICO' en cada área activa (para prospectos
--    creados desde el pool al ser asignados a un asesor).
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------
-- 1) ALTER sv_org_eventos_agenda
-- ------------------------------------------------------------------
SET @col_existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME   = 'sv_org_eventos_agenda'
                      AND COLUMN_NAME  = 'evento_fecha_fin');
SET @sql = IF(@col_existe = 0,
  'ALTER TABLE sv_org_eventos_agenda
     ADD COLUMN evento_fecha_fin       DATETIME    NULL AFTER evento_fecha_hora,
     ADD COLUMN evento_modo_fechas     VARCHAR(20) NOT NULL DEFAULT ''UNICO''
       COMMENT ''UNICO | DIA_COMPLETO_MULTI | SLOTS'',
     ADD COLUMN evento_apoyo_usr_id    INT         NULL,
     ADD COLUMN evento_link_hash       CHAR(32)    NULL,
     ADD COLUMN evento_registros_publicos_habilitado TINYINT NOT NULL DEFAULT 0,
     ADD COLUMN evento_meta_leads      INT         NULL,
     ADD COLUMN evento_grupo_id        INT         NULL,
     ADD COLUMN evento_area_id         INT         NULL,
     ADD UNIQUE KEY uq_evento_link_hash (evento_link_hash),
     ADD INDEX idx_evento_apoyo (evento_apoyo_usr_id),
     ADD INDEX idx_evento_grupo_fecha (evento_grupo_id, evento_fecha_hora)',
  'SELECT ''evento_fecha_fin ya existe'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------------
-- 2) sv_org_eventos_asistentes
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_eventos_asistentes (
  eva_id                 INT AUTO_INCREMENT PRIMARY KEY,
  eva_evento_id          INT NOT NULL,
  eva_usr_id             INT NOT NULL,
  eva_estado             VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADO'
    COMMENT 'CONFIRMADO | ASISTIO | NO_ASISTIO | JUSTIFICADO',
  eva_leads_captados     INT NULL,
  eva_prospectos_creados INT NULL,
  eva_ventas_cerradas    INT NULL,
  eva_activo             TINYINT NOT NULL DEFAULT 1,
  eva_created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_eva_evento_usr (eva_evento_id, eva_usr_id),
  INDEX idx_eva_usr (eva_usr_id),
  CONSTRAINT fk_eva_evento FOREIGN KEY (eva_evento_id)
    REFERENCES sv_org_eventos_agenda(evento_id) ON DELETE CASCADE,
  CONSTRAINT fk_eva_usr FOREIGN KEY (eva_usr_id)
    REFERENCES sv_org_usuarios(usr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: asistentes N:N por evento con métricas de gestión';

-- ------------------------------------------------------------------
-- 3) sv_org_eventos_slots
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_eventos_slots (
  slot_id          INT AUTO_INCREMENT PRIMARY KEY,
  slot_evento_id   INT NOT NULL,
  slot_fecha       DATE NOT NULL,
  slot_hora_inicio TIME NOT NULL,
  slot_hora_fin    TIME NOT NULL,
  INDEX idx_slot_evento_fecha (slot_evento_id, slot_fecha),
  CONSTRAINT fk_slot_evento FOREIGN KEY (slot_evento_id)
    REFERENCES sv_org_eventos_agenda(evento_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: franjas horarias por día para eventos modo SLOTS';

-- ------------------------------------------------------------------
-- 4) sv_org_eventos_pool_registros
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_org_eventos_pool_registros (
  pool_id           INT AUTO_INCREMENT PRIMARY KEY,
  pool_evento_id    INT NOT NULL,
  pool_nombre       VARCHAR(180) NOT NULL,
  pool_telefono     VARCHAR(30)  NOT NULL,
  pool_correo       VARCHAR(180) NULL,
  pool_ip           VARCHAR(45)  NULL,
  pool_user_agent   VARCHAR(255) NULL,
  pool_prosp_id     INT NULL COMMENT 'FK a sv_crm_prospectos cuando se convierte',
  pool_asignado_a   INT NULL,
  pool_asignado_at  DATETIME NULL,
  pool_asignado_por INT NULL,
  pool_created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pool_evento_tel (pool_evento_id, pool_telefono),
  INDEX idx_pool_evento    (pool_evento_id),
  INDEX idx_pool_pendiente (pool_evento_id, pool_prosp_id),
  CONSTRAINT fk_pool_evento FOREIGN KEY (pool_evento_id)
    REFERENCES sv_org_eventos_agenda(evento_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: pool de registros del form público antes de asignar';

-- ------------------------------------------------------------------
-- 5) Fuente 'EVENTO_PUBLICO' por área activa (idempotente)
-- ------------------------------------------------------------------
INSERT IGNORE INTO sv_cfg_fuentes_prospecto (fuente_area_id, fuente_codigo, fuente_nombre, fuente_es_masiva, fuente_activa, fuente_orden)
SELECT area_id, 'EVENTO_PUBLICO', 'Evento (registro público)', 0, 1, 99
  FROM sv_cfg_areas_negocio
 WHERE area_activa = 1;

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- Verificación
SELECT
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sv_org_eventos_agenda' AND COLUMN_NAME='evento_fecha_fin') AS altered,
  (SELECT COUNT(*) FROM sv_org_eventos_asistentes)     AS asistentes_count,
  (SELECT COUNT(*) FROM sv_org_eventos_slots)          AS slots_count,
  (SELECT COUNT(*) FROM sv_org_eventos_pool_registros) AS pool_count,
  (SELECT COUNT(*) FROM sv_cfg_fuentes_prospecto WHERE fuente_codigo='EVENTO_PUBLICO') AS fuentes_evento;
