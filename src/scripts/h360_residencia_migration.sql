-- ─────────────────────────────────────────────────────────────────────────────
-- Migración H360: Módulo Homenajes en Residencia (formato R-29 v6)
--
-- Análogo al módulo de salas (R-22) pero para homenajes que se hacen en la
-- residencia del familiar. Las asistencias son excluyentes: un caso tiene
-- homenaje en sala O en residencia, no ambos. La validación se aplica en el
-- backend al crear (POST /homenajes-sala y POST /homenajes-residencia).
--
-- Estructura del formato:
--  1. Primera llamada (9 temas, cada uno Conforme/Con novedad)
--  2. Segunda llamada (7 temas)
--  3. Equipo de velación en residencia (lugar novenario + confirmación)
--  4. Novedades — una fila por incidente con firmas cliente/asistente
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS homenajes_residencia (
  id                      INT PRIMARY KEY AUTO_INCREMENT,
  asistencia_id           INT UNSIGNED NOT NULL,
  estado                  ENUM('ABIERTO','COMPLETADO') NOT NULL DEFAULT 'ABIERTO',
  primera_llamada_data    JSON NULL,
  segunda_llamada_data    JSON NULL,
  equipo_velacion_data    JSON NULL,
  observaciones_generales TEXT NULL,
  created_by              VARCHAR(50) NULL,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (asistencia_id) REFERENCES asistencias(id),
  INDEX idx_asistencia (asistencia_id),
  INDEX idx_estado (estado)
);

CREATE TABLE IF NOT EXISTS homenaje_residencia_novedades (
  id                     INT PRIMARY KEY AUTO_INCREMENT,
  homenaje_residencia_id INT NOT NULL,
  fecha_reporte          DATE NOT NULL,
  hora_reporte           TIME NULL,
  asistente_homenajes    VARCHAR(100) NULL,
  hora_llegada           TIME NULL,
  hora_retiro            TIME NULL,
  actividad_realizada    TEXT NULL,
  firma_cliente          LONGTEXT NULL,
  firma_asistente        LONGTEXT NULL,
  created_by             VARCHAR(50) NULL,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (homenaje_residencia_id) REFERENCES homenajes_residencia(id) ON DELETE CASCADE,
  INDEX idx_homenaje (homenaje_residencia_id),
  INDEX idx_fecha (fecha_reporte)
);

CREATE TABLE IF NOT EXISTS homenaje_residencia_auditoria (
  id                     INT PRIMARY KEY AUTO_INCREMENT,
  homenaje_residencia_id INT NOT NULL,
  novedad_id             INT NULL,
  seccion                ENUM('PRIMERA_LLAMADA','SEGUNDA_LLAMADA','EQUIPO_VELACION','NOVEDAD') NOT NULL,
  accion                 ENUM('CREATE','UPDATE','UNLOCK') NOT NULL,
  snapshot_anterior      JSON NULL,
  motivo                 TEXT NULL,
  usuario_id             VARCHAR(50) NOT NULL,
  nombre_usuario         VARCHAR(100) NULL,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (homenaje_residencia_id) REFERENCES homenajes_residencia(id) ON DELETE CASCADE,
  INDEX idx_homenaje (homenaje_residencia_id)
);
