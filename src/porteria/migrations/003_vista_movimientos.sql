-- Vista para Superset: movimientos no anulados con sede, motivo y vehículo. En los ingresos que cierran
-- un viaje (evento_par_id) agrega la duración en minutos y los km recorridos.
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
