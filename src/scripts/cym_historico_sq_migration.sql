-- Trazabilidad de cambios de seres queridos en predios CYM
-- Se registra automáticamente cada vez que cambia cédula o nombre de un ser querido
CREATE TABLE cym_historico_sq (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  predio_id       INT          NOT NULL,
  posicion        TINYINT      NOT NULL COMMENT '1=primer ser querido, 2=segundo, 3=tercero',
  -- Valores anteriores
  cedula_ant      VARCHAR(20),
  nombre_ant      VARCHAR(200),
  fecha_nac_ant   DATE,
  fecha_fall_ant  DATE,
  fecha_inhum_ant DATE,
  -- Valores nuevos
  cedula_nue      VARCHAR(20),
  nombre_nue      VARCHAR(200),
  fecha_nac_nue   DATE,
  fecha_fall_nue  DATE,
  fecha_inhum_nue DATE,
  -- Contexto del cambio
  motivo          VARCHAR(500),
  usuario_id      INT NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (predio_id)  REFERENCES cym_predios(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) COMMENT='Historial de cambios de seres queridos por predio';
