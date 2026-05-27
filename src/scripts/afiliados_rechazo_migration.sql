-- ================================================================
-- Migración: Campo de rechazo de afiliaciones
-- Tabla: afiliados
-- Ejecutar en la BD: serfuweb
-- Fecha: 2026-03-04
-- ================================================================

ALTER TABLE afiliados
  ADD COLUMN IF NOT EXISTS rechazado TINYINT(1) UNSIGNED NOT NULL DEFAULT 0
    COMMENT '1 = rechazado por el aprobador; 0 = sin rechazo'
    AFTER referenciaPago3,

  ADD COLUMN IF NOT EXISTS motivoRechazo TEXT NULL
    COMMENT 'Motivo de rechazo ingresado por el aprobador'
    AFTER rechazado;

-- Garantizar que registros existentes tengan rechazado = 0
UPDATE afiliados SET rechazado = 0 WHERE rechazado IS NULL;

-- Índice para consultas por rechazado
ALTER TABLE afiliados
  ADD INDEX IF NOT EXISTS idx_rechazado (rechazado);

-- Verificar columnas agregadas
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'serfuweb'
  AND TABLE_NAME   = 'afiliados'
  AND COLUMN_NAME IN ('rechazado', 'motivoRechazo')
ORDER BY ORDINAL_POSITION;
