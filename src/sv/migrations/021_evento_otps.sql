-- =====================================================================
-- SerVentas CRM — Migración 021: OTP para edición de eventos (SP-3)
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS sv_org_evento_otps (
  otp_id           INT AUTO_INCREMENT PRIMARY KEY,
  otp_evento_id    INT NOT NULL,
  otp_usr_id       INT NOT NULL COMMENT 'quien pidió el token',
  otp_hash         CHAR(64) NOT NULL COMMENT 'sha256(token)',
  otp_expires_at   DATETIME NOT NULL,
  otp_consumed_at  DATETIME NULL,
  otp_intentos     TINYINT NOT NULL DEFAULT 0,
  otp_payload_json JSON NULL COMMENT 'snapshot del cambio propuesto',
  otp_created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_evento (otp_evento_id, otp_consumed_at),
  INDEX idx_otp_expires (otp_expires_at),
  CONSTRAINT fk_otp_evento FOREIGN KEY (otp_evento_id)
    REFERENCES sv_org_eventos_agenda(evento_id) ON DELETE CASCADE,
  CONSTRAINT fk_otp_usr FOREIGN KEY (otp_usr_id)
    REFERENCES sv_org_usuarios(usr_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
