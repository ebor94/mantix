-- TRIKIPELUDOS — 002 Vistas. Formato largo: una fila por calificación × criterio.
CREATE OR REPLACE VIEW trk_vw_calificacion_totales AS
SELECT
  c.id               AS calificacion_id,
  c.participante_id  AS participante_id,
  p.categoria_id     AS categoria_id,
  p.mascota_nombre   AS mascota_nombre,
  c.jurado_id        AS jurado_id,
  TRIM(CONCAT(u.nombre, ' ', u.apellido)) AS jurado_nombre,
  c.total            AS total,
  c.enviada_at       AS enviada_at,
  c.bloqueada        AS bloqueada,
  cr.id              AS criterio_id,
  cr.codigo          AS criterio_codigo,
  cr.nombre          AS criterio_nombre,
  cr.orden           AS criterio_orden,
  d.puntaje          AS puntaje
FROM trk_calificaciones c
JOIN trk_participantes p        ON p.id = c.participante_id
JOIN usuarios u                 ON u.id = c.jurado_id
JOIN trk_calificacion_detalle d ON d.calificacion_id = c.id
JOIN trk_criterios cr           ON cr.id = d.criterio_id;
