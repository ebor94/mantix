-- =====================================================================
-- SerVentas CRM — Migración 008: SVC solo recuperación
-- El call center SOLO recupera clientes retirados/cancelados de Previsión.
-- - Inactiva fuente "Lista clientes nuevos" (no aplica)
-- - Asegura fuentes de recuperación con campos descriptivos
-- - Inactiva estado "NUEVO" del grupo SVC (todo entra como "Para recuperar")
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Inactivar fuentes que no aplican (clientes nuevos, llamada entrante, referido, campaña)
UPDATE sv_cfg_fuentes_prospecto
   SET fuente_activa = 0
 WHERE fuente_area_id = 4
   AND fuente_codigo IN ('LISTA_NUEVOS','LLAMADA_ENT','REFERIDO_SVC','CAMPANA_FIDELIZ');

-- 2. Asegurar fuente principal: "Lista recuperación cancelados"
INSERT IGNORE INTO sv_cfg_fuentes_prospecto (fuente_area_id, fuente_codigo, fuente_nombre, fuente_es_masiva, fuente_orden) VALUES
(4, 'LISTA_RECUPERA',     'Lista recuperación cancelados', 1, 1),
(4, 'CANCEL_PREV_EMP',    'Cancelado de Empresariales',    1, 2),
(4, 'CANCEL_PREV_PAP',    'Cancelado de PAP',              1, 3);

UPDATE sv_cfg_fuentes_prospecto
   SET fuente_activa = 1, fuente_es_masiva = 1
 WHERE fuente_area_id = 4
   AND fuente_codigo IN ('LISTA_RECUPERA','CANCEL_PREV_EMP','CANCEL_PREV_PAP');

-- 3. Renombrar estado NUEVO → PARA_RECUPERAR como estado inicial natural
--    (mantenemos PARA_RECUPERAR creado en 007, inactivamos NUEVO para SVC)
UPDATE sv_cfg_estados_gestion
   SET estado_activo = 0
 WHERE estado_grupo_id = 4
   AND estado_codigo = 'NUEVO';

-- Bajar el orden de PARA_RECUPERAR a 1 para que sea el primero en el pipeline SVC
UPDATE sv_cfg_estados_gestion
   SET estado_orden = 1,
       estado_nombre = 'Para recuperar',
       estado_color_hex = '#8A6A52'
 WHERE estado_grupo_id = 4
   AND estado_codigo = 'PARA_RECUPERAR';

UPDATE sv_cfg_estados_gestion SET estado_orden = 2 WHERE estado_grupo_id = 4 AND estado_codigo = 'CONTACTADO';
UPDATE sv_cfg_estados_gestion SET estado_orden = 3 WHERE estado_grupo_id = 4 AND estado_codigo = 'INTERESADO';
UPDATE sv_cfg_estados_gestion SET estado_orden = 4 WHERE estado_grupo_id = 4 AND estado_codigo = 'EN_PROCESO';
UPDATE sv_cfg_estados_gestion SET estado_orden = 5 WHERE estado_grupo_id = 4 AND estado_codigo = 'RECUPERADO';
UPDATE sv_cfg_estados_gestion SET estado_orden = 6 WHERE estado_grupo_id = 4 AND estado_codigo = 'DESCARTADO';
-- CERRADO queda inactivo (RECUPERADO es el cierre exitoso de SVC)
UPDATE sv_cfg_estados_gestion SET estado_activo = 0 WHERE estado_grupo_id = 4 AND estado_codigo = 'CERRADO';

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

SELECT 'Fuentes SVC activas' AS info, GROUP_CONCAT(fuente_codigo) AS codigos
  FROM sv_cfg_fuentes_prospecto WHERE fuente_area_id = 4 AND fuente_activa = 1
UNION ALL
SELECT 'Estados SVC activos', GROUP_CONCAT(estado_codigo ORDER BY estado_orden)
  FROM sv_cfg_estados_gestion WHERE estado_grupo_id = 4 AND estado_activo = 1;
