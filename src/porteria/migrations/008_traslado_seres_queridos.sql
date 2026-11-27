-- Traslado de seres queridos: el motivo pide una asistencia en ENCOFRADO, ENCUENTRO o SALA (velación) de H360
-- y el destino (una sede o un texto libre). El destino se guarda en referencia_snapshot ($.destino_sede_id, $.destino).
ALTER TABLE por_motivos MODIFY tipo_referencia
  ENUM('NINGUNA','ASISTENCIA','EXEQUIA','TEXTO','TRASLADO') NOT NULL DEFAULT 'NINGUNA';

INSERT INTO por_motivos
  (codigo, nombre, aplica_propio, aplica_proveedor_asistencia, aplica_proveedor,
   tipo_referencia, referencia_obligatoria, orden, updated_by)
VALUES
  ('TRASLADO_SERES_QUERIDOS', 'Traslado de seres queridos', 1, 1, 0, 'TRASLADO', 1, 35, 'seed')
ON DUPLICATE KEY UPDATE codigo = codigo;

-- La vista de Superset agrega la columna destino (al final de las de referencia).
CREATE OR REPLACE VIEW v_por_movimientos AS
SELECT
  e.id,
  e.registrado_at,
  e.sede_id,
  s.codigo AS sede_codigo,
  s.nombre AS sede_nombre,
  e.sentido,
  e.tipo_vehiculo,
  e.placa,
  v.marca AS vehiculo_marca,
  v.modelo AS vehiculo_modelo,
  e.empresa,
  e.conductor_nombre,
  e.conductor_otro,
  m.codigo AS motivo_codigo,
  m.nombre AS motivo_nombre,
  JSON_UNQUOTE(JSON_EXTRACT(e.referencia_snapshot, '$.codigo')) AS referencia_codigo,
  e.referencia_texto,
  JSON_UNQUOTE(JSON_EXTRACT(e.referencia_snapshot, '$.destino')) AS destino,
  e.kilometraje,
  e.inconsistente,
  e.inconsistencia_tipo,
  e.registrado_por,
  e.evento_par_id,
  CASE WHEN e.sentido = 'INGRESO' AND p.id IS NOT NULL
       THEN TIMESTAMPDIFF(MINUTE, p.registrado_at, e.registrado_at) END AS duracion_min,
  CASE WHEN e.sentido = 'INGRESO' AND e.kilometraje IS NOT NULL AND p.kilometraje IS NOT NULL
       THEN e.kilometraje - p.kilometraje END AS km_recorridos
FROM por_eventos e
JOIN por_motivos m ON m.id = e.motivo_id
LEFT JOIN sedes s ON s.id = e.sede_id
LEFT JOIN vehiculos v ON v.id = e.vehiculo_id
LEFT JOIN por_eventos p ON p.id = e.evento_par_id AND p.anulado = 0
WHERE e.anulado = 0;
