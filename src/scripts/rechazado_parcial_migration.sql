-- Migration: agregar columna rechazadoParcial a afiliados
-- Fecha: 2026-04-16
-- Ejecutar en la base de datos serfuweb

ALTER TABLE afiliados
  ADD COLUMN rechazadoParcial TINYINT(1) UNSIGNED NOT NULL DEFAULT 0
  COMMENT '1 = rechazado parcialmente (beneficiarios inactivados); pendiente de corrección por el asesor'
  AFTER rechazado;

-- Verificar
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'afiliados' AND COLUMN_NAME IN ('rechazado', 'rechazadoParcial');
