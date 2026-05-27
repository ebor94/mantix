-- =====================================================================
-- SerVentas CRM — Migración 010: Fidelización Empresas
--
-- Módulo nuevo dentro del área PREV-EMP (Previsión Empresariales).
-- El asesor B2B captura contactos clave de la empresa cliente (gerencia,
-- RRHH, contabilidad...) tras cerrar contrato. Cada contacto tiene N fechas
-- especiales (nacimiento, aniversario laboral, día madre/padre derivados
-- del género, etc.). El equipo de Fidelización gestiona el envío de
-- detalles en esas fechas y registra evidencia (foto, dirección, estado).
--
-- Objetos creados:
--   1) ALTER sv_crm_personas: agrega fecha_nacimiento + genero (M/F/N)
--   2) sv_cfg_grupos_trabajo.FIDELIZACION (grupo_id = 5, área PREV-EMP)
--   3) sv_org_usuarios.agente.fidelizacion@serfunorte.com (rol ASESOR)
--   4) sv_org_usuario_grupos: Pedro (supervisor previsión) accede al grupo 5
--   5) sv_crm_contactos_fideliz  — pivote N:M empresa↔persona con cargo
--   6) sv_crm_fechas_especiales  — N fechas por persona (tipo + fecha)
--   7) sv_fideliz_envios         — gestión inmutable de detalles enviados
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1) ALTER sv_crm_personas: agregar campos para fidelización
--    (solo si no existen, MySQL no soporta IF NOT EXISTS en ADD COLUMN)
-- ---------------------------------------------------------------------
SET @col_existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'sv_crm_personas'
                      AND COLUMN_NAME = 'persona_fecha_nacimiento');
SET @sql = IF(@col_existe = 0,
  'ALTER TABLE sv_crm_personas ADD COLUMN persona_fecha_nacimiento DATE NULL AFTER persona_ciudad',
  'SELECT "persona_fecha_nacimiento ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = 'sv_crm_personas'
                      AND COLUMN_NAME = 'persona_genero');
SET @sql = IF(@col_existe = 0,
  'ALTER TABLE sv_crm_personas ADD COLUMN persona_genero CHAR(1) NULL AFTER persona_fecha_nacimiento',
  'SELECT "persona_genero ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Índice para queries de próximos cumpleaños (por mes/día)
SET @ix_existe = (SELECT COUNT(*) FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 'sv_crm_personas'
                     AND INDEX_NAME = 'idx_persona_cumple');
SET @sql = IF(@ix_existe = 0,
  'ALTER TABLE sv_crm_personas ADD INDEX idx_persona_cumple (persona_fecha_nacimiento)',
  'SELECT "idx_persona_cumple ya existe" AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 2) Grupo FIDELIZACION dentro del área PREV-EMP (area_id = 2)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sv_cfg_grupos_trabajo
  (grupo_area_id, grupo_codigo, grupo_nombre, grupo_tipo_venta, grupo_meta_default)
VALUES
  (2, 'FIDELIZACION', 'Fidelización Empresas', 'b2b', 0);

-- ---------------------------------------------------------------------
-- 3) Usuario agente Fidelización (rol ASESOR=4, área PREV-EMP=2, punto LO=2)
--    Password "PENDING" se reemplaza por bcrypt('serventas2026') en setup.js
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sv_org_usuarios
  (usr_area_id, usr_grupo_id, usr_rol_id, usr_punto_id,
   usr_email, usr_nombre, usr_apellido, usr_password_hash, usr_telefono)
VALUES
  (2,
   (SELECT grupo_id FROM sv_cfg_grupos_trabajo WHERE grupo_codigo = 'FIDELIZACION'),
   4, 2,
   'agente.fidelizacion@serfunorte.com', 'Laura', 'Fidelización',
   'PENDING', '301 555 0001');

-- ---------------------------------------------------------------------
-- 4) Pedro (Supervisor Previsión) gana acceso al grupo Fidelización
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sv_org_usuario_grupos (usr_id, grupo_id)
SELECT u.usr_id, g.grupo_id
  FROM sv_org_usuarios u
  CROSS JOIN sv_cfg_grupos_trabajo g
 WHERE u.usr_email = 'supervisor.prevision@serfunorte.com'
   AND g.grupo_codigo = 'FIDELIZACION';

