-- =====================================================================
-- SerVentas CRM — Migración 019: Ausencias declaradas del popup obligatorio
--
-- Cuando un usuario operativo declara "no laboro hoy" desde el modal
-- bloqueante, se registra un row aquí. Sirve para que el popup no vuelva
-- a molestarlo en el resto del día.
-- =====================================================================

SET NAMES utf8mb4;
SET @OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS sv_org_jornadas_ausencias (
  aus_id         INT AUTO_INCREMENT PRIMARY KEY,
  aus_usr_id     INT           NOT NULL,
  aus_fecha      DATE          NOT NULL,
  aus_tipo       VARCHAR(30)   NOT NULL,   -- PERMISO | INCAPACIDAD | DIA_LIBRE | OTRO
  aus_motivo     TEXT          NOT NULL,
  aus_created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_aus_usr_fecha (aus_usr_id, aus_fecha),
  INDEX idx_aus_fecha (aus_fecha),
  CONSTRAINT fk_aus_usr FOREIGN KEY (aus_usr_id)
    REFERENCES sv_org_usuarios(usr_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'SerVentas: ausencias declaradas por el popup obligatorio de jornada';

SET FOREIGN_KEY_CHECKS = @OLD_FK_CHECKS;

-- Verificación
SELECT COUNT(*) AS registros_iniciales FROM sv_org_jornadas_ausencias;
