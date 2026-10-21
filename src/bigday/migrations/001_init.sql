-- Requiere MySQL 8.0.16+ (CHECK constraints aplicadas).
-- Encuesta October Big Day — esquema de respuestas (spec §7).
-- La tabla vive dentro de la base existente `serfuweb` (decisión de Edwin).
-- No crea base de datos ni usa USE; aplicar contra serfuweb, p. ej.:
--   mysql --default-character-set=utf8mb4 -u <usuario> -p serfuweb < src/bigday/migrations/001_init.sql
-- Idempotente: se puede ejecutar varias veces.

CREATE TABLE IF NOT EXISTS bigday_respuestas (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          CHAR(36)     NOT NULL UNIQUE,      -- generado en el cliente (idempotencia)
  evento_id     VARCHAR(40)  NOT NULL DEFAULT 'october-bigday-2',
  p1            ENUM('A','B','C','D') NOT NULL,
  p2            VARCHAR(20)  NOT NULL,
  p3            VARCHAR(20)  NOT NULL,
  p3_otro       VARCHAR(120) NULL,
  p4            VARCHAR(20)  NOT NULL,
  p4_otro       VARCHAR(120) NULL,
  p5            ENUM('A','B','C','D') NOT NULL,
  p6            TINYINT UNSIGNED NOT NULL CHECK (p6 BETWEEN 1 AND 10),
  p7            VARCHAR(280) NOT NULL,
  origen        VARCHAR(40)  NULL,                 -- ?src=qr-entrada, whatsapp, instagram…
  duracion_seg  INT UNSIGNED NULL,
  ip_hash       CHAR(64)     NULL,                 -- SHA-256(ip + sal), nunca la IP
  ua_hash       CHAR(64)     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_evento_fecha (evento_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
