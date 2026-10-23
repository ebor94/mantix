-- ================================================================
-- TRIKIPELUDOS — 007 Rúbrica v2 (criterios confirmados por la organización)
-- Ambas rúbricas (INDIVIDUAL y FAMILIAR) quedan con los mismos 3 criterios, total 100:
--   CREATIVIDAD 50 (desempate 1), BIENESTAR 30 (desempate 2), PASARELA 20 (no desempata).
-- Las calificaciones y borradores hechos con la rúbrica anterior se BORRAN (aprobado: el
-- evento no ha comenzado). También se descartan rankings publicados, snapshots, desempates
-- manuales y la pantalla en modo RANKING, porque se calcularon con los criterios anteriores.
-- No modifica 003 (las migraciones corren una sola vez, trk_migraciones). Reaplicable.
-- ================================================================

-- 1. Datos calificados con la rúbrica anterior.
DELETE FROM trk_borradores;
DELETE FROM trk_calificaciones; -- trk_calificacion_detalle cae en cascada
DELETE FROM trk_ranking_snapshots;
UPDATE trk_categorias SET ranking_publicado = 0;
UPDATE trk_participantes SET desempate_manual = NULL WHERE desempate_manual IS NOT NULL;
UPDATE trk_evento_estado SET modo_pantalla = 'PASARELA', categoria_pantalla_id = NULL WHERE modo_pantalla = 'RANKING';

-- 2. Criterios que desaparecen.
DELETE FROM trk_criterios WHERE codigo IN ('ELABORACION', 'INTEGRACION');

-- 3. SEGURIDAD pasa a llamarse BIENESTAR (conserva el id). Si ya existiera BIENESTAR en la
--    rúbrica, SEGURIDAD sobra y se elimina.
UPDATE trk_criterios s
LEFT JOIN trk_criterios b ON b.rubrica_id = s.rubrica_id AND b.codigo = 'BIENESTAR'
SET s.codigo = 'BIENESTAR'
WHERE s.codigo = 'SEGURIDAD' AND b.id IS NULL;
DELETE FROM trk_criterios WHERE codigo = 'SEGURIDAD';

-- 4. Upsert de los 3 criterios en ambas rúbricas (uq_trk_criterios_rubrica_codigo).
INSERT INTO trk_criterios (rubrica_id, codigo, nombre, descripcion, puntaje_max, orden, peso_desempate)
SELECT r.id, v.codigo, v.nombre, v.descripcion, v.puntaje_max, v.orden, v.peso
FROM trk_rubricas r
JOIN (
            SELECT 'CREATIVIDAD' AS codigo, 'Creatividad' AS nombre, 'Creatividad, elaboración y originalidad del disfraz' AS descripcion, 50 AS puntaje_max, 1 AS orden, 1 AS peso
  UNION ALL SELECT 'BIENESTAR', 'Bienestar', 'Seguridad, comodidad y bienestar de la mascota; un disfraz que le permita movilidad', 30, 2, 2
  UNION ALL SELECT 'PASARELA',  'Pasarela',  'Participación, vínculo con el público y desarrollo de la pasarela de la mascota y su tutor o la familia', 20, 3, NULL
) v
WHERE r.codigo IN ('INDIVIDUAL', 'FAMILIAR')
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre), descripcion = VALUES(descripcion), puntaje_max = VALUES(puntaje_max),
  orden = VALUES(orden), peso_desempate = VALUES(peso_desempate);
