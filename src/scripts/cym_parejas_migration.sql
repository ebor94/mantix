-- Catálogo de parejas de operarios
CREATE TABLE cym_parejas (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(100) NOT NULL,
  activo     TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='Parejas de operarios de mantenimiento';

-- Miembros de cada pareja con historial de cambios
-- posicion: 1=operario principal, 2=segundo operario
-- activo=1 → miembro vigente; activo=0 → reemplazado (trazabilidad)
CREATE TABLE cym_pareja_miembros (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  pareja_id   INT     NOT NULL,
  posicion    TINYINT NOT NULL COMMENT '1=operario 1, 2=operario 2',
  operario_id INT     NOT NULL,
  activo      TINYINT(1) DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pareja_id)   REFERENCES cym_parejas(id),
  FOREIGN KEY (operario_id) REFERENCES usuarios(id)
) COMMENT='Miembros actuales e historicos de cada pareja';

-- Agregar referencia de pareja a asignaciones
ALTER TABLE cym_asignaciones
  ADD COLUMN pareja_id INT NULL AFTER supervisor_id,
  ADD CONSTRAINT fk_asig_pareja FOREIGN KEY (pareja_id) REFERENCES cym_parejas(id);
