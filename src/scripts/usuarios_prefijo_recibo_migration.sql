-- ================================================================
-- Migración: Prefijo de recibos por asesor
-- BD: serfuweb
-- Fecha: 2026-05-21
-- Descripción:
--   Agrega columna prefijo_recibo a usuarios para que el admin
--   asigne un prefijo único por asesor (ej. 'MP' para María Pérez).
--   Este prefijo se concatena con un consecutivo numérico para
--   formar el número de recibo de caja (MP-000001, MP-000002, ...).
-- ================================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS prefijo_recibo VARCHAR(10) NULL
    COMMENT 'Prefijo único para numerar recibos de caja del asesor (ej. MP)'
    AFTER es_super_admin;

-- Índice único PARCIAL (MySQL no soporta unique parcial directo; usamos UNIQUE
-- regular: el valor NULL no compite por unicidad en InnoDB).
ALTER TABLE usuarios
  ADD CONSTRAINT uk_usuarios_prefijo_recibo UNIQUE (prefijo_recibo);

-- Verificación
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'usuarios'
  AND COLUMN_NAME  = 'prefijo_recibo';
