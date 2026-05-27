-- Agrega segundo operario a la tabla de asignaciones
ALTER TABLE cym_asignaciones
  ADD COLUMN operario2_id INT NULL AFTER operario_id,
  ADD CONSTRAINT fk_asig_operario2 FOREIGN KEY (operario2_id) REFERENCES usuarios(id);

-- Agrega segundo operario y quién ejecutó al registro de mantenimiento
ALTER TABLE cym_mantenimientos
  ADD COLUMN operario2_id INT NULL AFTER operario_id,
  ADD COLUMN ejecutado_por ENUM('pareja','operario1','operario2') NULL AFTER operario2_id,
  ADD CONSTRAINT fk_mant_operario2 FOREIGN KEY (operario2_id) REFERENCES usuarios(id);
