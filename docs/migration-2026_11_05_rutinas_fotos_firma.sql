-- =============================================================
-- Migración: Soporte fotos (Drive URLs) y firma trazada en pre-ejecución
-- =============================================================

-- 1. firma_tecnico ahora puede guardar un data URL de PNG (varios KB)
ALTER TABLE mantenimiento_pre_ejecucion
  MODIFY COLUMN firma_tecnico MEDIUMTEXT NULL;

-- 2. Nueva columna fotos_urls (JSON con los links que devolvió el workflow de Drive)
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mantenimiento_pre_ejecucion'
    AND COLUMN_NAME = 'fotos_urls'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE mantenimiento_pre_ejecucion ADD COLUMN fotos_urls JSON NULL AFTER firma_tecnico',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
