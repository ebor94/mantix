-- ================================================================
-- TRIKIPELUDOS — 008 Categorías v2 (aprobadas por la organización)
--   1 Caninos pequeños (PEQUENOS)  · 2 Caninos medianos (MEDIANOS, nueva)
--   3 Caninos grandes  (GRANDES)   · 4 Felinos (FELINOS) · 5 Disfraz familiar (FAMILIAR)
-- La fila PEQ_MED ('Caninos pequeños y medianos') se RENOMBRA en sitio a PEQUENOS: conserva su id,
-- sus participantes y sus calificaciones. Los medianos se reubican reimportando el CSV (ver despliegue).
-- No modifica 003 (las migraciones corren una sola vez, trk_migraciones). Reaplicable.
-- ================================================================

-- 1. PEQ_MED pasa a ser PEQUENOS (conserva el id). Solo si aún no existe PEQUENOS.
UPDATE trk_categorias v
LEFT JOIN trk_categorias n ON n.codigo = 'PEQUENOS'
SET v.codigo = 'PEQUENOS', v.nombre = 'Caninos pequeños', v.orden = 1
WHERE v.codigo = 'PEQ_MED' AND n.id IS NULL;

-- 2. Si tras el paso 1 sigue existiendo PEQ_MED es porque PEQUENOS ya existía (p. ej. 003 reaplicado a
--    mano). Si nada la usa, sobra.
DELETE c FROM trk_categorias c
WHERE c.codigo = 'PEQ_MED'
  AND NOT EXISTS (SELECT 1 FROM trk_participantes p WHERE p.categoria_id = c.id OR p.categoria_propuesta_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM trk_evento_estado e WHERE e.categoria_pantalla_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM trk_ranking_snapshots s WHERE s.categoria_id = c.id);

-- 3. Upsert de las 5 categorías (uq_trk_categorias_codigo). Las existentes conservan abierta,
--    ranking_publicado y puestos_premiados; MEDIANOS nace abierta, sin publicar y con 3 puestos.
INSERT INTO trk_categorias (codigo, nombre, rubrica_id, orden, abierta, ranking_publicado, puestos_premiados)
SELECT v.codigo, v.nombre, r.id, v.orden, 1, 0, 3
FROM trk_rubricas r
JOIN (
            SELECT 'PEQUENOS' AS codigo, 'Caninos pequeños' AS nombre, 'INDIVIDUAL' AS rub, 1 AS orden
  UNION ALL SELECT 'MEDIANOS', 'Caninos medianos',                            'INDIVIDUAL', 2
  UNION ALL SELECT 'GRANDES',  'Caninos grandes',                             'INDIVIDUAL', 3
  UNION ALL SELECT 'FELINOS',  'Felinos',                                     'INDIVIDUAL', 4
  UNION ALL SELECT 'FAMILIAR', 'Disfraz familiar (mascota + acompañante/s)', 'FAMILIAR',   5
) v ON v.rub = r.codigo
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), rubrica_id = VALUES(rubrica_id), orden = VALUES(orden);
