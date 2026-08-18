-- ─────────────────────────────────────────────────────────────────────────────
-- Migración H360: tabla de auditoría de homenajes en sala
--
-- Registra snapshots del estado anterior cada vez que un admin desbloquea
-- y modifica un ingreso/salida/visita ya firmada. Permite reconstruir
-- cualquier versión histórica y auditar responsabilidades.
--
-- Regla de negocio: firma_familiar no vacía = bloqueado. Solo admin puede
-- editar posteriormente, con motivo obligatorio.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS homenaje_sala_auditoria (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  homenaje_sala_id  INT NOT NULL,
  visita_id         INT NULL,
  seccion           ENUM('INGRESO','SALIDA','VISITA') NOT NULL,
  accion            ENUM('CREATE','UPDATE','UNLOCK') NOT NULL,
  snapshot_anterior JSON NULL,
  motivo            TEXT NULL,
  usuario_id        VARCHAR(50) NOT NULL,
  nombre_usuario    VARCHAR(100) NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (homenaje_sala_id) REFERENCES homenajes_sala(id) ON DELETE CASCADE,
  INDEX idx_homenaje (homenaje_sala_id),
  INDEX idx_created (created_at)
);
