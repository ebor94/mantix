-- Agrega campo de motivo de inactivación a predios
ALTER TABLE cym_predios
  ADD COLUMN motivo_inactivacion VARCHAR(500) NULL AFTER activo_mant;

-- Agrega estado 'cancelado' y motivo de cancelación a contratos
ALTER TABLE cym_contratos
  MODIFY COLUMN estado ENUM('activo','vencido','cerrado','cancelado') DEFAULT 'activo',
  ADD COLUMN motivo_cancelacion VARCHAR(500) NULL AFTER estado;
