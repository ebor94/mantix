-- ============================================================
-- legalizacion_migration.sql
-- Agrega columnas de legalización a `afiliados` y extiende
-- el ENUM de trazabilidad con el tipo LEGALIZACION.
-- ============================================================

-- 1. Columnas de legalización en afiliados
-- Nota: las columnas se agregan al final de la tabla (sin AFTER) porque
-- Sequelize en este proyecto NO usa underscored — los campos existentes
-- mantienen camelCase (estadoRegistro, asesorId, etc.).
ALTER TABLE afiliados
  ADD COLUMN legalizado              TINYINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Flag: 1 = legalizado ante el sistema regional',
  ADD COLUMN numero_planilla          VARCHAR(50) NULL
    COMMENT 'Número de planilla asignado por el asesor al legalizar',
  ADD COLUMN fecha_legalizacion       DATETIME NULL
    COMMENT 'Fecha y hora en que se marcó como legalizado',
  ADD COLUMN legalizacion_asesor_id   INT NULL
    COMMENT 'FK al usuario que ejecutó la legalización (signed: coincide con usuarios.id)',
  ADD CONSTRAINT fk_afiliados_legalizacion_asesor
    FOREIGN KEY (legalizacion_asesor_id) REFERENCES usuarios(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD INDEX idx_afiliados_legalizado (legalizado),
  ADD INDEX idx_afiliados_planilla   (numero_planilla);

-- 2. Extender ENUM tipo en trazabilidad
ALTER TABLE trazabilidad
  MODIFY COLUMN tipo ENUM(
    'CONSULTA',
    'ACTUALIZACION_BENEFICIARIOS',
    'ACTUALIZACION_DATOS',
    'RECHAZO_PARCIAL',
    'APROBACION',
    'RECHAZO_TOTAL',
    'APROBACION_RECIBO',
    'COBRO_POSFECHADO',
    'LEGALIZACION'
  ) NOT NULL;
