-- ================================================================
-- Migración: Cédula, valorRecibido y diferenteAlContratante
-- Tabla: afiliados
-- Ejecutar en la BD: serfuweb
-- Fecha: 2026-03-05
-- ================================================================

ALTER TABLE afiliados
  ADD COLUMN IF NOT EXISTS valorRecibido DECIMAL(12,2) NULL
    COMMENT 'Valor efectivamente recibido en la primera cuota'
    AFTER referenciaPago3,

  ADD COLUMN IF NOT EXISTS diferenteAlContratante TINYINT(1) UNSIGNED NOT NULL DEFAULT 0
    COMMENT '1 = el afiliado es diferente al contratante'
    AFTER valorRecibido,

  ADD COLUMN IF NOT EXISTS cedulaFrontal VARCHAR(500) NULL
    COMMENT 'Nombre del archivo foto cédula cara frontal'
    AFTER diferenteAlContratante,

  ADD COLUMN IF NOT EXISTS cedulaReverso VARCHAR(500) NULL
    COMMENT 'Nombre del archivo foto cédula cara reverso'
    AFTER cedulaFrontal;

-- Verificar columnas agregadas
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'serfuweb'
  AND TABLE_NAME   = 'afiliados'
  AND COLUMN_NAME IN ('valorRecibido', 'diferenteAlContratante', 'cedulaFrontal', 'cedulaReverso')
ORDER BY ORDINAL_POSITION;
