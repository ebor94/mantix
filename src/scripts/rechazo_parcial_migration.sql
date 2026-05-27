-- ============================================================
-- rechazo_parcial_migration.sql
-- Agrega: activo/motivoRechazo en beneficiarios, origen en afiliados,
--         tabla trazabilidad para auditoría
-- ============================================================

-- 1. Campos en beneficiarios para rechazo parcial
ALTER TABLE beneficiarios
  ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '0 = inactivado por aprobador; 1 = activo'
    AFTER estado,
  ADD COLUMN motivoRechazo TEXT NULL
    COMMENT 'Motivo de inactivación dado por el aprobador'
    AFTER activo,
  ADD INDEX idx_beneficiario_activo (activo);

-- 2. Campo origen en afiliados (distingue Veolia de registros de asesor)
ALTER TABLE afiliados
  ADD COLUMN origen ENUM('ASESOR','VEOLIA') NOT NULL DEFAULT 'ASESOR'
    COMMENT 'VEOLIA = registro público; ASESOR = registrado por asesor'
    AFTER asesorId,
  ADD INDEX idx_afiliados_origen (origen);

-- Backfill: registros sin asesor = Veolia
UPDATE afiliados SET origen = 'VEOLIA' WHERE asesorId IS NULL;
UPDATE afiliados SET origen = 'ASESOR'  WHERE asesorId IS NOT NULL;

-- 3. Tabla de trazabilidad
CREATE TABLE trazabilidad (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  afiliadoId  INT UNSIGNED NOT NULL,
  tipo        ENUM(
                'CONSULTA',
                'ACTUALIZACION_BENEFICIARIOS',
                'ACTUALIZACION_DATOS',
                'RECHAZO_PARCIAL',
                'APROBACION',
                'RECHAZO_TOTAL'
              ) NOT NULL,
  descripcion TEXT NULL,
  usuarioId   INT UNSIGNED NULL COMMENT 'NULL = acción pública',
  createdAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (afiliadoId) REFERENCES afiliados(id) ON DELETE CASCADE,
  FOREIGN KEY (usuarioId)  REFERENCES usuarios(id)  ON DELETE SET NULL,
  INDEX idx_traza_afiliado (afiliadoId),
  INDEX idx_traza_tipo     (tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
