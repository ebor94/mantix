-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — Desinfecciones: corrección del catálogo y carga de la hoja
--
-- Dos cosas, en este orden, y las dos idempotentes (se puede correr dos veces):
--
-- 1. CORRIGE EL CATÁLOGO. La migración inicial modeló «desinfección choque»
--    como UNA actividad con periodicidad distinta según el tipo de vehículo
--    (15 días en traslado, 30 en carroza). Está mal: son DOS actividades
--    distintas, «choque» y «choque-choque», y así figuran también en la
--    pestaña LABORATORIO de la misma hoja («choque» 8 días y «doble choque»
--    15 días como renglones separados).
--
--    Las reglas correctas, confirmadas con operaciones:
--      CARROZA  → lavado y polichado 30d · limpieza y lavado 15d · choque-choque 30d
--      TRASLADO → lavado y polichado 30d · limpieza y lavado 15d · choque        15d
--
--    La corrección NO borra ni recrea la regla: le cambia la actividad a la que
--    apunta. Así la programación que ya existía contra ella sobrevive y queda
--    leyéndose con el nombre correcto, sin huérfanos y sin tener que volver a
--    sembrar. Se hace acá y no por el API a propósito: `actualizarRegla` impide
--    mover una regla de actividad justamente para que nadie reinterprete en
--    silencio las filas existentes. Acá esa reinterpretación es lo que se
--    busca, es por una sola vez, y no hay historia que proteger (cero
--    registros de ejecución al momento de escribir esto).
--
-- 2. CARGA EL TABLERO que se llevaba a mano en la hoja: siembra las filas que
--    le corresponden a cada vehículo y les escribe la última y la próxima
--    fecha tal como estaban.
--
--    Las celdas que en la hoja no eran fechas («PEND - PAMPLONA», «N/A»,
--    «REALIZA OLIVOS», «ESTABA NO OPERATIVA») no se inventan: la fila queda
--    PENDIENTE o NO_APLICA y el texto original se guarda en `observaciones`,
--    para que dentro de seis meses se sepa de dónde salió el dato y por qué
--    está así.
--
--    Las fechas próximas se cargan TAL CUAL, aunque no cuadren con la
--    periodicidad. No es un error que haya 31 días entre dos limpiezas de 15:
--    reparten un vehículo por día a propósito para no lavar seis carrozas la
--    misma mañana. Recalcularlas aquí borraría esa planeación.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. La actividad que faltaba ────────────────────────────────────────────
INSERT INTO h360_desinf_actividad (nombre, descripcion) VALUES
  ('Desinfección choque-choque',
   'Desinfección por doble choque del compartimiento. La ejecuta el operario y exige evidencia fotográfica.')
ON DUPLICATE KEY UPDATE nombre = nombre;

-- La regla de 30 días en carroza pasa de «choque» a «choque-choque».
-- El WHERE la ancla por forma (tipo, periodicidad, tipo de registro) y por la
-- actividad de origen, así que una segunda corrida no encuentra nada que mover.
UPDATE h360_desinf_regla r
   JOIN h360_desinf_actividad viejo  ON viejo.id  = r.actividad_id
   JOIN h360_desinf_actividad nuevo  ON nuevo.nombre = 'Desinfección choque-choque'
   SET r.actividad_id = nuevo.id
 WHERE viejo.nombre       = 'Desinfección choque'
   AND r.tipo_vehiculo    = 'CARROZA'
   AND r.periodicidad_dias = 30
   AND r.tipo_registro    = 'EVIDENCIA';

-- Y «choque» se queda solo con la de 15 días en traslado, que es la que le
-- corresponde. (Nada que hacer: la otra ya se movió.)

