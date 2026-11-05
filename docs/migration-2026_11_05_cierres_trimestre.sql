-- =============================================================
-- Migración: tabla `cierres_trimestre`
-- Guarda el análisis oficial de cada trimestre (uno por año+trimestre)
-- con la firma del último usuario que lo editó.
-- =============================================================

CREATE TABLE IF NOT EXISTS cierres_trimestre (
  id INT PRIMARY KEY AUTO_INCREMENT,
  anio INT NOT NULL,
  trimestre TINYINT NOT NULL,
  analisis TEXT NOT NULL,
  cumplimiento_registrado DECIMAL(5,2) DEFAULT NULL,
  usuario_id INT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cierre_anio_trimestre (anio, trimestre),
  CONSTRAINT fk_cierre_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_trimestre_rango CHECK (trimestre BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
