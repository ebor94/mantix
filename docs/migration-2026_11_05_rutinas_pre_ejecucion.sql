-- =============================================================
-- Migración: Rutinas (pre-ejecución de mantenimientos vía QR)
-- =============================================================

-- 1. Token público único en mantenimientos programados (para la URL del QR)
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mantenimientos_programados'
    AND COLUMN_NAME = 'token_qr'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE mantenimientos_programados ADD COLUMN token_qr VARCHAR(64) NULL UNIQUE AFTER codigo',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Tabla de pre-ejecuciones (lo que carga el técnico escaneando el QR)
CREATE TABLE IF NOT EXISTS mantenimiento_pre_ejecucion (
  id INT PRIMARY KEY AUTO_INCREMENT,
  mantenimiento_programado_id INT NOT NULL,
  token_usado VARCHAR(64) NOT NULL,
  fecha_ejecucion DATE NOT NULL,
  hora_inicio TIME NULL,
  hora_fin TIME NULL,
  nombre_recibe VARCHAR(150) NOT NULL,
  cedula_recibe VARCHAR(30) NULL,
  trabajo_realizado TEXT NOT NULL,
  observaciones TEXT NULL,
  firma_tecnico VARCHAR(200) NULL,
  estado ENUM('pendiente', 'aprobada', 'rechazada') NOT NULL DEFAULT 'pendiente',
  motivo_rechazo TEXT NULL,
  ip_origen VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  aprobada_por_usuario_id INT NULL,
  aprobada_en DATETIME NULL,
  mantenimiento_ejecutado_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_preejec_programado FOREIGN KEY (mantenimiento_programado_id)
    REFERENCES mantenimientos_programados(id) ON DELETE CASCADE,
  CONSTRAINT fk_preejec_aprobador FOREIGN KEY (aprobada_por_usuario_id)
    REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_preejec_ejecutado FOREIGN KEY (mantenimiento_ejecutado_id)
    REFERENCES mantenimientos_ejecutados(id) ON DELETE SET NULL,
  INDEX idx_preejec_programado (mantenimiento_programado_id),
  INDEX idx_preejec_estado (estado),
  INDEX idx_preejec_fecha (fecha_ejecucion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
