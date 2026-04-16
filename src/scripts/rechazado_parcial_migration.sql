-- Migration: agregar columnas rechazadoParcial y hashCorreccion a afiliados
-- Fecha: 2026-04-16
-- Ejecutar en la base de datos serfuweb

ALTER TABLE afiliados
  ADD COLUMN rechazadoParcial TINYINT(1) UNSIGNED NOT NULL DEFAULT 0
  COMMENT '1 = rechazado parcialmente (beneficiarios inactivados); pendiente de corrección por el asesor'
  AFTER rechazado,
  ADD COLUMN hashCorreccion VARCHAR(64) NULL DEFAULT NULL
  COMMENT 'Hash AES-256 del ID para la URL de corrección; se genera al hacer rechazo parcial'
  AFTER rechazadoParcial;

-- Verificar
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'afiliados' AND COLUMN_NAME IN ('rechazado', 'rechazadoParcial', 'hashCorreccion');