-- ── 2. Los datos de la hoja ───────────────────────────────────────────────
--
-- Tabla temporal para que la carga se lea como la hoja y no como una tapia de
-- UPDATEs. `placa_hoja` queda al lado de la placa real porque no son iguales:
-- en la hoja están con sufijo de sede («EDU-022   PC», «NQN-835 PAM») o con el
-- estado escrito dentro del nombre («LWL-087 - NO OPERATIVA»).
--
-- Las dos placas duplicadas en la base se resolvieron con operaciones: se usa
-- `NQN-835` y no `NQN-835 PAM`, y `JLL-579` y no `JLL-579 SAR`. (JLL-579 no
-- está en la hoja, así que acá no aparece.)
DROP TEMPORARY TABLE IF EXISTS tmp_carga_desinf;
CREATE TEMPORARY TABLE tmp_carga_desinf (
  placa        VARCHAR(15)  NOT NULL,
  placa_hoja   VARCHAR(40)  NULL,
  actividad    VARCHAR(80)  NOT NULL,
  fecha_ult    DATE         NULL,
  fecha_prox   DATE         NULL,
  no_aplica    TINYINT(1)   NOT NULL DEFAULT 0,
  nota         VARCHAR(300) NULL,
  KEY (placa, actividad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO tmp_carga_desinf (placa, placa_hoja, actividad, fecha_ult, fecha_prox, no_aplica, nota) VALUES
-- ── CARROZAS ──────────────────────────────────────────────────────────────
('FRR-237',     'FRR-237',          'Lavado y polichado',         '2026-10-15', '2026-11-15', 0, NULL),
('FRR-237',     'FRR-237',          'Limpieza y lavado',          '2026-10-25', '2026-11-12', 0, NULL),
('FRR-237',     'FRR-237',          'Desinfección choque-choque', '2026-10-15', '2026-11-15', 0, NULL),

('LVZ - 087',   'LVZ - 087',        'Lavado y polichado',         '2026-11-07', '2026-12-07', 0, NULL),
('LVZ - 087',   'LVZ - 087',        'Limpieza y lavado',          '2026-10-28', '2026-11-13', 0, NULL),
('LVZ - 087',   'LVZ - 087',        'Desinfección choque-choque', '2026-11-07', '2026-12-07', 0, NULL),

('LVZ - 097',   'LVZ - 097',        'Lavado y polichado',         '2026-11-07', '2026-12-07', 0, NULL),
('LVZ - 097',   'LVZ - 097',        'Limpieza y lavado',          '2026-10-27', '2026-11-14', 0, NULL),
('LVZ - 097',   'LVZ - 097',        'Desinfección choque-choque', '2026-11-07', '2026-12-07', 0, NULL),

('LVZ - 809',   'LVZ - 809',        'Lavado y polichado',         '2026-11-07', '2026-12-07', 0, NULL),
('LVZ - 809',   'LVZ - 809',        'Limpieza y lavado',          '2026-10-24', '2026-11-15', 0, NULL),
('LVZ - 809',   'LVZ - 809',        'Desinfección choque-choque', '2026-11-07', '2026-12-07', 0, NULL),

-- La limpieza de DMM-896 no tiene última fecha: en la hoja dice «ESTABA NO
-- OPERATIVA». Sí tiene próxima, así que queda programada y sin histórico.
('DMM-896',     'DMM-896',          'Lavado y polichado',         '2026-11-07', '2026-12-07', 0, NULL),
('DMM-896',     'DMM-896',          'Limpieza y lavado',          NULL,         '2026-11-16', 0, 'Cargado de la hoja: la última decía «ESTABA NO OPERATIVA».'),
('DMM-896',     'DMM-896',          'Desinfección choque-choque', '2026-11-07', '2026-12-07', 0, NULL),

-- 31 días entre limpiezas de 15 días: es la planeación real, no un error.
('NQN-963',     'NQN-963',          'Lavado y polichado',         '2026-11-08', '2026-12-08', 0, NULL),
('NQN-963',     'NQN-963',          'Limpieza y lavado',          '2026-10-21', '2026-11-21', 0, NULL),
('NQN-963',     'NQN-963',          'Desinfección choque-choque', '2026-11-08', '2026-12-08', 0, NULL),

-- Toda la fila de NQN-964 decía «PEND - PAMPLONA»: queda sin programar.
('NQN-964',     'NQN-964',          'Lavado y polichado',         NULL, NULL, 0, 'Cargado de la hoja: «PEND - PAMPLONA».'),
('NQN-964',     'NQN-964',          'Limpieza y lavado',          NULL, NULL, 0, 'Cargado de la hoja: «PEND - PAMPLONA».'),
('NQN-964',     'NQN-964',          'Desinfección choque-choque', NULL, NULL, 0, 'Cargado de la hoja: «PEND - PAMPLONA».'),

-- Estas tres estaban en la hoja sin ninguna fecha.
('EDU-022',     'EDU-022   PC',     'Lavado y polichado',         NULL, NULL, 0, 'Cargado de la hoja sin fechas.'),
('EDU-022',     'EDU-022   PC',     'Limpieza y lavado',          NULL, NULL, 0, 'Cargado de la hoja sin fechas.'),
('EDU-022',     'EDU-022   PC',     'Desinfección choque-choque', NULL, NULL, 0, 'Cargado de la hoja sin fechas.'),

('NQN-835',     'NQN-835 PAM',      'Lavado y polichado',         NULL, NULL, 0, 'Cargado de la hoja sin fechas.'),
('NQN-835',     'NQN-835 PAM',      'Limpieza y lavado',          NULL, NULL, 0, 'Cargado de la hoja sin fechas.'),
('NQN-835',     'NQN-835 PAM',      'Desinfección choque-choque', NULL, NULL, 0, 'Cargado de la hoja sin fechas.'),

('CUD-807 PAM', 'CUD-807 PAM',      'Lavado y polichado',         NULL, NULL, 0, 'Cargado de la hoja sin fechas.'),
('CUD-807 PAM', 'CUD-807 PAM',      'Limpieza y lavado',          NULL, NULL, 0, 'Cargado de la hoja sin fechas.'),
('CUD-807 PAM', 'CUD-807 PAM',      'Desinfección choque-choque', NULL, NULL, 0, 'Cargado de la hoja sin fechas.'),

-- ── TRASLADO ──────────────────────────────────────────────────────────────
-- UDX 027 tenía además la columna de choque-30 con fecha. No se carga: el
-- choque-choque es de carrozas, así que ese dato quedó fuera del modelo.
('UDX 027',     'UDX 027',          'Lavado y polichado',         '2026-11-13', '2026-12-13', 0, NULL),
('UDX 027',     'UDX 027',          'Limpieza y lavado',          '2026-11-05', '2026-11-15', 0, NULL),
('UDX 027',     'UDX 027',          'Desinfección choque',        '2026-11-05', '2026-11-15', 0, NULL),

-- NQO-411: el polichado decía «N/A» y la limpieza «REALIZA OLIVOS». Las dos
-- quedan NO_APLICA, que es lo que significaban; el choque queda sin programar.
('NQO-411',     'NQO-411',          'Lavado y polichado',         NULL, NULL, 1, 'Cargado de la hoja: «N/A».'),
('NQO-411',     'NQO-411',          'Limpieza y lavado',          NULL, NULL, 1, 'Cargado de la hoja: «REALIZA OLIVOS» — la hace Los Olivos.'),
('NQO-411',     'NQO-411',          'Desinfección choque',        NULL, NULL, 0, 'Cargado de la hoja sin fechas.'),

-- LWL 087 estaba en la hoja como «LWL-087 - NO OPERATIVA», sin fechas.
('LWL 087',     'LWL-087 - NO OPERATIVA', 'Lavado y polichado',   NULL, NULL, 0, 'Cargado de la hoja: marcada «NO OPERATIVA», sin fechas.'),
('LWL 087',     'LWL-087 - NO OPERATIVA', 'Limpieza y lavado',    NULL, NULL, 0, 'Cargado de la hoja: marcada «NO OPERATIVA», sin fechas.'),
('LWL 087',     'LWL-087 - NO OPERATIVA', 'Desinfección choque',  NULL, NULL, 0, 'Cargado de la hoja: marcada «NO OPERATIVA», sin fechas.');

-- ── 2a. Avisar de lo que no se va a cargar ────────────────────────────────
-- Si una placa de la hoja no existe en `vehiculos`, su fila se perdería en
-- silencio. Esto la saca a la luz ANTES de escribir nada.
SELECT t.placa_hoja AS placa_de_la_hoja_que_no_existe_en_vehiculos
  FROM (SELECT DISTINCT placa, placa_hoja FROM tmp_carga_desinf) t
  LEFT JOIN vehiculos v ON v.placa = t.placa
 WHERE v.id IS NULL;

-- Y si una actividad de la carga no tiene regla para el tipo de ese vehículo,
-- tampoco hay dónde poner la fecha.
SELECT t.placa, t.actividad AS actividad_sin_regla_para_ese_tipo, v.tipo
  FROM tmp_carga_desinf t
  JOIN vehiculos v ON v.placa = t.placa
  LEFT JOIN h360_desinf_actividad a ON a.nombre = t.actividad
  LEFT JOIN h360_desinf_regla r ON r.actividad_id = a.id AND r.tipo_vehiculo = v.tipo
 WHERE r.id IS NULL;

-- ── 2b. Sembrar las filas ─────────────────────────────────────────────────
-- INSERT IGNORE y no ON DUPLICATE KEY UPDATE: lo que ya existe se queda como
-- está y no se le toca `updated_at`.
INSERT IGNORE INTO h360_desinf_programacion (vehiculo_id, regla_id, estado)
SELECT v.id, r.id, 'PENDIENTE'
  FROM tmp_carga_desinf t
  JOIN vehiculos v              ON v.placa = t.placa
  JOIN h360_desinf_actividad a  ON a.nombre = t.actividad
  JOIN h360_desinf_regla r      ON r.actividad_id = a.id AND r.tipo_vehiculo = v.tipo;

-- ── 2c. Escribir las fechas ───────────────────────────────────────────────
-- El estado se deduce de la fecha y no se acepta a dedo: una fila que dijera
-- PROGRAMADA con fecha de ayer sería una mentira que el tablero repetiría.
-- Se compara con CURDATE() porque MySQL corre en el mismo host que la
-- aplicación y en la misma zona (America/Bogota, verificado).
UPDATE h360_desinf_programacion p
  JOIN h360_desinf_regla r     ON r.id = p.regla_id
  JOIN h360_desinf_actividad a ON a.id = r.actividad_id
  JOIN vehiculos v             ON v.id = p.vehiculo_id
  JOIN tmp_carga_desinf t      ON t.placa = v.placa AND t.actividad = a.nombre
   SET p.fecha_ult     = t.fecha_ult,
       p.fecha_prox    = t.fecha_prox,
       p.observaciones = COALESCE(t.nota, p.observaciones),
       p.programada_por = 'carga-hoja',
       p.programada_at  = NOW(),
       p.estado = CASE
         WHEN t.no_aplica = 1          THEN 'NO_APLICA'
         WHEN t.fecha_prox IS NULL     THEN 'PENDIENTE'
         WHEN t.fecha_prox < CURDATE() THEN 'VENCIDA'
         ELSE 'PROGRAMADA'
       END
 -- Solo las filas que la carga toca y que nadie ha trabajado todavía: si ya
 -- hay una ejecución registrada, lo de la hoja es más viejo que lo del sistema
 -- y pisarlo sería retroceder.
 WHERE p.ultimo_registro_id IS NULL;

DROP TEMPORARY TABLE IF EXISTS tmp_carga_desinf;

-- ── 3. Cómo quedó ─────────────────────────────────────────────────────────
SELECT a.nombre AS actividad, r.tipo_vehiculo, r.periodicidad_dias, r.tipo_registro
  FROM h360_desinf_regla r JOIN h360_desinf_actividad a ON a.id = r.actividad_id
 ORDER BY r.tipo_vehiculo, a.nombre;

SELECT v.placa, v.tipo, a.nombre AS actividad, p.estado,
       DATE_FORMAT(p.fecha_ult, '%d/%m/%Y')  AS ultima,
       DATE_FORMAT(p.fecha_prox, '%d/%m/%Y') AS proxima
  FROM h360_desinf_programacion p
  JOIN h360_desinf_regla r     ON r.id = p.regla_id
  JOIN h360_desinf_actividad a ON a.id = r.actividad_id
  JOIN vehiculos v             ON v.id = p.vehiculo_id
 ORDER BY v.tipo, v.placa, a.nombre;
