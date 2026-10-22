-- ================================================================
-- TRIKIPELUDOS — 006 Borradores del jurado (v2.1, HU-8b)
-- Puntajes tentativos privados de cada jurado. NO cuentan en el ranking ni en el tablero
-- (solo trk_calificaciones). Se conservan tras el envío final (trazabilidad). No se auditan.
-- ================================================================

CREATE TABLE trk_borradores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  participante_id CHAR(36) NOT NULL,
  jurado_id INT NOT NULL,
  criterio_id INT NOT NULL,
  puntaje TINYINT UNSIGNED NULL COMMENT 'NULL = casilla vacía; 0 <= puntaje <= trk_criterios.puntaje_max (servicio)',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_trk_borradores_part_jur_crit UNIQUE (participante_id, jurado_id, criterio_id),
  INDEX idx_trk_borradores_jurado (jurado_id),
  CONSTRAINT fk_trk_borradores_participantes FOREIGN KEY (participante_id) REFERENCES trk_participantes (id) ON DELETE CASCADE,
  CONSTRAINT fk_trk_borradores_usuarios FOREIGN KEY (jurado_id) REFERENCES usuarios (id),
  CONSTRAINT fk_trk_borradores_criterios FOREIGN KEY (criterio_id) REFERENCES trk_criterios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