-- ---------------------------------------------------------------------
-- 5) sv_crm_contactos_fideliz — relación N:M empresa↔persona con contexto
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_contactos_fideliz (
  cf_id              INT          AUTO_INCREMENT PRIMARY KEY,
  cf_empresa_id      INT          NOT NULL,
  cf_persona_id      INT          NOT NULL,
  cf_cargo           VARCHAR(120) NULL,
  cf_departamento    VARCHAR(120) NULL,
  cf_fecha_ingreso   DATE         NULL,
  cf_es_titular      TINYINT(1)   NOT NULL DEFAULT 0,
  cf_observaciones   TEXT         NULL,
  cf_activo          TINYINT(1)   NOT NULL DEFAULT 1,
  cf_capturado_por   INT          NULL,
  cf_created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cf_updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cf_empresa_persona (cf_empresa_id, cf_persona_id),
  INDEX idx_cf_empresa (cf_empresa_id, cf_activo),
  INDEX idx_cf_persona (cf_persona_id),
  INDEX idx_cf_captura (cf_capturado_por),
  CONSTRAINT fk_cf_empresa  FOREIGN KEY (cf_empresa_id)    REFERENCES sv_crm_empresas(empresa_id)  ON DELETE CASCADE,
  CONSTRAINT fk_cf_persona  FOREIGN KEY (cf_persona_id)    REFERENCES sv_crm_personas(persona_id)  ON DELETE CASCADE,
  CONSTRAINT fk_cf_captura  FOREIGN KEY (cf_capturado_por) REFERENCES sv_org_usuarios(usr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas Fideliz: contactos clave por empresa con cargo y departamento';

-- ---------------------------------------------------------------------
-- 6) sv_crm_fechas_especiales — N fechas por persona
--    Tipos: nacimiento, aniversario_laboral, dia_madre, dia_padre,
--           aniversario_boda, otro.
--    Día madre/padre se DERIVAN del género (no se insertan acá).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_crm_fechas_especiales (
  fe_id            INT          AUTO_INCREMENT PRIMARY KEY,
  fe_persona_id    INT          NOT NULL,
  fe_tipo          VARCHAR(30)  NOT NULL,
  fe_fecha         DATE         NOT NULL,
  fe_descripcion   VARCHAR(200) NULL,
  fe_activa        TINYINT(1)   NOT NULL DEFAULT 1,
  fe_created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fe_persona (fe_persona_id, fe_activa),
  INDEX idx_fe_mes_dia (fe_tipo, fe_fecha),
  CONSTRAINT fk_fe_persona FOREIGN KEY (fe_persona_id) REFERENCES sv_crm_personas(persona_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas Fideliz: fechas especiales por persona (N por persona)';

-- ---------------------------------------------------------------------
-- 7) sv_fideliz_envios — envíos inmutables, tracking año a año
--    UNIQUE (persona, fecha_especial, año) evita doble gestión del mismo evento
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sv_fideliz_envios (
  env_id                BIGINT        AUTO_INCREMENT PRIMARY KEY,
  env_persona_id        INT           NOT NULL,
  env_empresa_id        INT           NOT NULL,
  env_fecha_especial_id INT           NULL,                       -- NULL si es fecha derivada (madre/padre)
  env_evento_anio       SMALLINT      NOT NULL,                   -- año del evento gestionado
  env_evento_tipo       VARCHAR(30)   NOT NULL,                   -- 'nacimiento','dia_madre','dia_padre','aniversario_laboral','otro'
  env_agente_id         INT           NOT NULL,
  env_fecha_envio       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  env_tipo_detalle      VARCHAR(100)  NULL,                       -- 'Tarjeta + arreglo floral', 'Bono regalo $100k', etc.
  env_direccion_entrega VARCHAR(250)  NULL,
  env_estado            VARCHAR(20)   NOT NULL DEFAULT 'enviado', -- 'enviado','confirmado','devuelto'
  env_evidencia_url     VARCHAR(255)  NULL,                       -- ruta de foto subida (multer)
  env_comentario        TEXT          NULL,
  env_created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_env_persona_evento_anio (env_persona_id, env_evento_tipo, env_evento_anio, env_fecha_especial_id),
  INDEX idx_env_agente_fecha (env_agente_id, env_fecha_envio),
  INDEX idx_env_empresa      (env_empresa_id, env_fecha_envio),
  CONSTRAINT fk_env_persona FOREIGN KEY (env_persona_id) REFERENCES sv_crm_personas(persona_id),
  CONSTRAINT fk_env_empresa FOREIGN KEY (env_empresa_id) REFERENCES sv_crm_empresas(empresa_id),
  CONSTRAINT fk_env_fe      FOREIGN KEY (env_fecha_especial_id) REFERENCES sv_crm_fechas_especiales(fe_id) ON DELETE SET NULL,
  CONSTRAINT fk_env_agente  FOREIGN KEY (env_agente_id)  REFERENCES sv_org_usuarios(usr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas Fideliz: envíos inmutables de detalles (1 por persona+evento+año)';

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
SELECT 'Grupo FIDELIZACION'      AS info, grupo_id, grupo_codigo FROM sv_cfg_grupos_trabajo WHERE grupo_codigo = 'FIDELIZACION';
SELECT 'Agente Fidelización'     AS info, usr_id, usr_email      FROM sv_org_usuarios       WHERE usr_email   = 'agente.fidelizacion@serfunorte.com';
SELECT 'Pedro multi-grupo' AS info, COUNT(*) AS grupos FROM sv_org_usuario_grupos ug
  JOIN sv_org_usuarios u ON u.usr_id = ug.usr_id WHERE u.usr_email = 'supervisor.prevision@serfunorte.com';
SELECT 'contactos_fideliz'   AS tabla, COUNT(*) AS filas FROM sv_crm_contactos_fideliz
UNION ALL SELECT 'fechas_especiales', COUNT(*) FROM sv_crm_fechas_especiales
UNION ALL SELECT 'fideliz_envios',    COUNT(*) FROM sv_fideliz_envios;
