-- ================================================================
-- Migración: Columnas de primera cuota / soporte de pago
-- Tabla: afiliados
-- Ejecutar en la BD: serfuweb
-- Fecha: 2026-03-04
-- ================================================================

ALTER TABLE afiliados
  ADD COLUMN IF NOT EXISTS formaPago ENUM('EFECTIVO', 'TRANSFERENCIA', 'CORRESPONSAL') NULL
    COMMENT 'Forma de pago de la primera cuota'
    AFTER observaciones,

  ADD COLUMN IF NOT EXISTS soportePago VARCHAR(500) NULL
    COMMENT 'Nombre del archivo soporte de pago primera cuota (almacenado en uploads/)'
    AFTER formaPago,

  ADD COLUMN IF NOT EXISTS referenciaPago1 VARCHAR(200) NULL
    COMMENT 'Referencia de pago 1 (no. transacción, recibo, comprobante...)'
    AFTER soportePago,

  ADD COLUMN IF NOT EXISTS referenciaPago2 VARCHAR(200) NULL
    COMMENT 'Referencia de pago 2'
    AFTER referenciaPago1,

  ADD COLUMN IF NOT EXISTS referenciaPago3 VARCHAR(200) NULL
    COMMENT 'Referencia de pago 3'
    AFTER referenciaPago2;

-- Verificar columnas agregadas
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'serfuweb'
  AND TABLE_NAME   = 'afiliados'
  AND COLUMN_NAME IN ('formaPago', 'soportePago', 'referenciaPago1', 'referenciaPago2', 'referenciaPago3')
ORDER BY ORDINAL_POSITION;
