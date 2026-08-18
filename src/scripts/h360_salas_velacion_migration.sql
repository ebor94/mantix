-- ─────────────────────────────────────────────────────────────────────────────
-- Migración H360: Módulo de Gestión de Salas de Velación
--
-- 1. Crea tabla `salas_velacion` (asociada a sedes)
-- 2. Crea tabla `homenajes_sala` (cabecera + ingreso + salida como JSON)
-- 3. Crea tabla `homenaje_sala_visitas` (visitas normalizadas, consulta por fecha)
-- 4. Inserta las 17 salas iniciales aportadas por el usuario
--
-- Tablas nuevas — no afecta datos existentes.
-- Requiere tabla `sedes` (ya existente con 10 registros).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS salas_velacion (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  sede_id        INT NOT NULL,
  codigo         VARCHAR(20) NOT NULL,
  nombre         VARCHAR(100) NOT NULL,
  capacidad      INT NULL,
  activo         TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_codigo (codigo),
  FOREIGN KEY (sede_id) REFERENCES sedes(id),
  INDEX idx_sede (sede_id),
  INDEX idx_activo (activo)
);

CREATE TABLE IF NOT EXISTS homenajes_sala (
  id                      INT PRIMARY KEY AUTO_INCREMENT,
  asistencia_id           INT UNSIGNED NOT NULL,   -- asistencias.id es UNSIGNED
  sala_id                 INT NOT NULL,
  estado                  ENUM('ABIERTO','SALIDA_REGISTRADA','FINALIZADO') NOT NULL DEFAULT 'ABIERTO',
  ingreso_data            JSON NULL,
  salida_data             JSON NULL,
  observaciones_generales TEXT NULL,
  created_by              VARCHAR(50) NULL,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (asistencia_id) REFERENCES asistencias(id),
  FOREIGN KEY (sala_id) REFERENCES salas_velacion(id),
  INDEX idx_asistencia (asistencia_id),
  INDEX idx_sala_estado (sala_id, estado),
  INDEX idx_estado (estado)
);

CREATE TABLE IF NOT EXISTS homenaje_sala_visitas (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  homenaje_sala_id  INT NOT NULL,
  numero_visita     INT NOT NULL,
  fecha_visita      DATE NOT NULL,
  hora_visita       TIME NULL,
  vo_bo             VARCHAR(100) NULL,
  validacion_data   JSON NULL,
  servicios_data    JSON NULL,
  observaciones     TEXT NULL,
  firma_familiar    LONGTEXT NULL,
  created_by        VARCHAR(50) NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (homenaje_sala_id) REFERENCES homenajes_sala(id) ON DELETE CASCADE,
  INDEX idx_homenaje (homenaje_sala_id),
  INDEX idx_fecha (fecha_visita)
);

-- ── Seed inicial de 17 salas (usa JOIN con sedes.codigo — no depende de IDs) ─
INSERT IGNORE INTO salas_velacion (sede_id, codigo, nombre) VALUES
  ((SELECT id FROM sedes WHERE codigo='GC'),  'SALGC01',  'SALA OLIVOS'),
  ((SELECT id FROM sedes WHERE codigo='GC'),  'SALGC03',  'SALA SINAI'),
  ((SELECT id FROM sedes WHERE codigo='GC'),  'SALGC04',  'SALA JERICO'),
  ((SELECT id FROM sedes WHERE codigo='GC'),  'SALGC05',  'SALA BETANIA'),
  ((SELECT id FROM sedes WHERE codigo='GC'),  'SALGC06',  'SALA EDEN'),
  ((SELECT id FROM sedes WHERE codigo='PAM'), 'SALPAM01', 'SALA PIEDAD'),
  ((SELECT id FROM sedes WHERE codigo='PAM'), 'SALPAM02', 'SALA NIEVES'),
  ((SELECT id FROM sedes WHERE codigo='PAM'), 'SALPAM03', 'SALA OLIVOS PAM'),
  ((SELECT id FROM sedes WHERE codigo='SAR'), 'SALSAR01', 'SALA OLIVOS SAR'),
  ((SELECT id FROM sedes WHERE codigo='SAR'), 'SALSAR02', 'SALA CRISTO REY'),
  ((SELECT id FROM sedes WHERE codigo='SJ'),  'SALSJ01',  'SALA SAN JOSE'),
  ((SELECT id FROM sedes WHERE codigo='SJ'),  'SALASJ04', 'SALA DIVINO NIÑO'),
  ((SELECT id FROM sedes WHERE codigo='SJ'),  'SALSJ02',  'SALA SANTISIMA TRINIDAD'),
  ((SELECT id FROM sedes WHERE codigo='SJ'),  'SALSJ03',  'SALA SAN MARTIN'),
  ((SELECT id FROM sedes WHERE codigo='TAM'), 'SALTAM01', 'SALA DIVINO NIÑO TAM'),
  ((SELECT id FROM sedes WHERE codigo='TAM'), 'SALTAM02', 'SALA SANTISIMA TRINIDAD TAM'),
  ((SELECT id FROM sedes WHERE codigo='ARA'), 'SALARC01', 'SALA OLIVOS ARC');

-- Verificación
SELECT s.codigo AS sede_codigo, s.nombre AS sede, sv.codigo, sv.nombre
FROM salas_velacion sv
JOIN sedes s ON s.id = sv.sede_id
ORDER BY s.codigo, sv.codigo;
