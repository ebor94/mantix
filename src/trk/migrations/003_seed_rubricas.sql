-- TRIKIPELUDOS — 003 Seed de rúbricas, criterios y categorías (spec §3). Idempotente.
-- Cambiar un puntaje máximo = UPDATE trk_criterios; no requiere desplegar código.
INSERT INTO trk_rubricas (codigo, nombre) VALUES
  ('INDIVIDUAL', 'Rúbrica individual'),
  ('FAMILIAR',   'Rúbrica familiar')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

INSERT INTO trk_criterios (rubrica_id, codigo, nombre, descripcion, puntaje_max, orden, peso_desempate)
SELECT r.id, v.codigo, v.nombre, v.descripcion, v.puntaje_max, v.orden, v.peso
FROM trk_rubricas r
JOIN (
            SELECT 'INDIVIDUAL' AS rub, 'CREATIVIDAD' AS codigo, 'Creatividad' AS nombre, 'Idea novedosa y diferenciada' AS descripcion, 35 AS puntaje_max, 1 AS orden, 1 AS peso
  UNION ALL SELECT 'INDIVIDUAL', 'SEGURIDAD',   'Seguridad',            'Comodidad y libertad de movimiento de la mascota',          30, 2, 2
  UNION ALL SELECT 'INDIVIDUAL', 'ELABORACION', 'Elaboración',          'Calidad, detalle y presentación del disfraz',               20, 3, NULL
  UNION ALL SELECT 'INDIVIDUAL', 'PASARELA',    'Pasarela',             'Actitud, desenvolvimiento y conexión con el público',       15, 4, NULL
  UNION ALL SELECT 'FAMILIAR',   'CREATIVIDAD', 'Creatividad',          'Idea novedosa del conjunto',                                30, 1, 1
  UNION ALL SELECT 'FAMILIAR',   'SEGURIDAD',   'Seguridad',            'Bienestar, comodidad y movilidad de la mascota',            25, 2, 2
  UNION ALL SELECT 'FAMILIAR',   'ELABORACION', 'Elaboración',          'Calidad y presentación visual del conjunto',                20, 3, NULL
  UNION ALL SELECT 'FAMILIAR',   'PASARELA',    'Pasarela',             'Actitud y puesta en escena',                                10, 4, NULL
  UNION ALL SELECT 'FAMILIAR',   'INTEGRACION', 'Integración familiar', 'Coherencia entre los disfraces de la familia y la mascota', 15, 5, NULL
) v ON v.rub = r.codigo
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre), descripcion = VALUES(descripcion), puntaje_max = VALUES(puntaje_max),
  orden = VALUES(orden), peso_desempate = VALUES(peso_desempate);

INSERT INTO trk_categorias (codigo, nombre, rubrica_id, orden)
SELECT v.codigo, v.nombre, r.id, v.orden
FROM trk_rubricas r
JOIN (
            SELECT 'PEQ_MED' AS codigo, 'Caninos pequeños y medianos' AS nombre, 'INDIVIDUAL' AS rub, 1 AS orden
  UNION ALL SELECT 'GRANDES',  'Caninos grandes',                              'INDIVIDUAL', 2
  UNION ALL SELECT 'FELINOS',  'Felinos',                                      'INDIVIDUAL', 3
  UNION ALL SELECT 'FAMILIAR', 'Disfraz familiar (mascota + acompañante/s)',  'FAMILIAR',   4
) v ON v.rub = r.codigo
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), rubrica_id = VALUES(rubrica_id), orden = VALUES(orden);
