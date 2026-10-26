-- =============================================================
-- Migración: columna responsable_proveedor_id en equipos
-- Fecha: 2026-10-26
-- Objetivo: el responsable de mantenimiento de un equipo es un
--           proveedor, no un usuario interno. Se agrega una FK
--           opcional a proveedores. Se conserva responsable_id
--           (usuario) por si lo usan otros flujos; el modal de
--           Editar Equipo ahora muestra solo el nuevo campo.
-- Idempotente.
-- =============================================================

SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'equipos'
    AND COLUMN_NAME = 'responsable_proveedor_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE equipos ADD COLUMN responsable_proveedor_id INT NULL AFTER responsable_id',
  'SELECT "col responsable_proveedor_id ya existe" AS msg');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Verificación
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'equipos'
  AND COLUMN_NAME LIKE 'responsable%';
