-- ================================================================
-- Migración: documentoUrl en tabla beneficiarios
-- BD: serfuweb
-- Fecha: 2026-03-06
-- ================================================================

-- Agregar columna documentoUrl para adjunto opcional del beneficiario
ALTER TABLE beneficiarios
  ADD COLUMN IF NOT EXISTS documentoUrl VARCHAR(500) NULL
    COMMENT 'Nombre del archivo de documento adjunto del beneficiario (opcional)'
    AFTER estado;

-- Verificar
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'serfuweb'
  AND TABLE_NAME   = 'beneficiarios'
  AND COLUMN_NAME  = 'documentoUrl';
