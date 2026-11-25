-- =====================================================================
-- SerVentas CRM — Migración 025: productos por tipo y precio ofrecido
--
-- 1) sv_cfg_productos.prod_tipo: segundo nivel de la clasificación
--    (categoría → tipo → producto).
-- 2) sv_cfg_productos.prod_es_generico: fila que representa el tipo completo
--    ("Osarios, por definir"); no lleva precio.
-- 3) sv_crm_prospectos_productos.pp_precio_ofrecido: precio vigente cuando el
--    asesor eligió el producto. Lo pone el servidor y no cambia con la lista.
-- Solo estructura. Idempotente. Inofensiva para el código anterior.
-- Debe correr ANTES de desplegar el backend que la usa.
-- =====================================================================

SET NAMES utf8mb4;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sv_cfg_productos' AND COLUMN_NAME = 'prod_tipo');
SET @sql = IF(@existe = 0,
  'ALTER TABLE sv_cfg_productos ADD COLUMN prod_tipo VARCHAR(50) NULL AFTER prod_categoria',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sv_cfg_productos' AND COLUMN_NAME = 'prod_es_generico');
SET @sql = IF(@existe = 0,
  'ALTER TABLE sv_cfg_productos ADD COLUMN prod_es_generico TINYINT(1) NOT NULL DEFAULT 0 AFTER prod_tipo',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @existe = (SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sv_crm_prospectos_productos' AND COLUMN_NAME = 'pp_precio_ofrecido');
SET @sql = IF(@existe = 0,
  'ALTER TABLE sv_crm_prospectos_productos ADD COLUMN pp_precio_ofrecido DECIMAL(12,2) NULL AFTER pp_es_principal',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
