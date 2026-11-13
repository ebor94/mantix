CREATE TABLE IF NOT EXISTS duelo_inscripciones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre_completo VARCHAR(120) NOT NULL,
  cedula VARCHAR(10) NOT NULL,
  celular VARCHAR(10) NOT NULL,
  correo VARCHAR(150) NOT NULL,
  honra_companero TINYINT(1) NOT NULL,
  acepta_politica TINYINT(1) NOT NULL,
  version_politica VARCHAR(30) NOT NULL,
  fecha_aceptacion DATETIME NOT NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,
  utm_source VARCHAR(255) NULL,
  utm_medium VARCHAR(255) NULL,
  utm_campaign VARCHAR(255) NULL,
  utm_content VARCHAR(255) NULL,
  fbclid VARCHAR(255) NULL,
  correo_enviado TINYINT(1) NOT NULL DEFAULT 0,
  correo_error VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_duelo_inscripciones_cedula (cedula)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS duelo_companeros (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  inscripcion_id INT UNSIGNED NOT NULL,
  orden TINYINT UNSIGNED NOT NULL,
  nombre VARCHAR(60) NOT NULL,
  foto_ruta VARCHAR(60) NOT NULL,
  foto_mime VARCHAR(30) NOT NULL,
  foto_bytes INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_duelo_companeros_orden (inscripcion_id, orden),
  CONSTRAINT fk_duelo_companeros_inscripcion FOREIGN KEY (inscripcion_id)
    REFERENCES duelo_inscripciones (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
