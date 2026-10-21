-- Requiere MySQL 8.0.16+.
-- Vista de análisis para Superset (spec §7).
-- Se crea en la base existente `serfuweb`; sin CREATE DATABASE ni USE:
--   mysql --default-character-set=utf8mb4 -u <usuario> -p serfuweb < src/bigday/migrations/002_vista_superset.sql
-- Idempotente (CREATE OR REPLACE).
-- Más simple: `npm run bigday:migrate` aplica 001 y 002 en orden usando BIGDAY_DB_* o, si faltan, las DB_* de Mantix
-- (el usuario necesita CREATE y CREATE VIEW sobre serfuweb).
-- Privacidad: NO expone ip_hash ni ua_hash.
-- NPS en escala 1–10: promotor 9–10, pasivo 7–8, detractor 1–6.

CREATE OR REPLACE VIEW vw_bigday_resumen AS
SELECT
  id,
  uuid,
  evento_id,
  p1,
  p2,
  p3,
  p3_otro,
  p4,
  p4_otro,
  p5,
  p6,
  p7,
  origen,
  duracion_seg,
  created_at,
  CASE
    WHEN p6 >= 9 THEN 'promotor'
    WHEN p6 >= 7 THEN 'pasivo'
    ELSE 'detractor'
  END AS nps_grupo,
  CONCAT(p2, '→', p3) AS cambio_percepcion
FROM bigday_respuestas;
