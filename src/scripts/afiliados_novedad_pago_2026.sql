-- ================================================================
-- Migración: Nueva novedad TRASLADO_COMPETENCIA, forma de pago
--            POSFECHADO y campos fechaPagoTentativa / contratoCompetencia
-- Ejecutar en la BD: serfuweb
-- Fecha: 2026-04-07
-- ================================================================

ALTER TABLE afiliados
  MODIFY COLUMN novedad ENUM(
    'NUEVO', 'CAMBIO', 'TRASLADO', 'ACTUALIZACION', 'TRASLADO_COMPETENCIA'
  ) NULL,

  MODIFY COLUMN formaPago ENUM(
    'EFECTIVO', 'TRANSFERENCIA', 'CORRESPONSAL', 'POSFECHADO'
  ) NULL,

  ADD COLUMN IF NOT EXISTS fechaPagoTentativa DATE NULL
    COMMENT 'Fecha tentativa de pago (forma POSFECHADO)'
    AFTER valorRecibido,

  ADD COLUMN IF NOT EXISTS contratoCompetencia VARCHAR(500) NULL
    COMMENT 'Archivo contrato de la competencia (novedad TRASLADO_COMPETENCIA)'
    AFTER fechaPagoTentativa;

-- Verificar
SELECT COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'afiliados'
  AND COLUMN_NAME IN ('novedad','formaPago','fechaPagoTentativa','contratoCompetencia');
