-- =====================================================================
-- SerVentas CRM — Migración 007: SVC como área COMERCIAL
-- SVC = Call Center que hace:
--   - Gestión de clientes nuevos (similar a Prenecesidad)
--   - Recuperación de clientes (reactivar inactivos/cancelados)
-- Reusa la infraestructura de prospectos/gestiones con grupo SVC-AGENTES.
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. ADD COLUMN prosp_subproceso (nullable) en sv_crm_prospectos
--    Valores: 'nuevo' / 'recuperacion'. NULL para áreas que no lo usan.
-- ---------------------------------------------------------------------
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 'sv_crm_prospectos'
                     AND COLUMN_NAME = 'prosp_subproceso');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE sv_crm_prospectos ADD COLUMN prosp_subproceso VARCHAR(20) NULL AFTER prosp_zona_pap, ADD INDEX idx_prosp_subproceso (prosp_subproceso)',
  'SELECT "Columna prosp_subproceso ya existe" AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 2. Estados de pipeline para grupo SVC (grupo_id=4)
--    REEMPLAZAR los estados PQRS por estados de gestión comercial.
--    Estrategia: desactivar los antiguos + insertar nuevos.
-- ---------------------------------------------------------------------
UPDATE sv_cfg_estados_gestion
   SET estado_activo = 0
 WHERE estado_grupo_id = 4
   AND estado_codigo IN ('ABIERTO','EN_GESTION','ESCALADO','RESUELTO','CERRADO');

INSERT IGNORE INTO sv_cfg_estados_gestion (estado_grupo_id, estado_codigo, estado_nombre, estado_color_hex, estado_es_final, estado_es_ganado, estado_requiere_fecha, estado_orden) VALUES
(4, 'NUEVO',          'Nuevo',                '#8A6A52', 0, 0, 0, 1),
(4, 'CONTACTADO',     'Contactado',           '#C97B1A', 0, 0, 1, 2),
(4, 'INTERESADO',     'Interesado',           '#5A3E9E', 0, 0, 1, 3),
(4, 'EN_PROCESO',     'En proceso de cierre', '#1A5C8A', 0, 0, 1, 4),
(4, 'CERRADO',        'Contrato cerrado',     '#2A6E47', 1, 1, 0, 5),
(4, 'PARA_RECUPERAR', 'Para recuperar',       '#9B4F20', 0, 0, 0, 6),
(4, 'RECUPERADO',     'Cliente recuperado',   '#2A6E47', 1, 1, 0, 7),
(4, 'DESCARTADO',     'Descartado',           '#B83227', 1, 0, 0, 8);

-- ---------------------------------------------------------------------
-- 3. Resultados de gestión para grupo SVC (grupo_id=4)
--    REEMPLAZAR los resultados PQRS por resultados comerciales.
-- ---------------------------------------------------------------------
UPDATE sv_cfg_resultados_gestion
   SET resultado_activo = 0
 WHERE resultado_grupo_id = 4
   AND resultado_codigo IN ('GESTIONANDO','ESCALADO','INFO_BRINDADA','RESUELTO','SIN_SOLUCION');

INSERT IGNORE INTO sv_cfg_resultados_gestion (resultado_grupo_id, resultado_codigo, resultado_nombre, resultado_icono, resultado_es_positivo, resultado_requiere_fecha, resultado_orden) VALUES
(4, 'NO_CONTESTA',     'No contesta',                '📵', 0, 1, 1),
(4, 'OCUPADO',         'Ocupado / volver a llamar',  '🔄', 0, 1, 2),
(4, 'NUM_EQUIVOCADO',  'Número equivocado',          '❌', 0, 0, 3),
(4, 'NO_INTERESADO',   'No interesado',              '🚫', 0, 0, 4),
(4, 'INTERESADO_INFO', 'Interesado — enviar info',   '📩', 1, 1, 5),
(4, 'INTERESADO_VIS',  'Interesado — agendar visita','📅', 1, 1, 6),
(4, 'REACTIVADO',      'Cliente reactivado',         '♻️', 1, 0, 7),
(4, 'CONTRATO',        'Contrato firmado',           '✅', 1, 0, 8);

-- ---------------------------------------------------------------------
-- 4. Fuentes de prospecto para área SVC (area_id=4)
--    Diferenciar nuevos vs recuperación con fuentes distintas.
-- ---------------------------------------------------------------------
UPDATE sv_cfg_fuentes_prospecto
   SET fuente_activa = 0
 WHERE fuente_area_id = 4
   AND fuente_codigo IN ('CONTRATO_SAP','PQRS_WEB','DERIVADO');

INSERT IGNORE INTO sv_cfg_fuentes_prospecto (fuente_area_id, fuente_codigo, fuente_nombre, fuente_es_masiva, fuente_orden) VALUES
(4, 'LISTA_NUEVOS',    'Lista clientes nuevos',          1, 1),
(4, 'LISTA_RECUPERA',  'Lista recuperación cancelados',  1, 2),
(4, 'LLAMADA_ENT',     'Llamada entrante',               0, 3),  -- ya existía, idempotente
(4, 'REFERIDO_SVC',    'Referido por cliente',           0, 4),
(4, 'CAMPANA_FIDELIZ', 'Campaña fidelización',           0, 5);

-- ---------------------------------------------------------------------
-- 5. Actualizar permisos del rol AGENTE_SVC para permitir gestión CRM
--    (antes solo tenía permisos svc; ahora también crm)
-- ---------------------------------------------------------------------
UPDATE sv_org_roles
   SET rol_permisos = '{"crm":["read","write"],"svc":["read","write"],"reportes":["read"]}'
 WHERE rol_codigo = 'AGENTE_SVC';

-- ---------------------------------------------------------------------
-- 6. Vincular SVC al supervisor previsión y admin comercial
-- ---------------------------------------------------------------------
SET @uid_pedro = (SELECT usr_id FROM sv_org_usuarios WHERE usr_email = 'supervisor.prevision@serfunorte.com');
SET @uid_admincom = (SELECT usr_id FROM sv_org_usuarios WHERE usr_email = 'admin.comercial@serfunorte.com');

-- Multi-área: agregar SVC
INSERT IGNORE INTO sv_org_usuario_areas (usr_id, area_id) VALUES
  (@uid_pedro,    4),  -- SVC para Pedro
  (@uid_admincom, 4);  -- SVC para María

-- Multi-grupo: agregar grupo SVC-AGENTES (id=4)
INSERT IGNORE INTO sv_org_usuario_grupos (usr_id, grupo_id) VALUES
  (@uid_pedro, 4);  -- Pedro supervisa SVC-AGENTES también

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- Verificación
SELECT 'Estados SVC activos' AS info, COUNT(*) AS total
  FROM sv_cfg_estados_gestion WHERE estado_grupo_id = 4 AND estado_activo = 1
UNION ALL
SELECT 'Resultados SVC activos', COUNT(*) FROM sv_cfg_resultados_gestion WHERE resultado_grupo_id = 4 AND resultado_activo = 1
UNION ALL
SELECT 'Fuentes SVC activas', COUNT(*) FROM sv_cfg_fuentes_prospecto WHERE fuente_area_id = 4 AND fuente_activa = 1;
