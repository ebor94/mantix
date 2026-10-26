-- =============================================================
-- Migración: columnas drive_* en mantenimientos_ejecutados
-- Fecha: 2026-10-26
-- Objetivo: guardar los links a la carpeta de Drive (jornada +
--           informe) que crea el workflow n8n al cerrar un
--           mantenimiento.
-- Idempotente: usa INFORMATION_SCHEMA para no fallar si corre dos veces.
-- =============================================================

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mantenimientos_ejecutados'
    AND COLUMN_NAME = 'drive_jornada_url'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE mantenimientos_ejecutados ADD COLUMN drive_jornada_url VARCHAR(500) NULL AFTER nombre_recibe',
  'SELECT "col drive_jornada_url ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mantenimientos_ejecutados'
    AND COLUMN_NAME = 'drive_jornada_folder_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE mantenimientos_ejecutados ADD COLUMN drive_jornada_folder_id VARCHAR(100) NULL AFTER drive_jornada_url',
  'SELECT "col drive_jornada_folder_id ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mantenimientos_ejecutados'
    AND COLUMN_NAME = 'drive_informe_url'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE mantenimientos_ejecutados ADD COLUMN drive_informe_url VARCHAR(500) NULL AFTER drive_jornada_folder_id',
  'SELECT "col drive_informe_url ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
