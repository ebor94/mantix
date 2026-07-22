-- ─────────────────────────────────────────────────────────────────────────────
-- Migración H360: nueva etapa F-07 "Salida no conforme"
-- Agrega F07_SALIDA_NO_CONFORME al ENUM de asistencia_etapas.etapa.
-- Aditivo: no altera datos existentes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_etapas MODIFY COLUMN etapa
  ENUM('F02_INVENTARIO_CUERPO','F03_INVENTARIO_RETOQUE','F04_TANATOPRAXIA',
       'F05_ENTREGA','F06_ENCOFRADO','F07_SALIDA_NO_CONFORME')
  NOT NULL;

-- Verificación
SELECT COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='asistencia_etapas' AND COLUMN_NAME='etapa';
