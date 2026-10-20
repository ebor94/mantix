-- ================================================================
-- TRIKIPELUDOS — 001 Esquema base (BD serfuweb, prefijo trk_)
-- Convención §8.0: idx_trk_ / uq_trk_ / fk_trk_<tabla>_<referida>
-- ================================================================

CREATE TABLE trk_rubricas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  CONSTRAINT uq_trk_rubricas_codigo UNIQUE (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trk_criterios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rubrica_id INT NOT NULL,
  codigo VARCHAR(30) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  puntaje_max TINYINT UNSIGNED NOT NULL,
  orden TINYINT UNSIGNED NOT NULL,
  peso_desempate TINYINT UNSIGNED NULL COMMENT '1 = primer criterio de desempate; NULL = no desempata',
  CONSTRAINT uq_trk_criterios_rubrica_codigo UNIQUE (rubrica_id, codigo),
  CONSTRAINT fk_trk_criterios_rubricas FOREIGN KEY (rubrica_id) REFERENCES trk_rubricas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trk_categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(20) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  rubrica_id INT NOT NULL,
  abierta TINYINT(1) NOT NULL DEFAULT 1,
  ranking_publicado TINYINT(1) NOT NULL DEFAULT 0,
  orden TINYINT UNSIGNED NOT NULL,
  puestos_premiados TINYINT UNSIGNED NOT NULL DEFAULT 3,
  CONSTRAINT uq_trk_categorias_codigo UNIQUE (codigo),
  CONSTRAINT fk_trk_categorias_rubricas FOREIGN KEY (rubrica_id) REFERENCES trk_rubricas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trk_participantes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  categoria_id INT NOT NULL,
  categoria_propuesta_id INT NULL,
  responsable_nombre VARCHAR(150) NOT NULL,
  responsable_documento VARCHAR(20) NULL,
  responsable_telefono VARCHAR(20) NULL,
  responsable_correo VARCHAR(150) NULL,
  mascota_nombre VARCHAR(100) NOT NULL,
  mascota_nombre_norm VARCHAR(100) NOT NULL,
  especie ENUM('PERRO','GATO') NULL,
  raza VARCHAR(100) NULL,
  edad_texto VARCHAR(50) NULL,
  sexo ENUM('MACHO','HEMBRA') NULL,
  disfraz_nombre VARCHAR(150) NULL,
  foto_inscripcion_url VARCHAR(500) NULL,
  foto_oficial_path VARCHAR(255) NULL,
  foto_oficial_at DATETIME NULL,
  estado ENUM('INSCRITO','PRESENTE','EN_PASARELA','PRESENTADO','AUSENTE') NOT NULL DEFAULT 'INSCRITO',
  orden_pasarela INT NULL,
  llegada_at DATETIME NULL,
  desempate_manual INT NULL,
  autoriza_datos TINYINT(1) NOT NULL DEFAULT 0,
  autoriza_reglamento TINYINT(1) NOT NULL DEFAULT 0,
  fecha_inscripcion DATE NULL,
  notas_importacion TEXT NULL,
  advertencias_importacion JSON NULL,
  fusionado_en_id CHAR(36) NULL,
  origen ENUM('IMPORTACION','CABINA') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_trk_participantes_doc_mascota UNIQUE (responsable_documento, mascota_nombre_norm),
  INDEX idx_trk_participantes_estado (estado),
  INDEX idx_trk_participantes_categoria_estado (categoria_id, estado),
  CONSTRAINT fk_trk_participantes_categorias FOREIGN KEY (categoria_id) REFERENCES trk_categorias (id),
  CONSTRAINT fk_trk_participantes_categorias_propuesta FOREIGN KEY (categoria_propuesta_id) REFERENCES trk_categorias (id),
  CONSTRAINT fk_trk_participantes_participantes FOREIGN KEY (fusionado_en_id) REFERENCES trk_participantes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PIN y versión de token de usuarios operativos (extensión 1:1 de usuarios de Mantix)
CREATE TABLE trk_accesos (
  usuario_id INT NOT NULL PRIMARY KEY,
  pin_hash VARCHAR(100) NOT NULL,
  token_version INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_trk_accesos_usuarios FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trk_calificaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  participante_id CHAR(36) NOT NULL,
  jurado_id INT NOT NULL,
  total TINYINT UNSIGNED NOT NULL,
  enviada_at DATETIME NOT NULL,
  bloqueada TINYINT(1) NOT NULL DEFAULT 1,
  desbloqueada_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_trk_calificaciones_part_jur UNIQUE (participante_id, jurado_id),
  INDEX idx_trk_calificaciones_jurado (jurado_id),
  CONSTRAINT fk_trk_calificaciones_participantes FOREIGN KEY (participante_id) REFERENCES trk_participantes (id) ON DELETE CASCADE,
  CONSTRAINT fk_trk_calificaciones_usuarios FOREIGN KEY (jurado_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trk_calificacion_detalle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  calificacion_id INT NOT NULL,
  criterio_id INT NOT NULL,
  puntaje TINYINT UNSIGNED NOT NULL,
  CONSTRAINT uq_trk_calificacion_detalle_cal_crit UNIQUE (calificacion_id, criterio_id),
  CONSTRAINT fk_trk_calificacion_detalle_calificaciones FOREIGN KEY (calificacion_id) REFERENCES trk_calificaciones (id) ON DELETE CASCADE,
  CONSTRAINT fk_trk_calificacion_detalle_criterios FOREIGN KEY (criterio_id) REFERENCES trk_criterios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trk_auditoria (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  api_codigo VARCHAR(20) NOT NULL,
  entidad VARCHAR(50) NOT NULL,
  entidad_id VARCHAR(36) NULL,
  accion VARCHAR(50) NOT NULL,
  antes JSON NULL,
  despues JSON NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trk_auditoria_entidad (entidad, entidad_id),
  INDEX idx_trk_auditoria_api_codigo (api_codigo),
  CONSTRAINT fk_trk_auditoria_usuarios FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trk_evento_estado (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  participante_en_pasarela_id CHAR(36) NULL,
  modo_pantalla ENUM('PASARELA','RANKING') NOT NULL DEFAULT 'PASARELA',
  categoria_pantalla_id INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_trk_evento_estado_participantes FOREIGN KEY (participante_en_pasarela_id) REFERENCES trk_participantes (id) ON DELETE SET NULL,
  CONSTRAINT fk_trk_evento_estado_categorias FOREIGN KEY (categoria_pantalla_id) REFERENCES trk_categorias (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trk_ranking_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  categoria_id INT NOT NULL,
  publicado_por INT NULL,
  publicado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  datos JSON NOT NULL,
  INDEX idx_trk_ranking_snapshots_categoria_fecha (categoria_id, publicado_at),
  CONSTRAINT fk_trk_ranking_snapshots_categorias FOREIGN KEY (categoria_id) REFERENCES trk_categorias (id),
  CONSTRAINT fk_trk_ranking_snapshots_usuarios FOREIGN KEY (publicado_por) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE trk_importaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  archivo_nombre VARCHAR(255) NOT NULL,
  archivo_sha256 CHAR(64) NOT NULL,
  filas_total INT NOT NULL,
  filas_ok INT NOT NULL,
  filas_advertencia INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trk_importaciones_usuarios FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
