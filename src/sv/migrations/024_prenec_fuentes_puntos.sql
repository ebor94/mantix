-- =====================================================================
-- SerVentas CRM — Migración 024: fuentes y puntos de Prenecesidad
--
-- 1) Fuentes de PRENEC: quedan activas solo las ocho de la líder del área.
--    Tres renombran una que ya existe, para no partir el historial:
--    LISTA_TELE → Telemercadeo, ENCUESTA → Encuestas, TITULO → Títulos.
--    Las demás se desactivan, no se borran: los prospectos apuntan a ellas.
--    SALA_VELACION y EVENTO_PUBLICO quedan inactivas a propósito: el sistema
--    las asigna buscándolas por código y no deben elegirse a mano.
-- 2) Puntos de atención (compartidos por todas las áreas): quedan activos
--    solo San José, Gran Colombia, Oficina Parque y Kiosco.
-- Solo datos. Idempotente. Antes de correrla: ver el respaldo y la revisión
-- previa en docs/superpowers/plans/2026-11-24-prenec-fuentes-puntos.md
-- =====================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT INTO sv_cfg_fuentes_prospecto
  (fuente_area_id, fuente_codigo, fuente_nombre, fuente_es_masiva, fuente_activa, fuente_orden)
SELECT a.area_id, f.codigo, f.nombre, f.masiva, 1, f.orden
  FROM sv_cfg_areas_negocio a
  JOIN (
    SELECT 'LISTA_TELE'        AS codigo, 'Telemercadeo'          AS nombre, 1 AS masiva, 1 AS orden
    UNION ALL SELECT 'REFERIDO',          'Referido',              0, 2
    UNION ALL SELECT 'R-95',              'R-95',                  0, 3
    UNION ALL SELECT 'ENCUESTA',          'Encuestas',             0, 4
    UNION ALL SELECT 'TITULO',            'Títulos',               1, 5
    UNION ALL SELECT 'BASE_EXHUMACIONES', 'Base de exhumaciones',  1, 6
    UNION ALL SELECT 'R-116',             'R-116',                 0, 7
    UNION ALL SELECT 'OTROS',             'Otros',                 0, 8
  ) f
 WHERE a.area_codigo = 'PRENEC'
ON DUPLICATE KEY UPDATE
  fuente_nombre    = f.nombre,
  fuente_es_masiva = f.masiva,
  fuente_activa    = 1,
  fuente_orden     = f.orden;

UPDATE sv_cfg_fuentes_prospecto f
  JOIN sv_cfg_areas_negocio a ON a.area_id = f.fuente_area_id
   SET f.fuente_activa = 0
 WHERE a.area_codigo = 'PRENEC'
   AND f.fuente_codigo NOT IN ('LISTA_TELE', 'REFERIDO', 'R-95', 'ENCUESTA', 'TITULO',
                               'BASE_EXHUMACIONES', 'R-116', 'OTROS');

INSERT INTO sv_cfg_puntos_atencion (punto_codigo, punto_nombre, punto_activo)
SELECT p.codigo, p.nombre, 1
  FROM (
    SELECT 'SJ'     AS codigo, 'Punto San José'       AS nombre
    UNION ALL SELECT 'GC',     'Punto Gran Colombia'
    UNION ALL SELECT 'PARQUE', 'Punto Oficina Parque'
    UNION ALL SELECT 'KIOSCO', 'Punto Kiosco'
  ) p
ON DUPLICATE KEY UPDATE
  punto_nombre = p.nombre,
  punto_activo = 1;

UPDATE sv_cfg_puntos_atencion
   SET punto_activo = 0
 WHERE punto_codigo NOT IN ('SJ', 'GC', 'PARQUE', 'KIOSCO');

COMMIT;
