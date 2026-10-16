/**
 * reportes.controller.js
 * Reportes transversales para gerencia. Solo lectura.
 */
const db = require('../config/db')

/* La trazabilidad de una sala son tres fuentes distintas: ingreso y salida
   viven en JSON sobre homenajes_sala y las visitas en su propia tabla. Se
   unifican en un solo renglón por evento para poder leerlos en orden.

   La salida no guarda cuándo se registró: se usa updated_at, que es la
   última escritura de la fila y en la práctica coincide con el cierre. */
const SQL_EVENTOS = `
WITH eventos AS (
  SELECT h.id AS homenaje_id, 1 AS orden, 'INGRESO' AS evento, NULL AS numero,
         STR_TO_DATE(CONCAT(h.ingreso_data->>'$.fecha', ' ', h.ingreso_data->>'$.hora'),
                     '%Y-%m-%d %H:%i')                                        AS momento,
         h.created_at                                                         AS registrado_en,
         CHAR_LENGTH(COALESCE(h.ingreso_data->>'$.firma_familiar','')) > 20    AS firmado,
         NULLIF(h.ingreso_data->>'$.funcionario_nombre','')                    AS funcionario,
         NULLIF(h.ingreso_data->>'$.familiar_confirmo','')                     AS familiar,
         NULLIF(h.ingreso_data->>'$.observaciones','')                         AS observaciones
  FROM homenajes_sala h
  WHERE h.ingreso_data IS NOT NULL

  UNION ALL

  SELECT v.homenaje_sala_id, 2, 'VISITA', v.numero_visita,
         TIMESTAMP(v.fecha_visita, v.hora_visita), v.created_at,
         CHAR_LENGTH(COALESCE(v.firma_familiar,'')) > 20,
         NULLIF(v.vo_bo,''), NULL, NULLIF(v.observaciones,'')
  FROM homenaje_sala_visitas v

  UNION ALL

  SELECT h.id, 3, 'SALIDA', NULL,
         STR_TO_DATE(CONCAT(h.salida_data->>'$.fecha', ' ', h.salida_data->>'$.hora'),
                     '%Y-%m-%d %H:%i'),
         h.updated_at,
         CHAR_LENGTH(COALESCE(h.salida_data->>'$.firma_familiar','')) > 20,
         NULLIF(h.salida_data->>'$.funcionario_nombre',''),
         NULLIF(h.salida_data->>'$.familiar_confirmo',''),
         NULLIF(h.salida_data->>'$.observaciones','')
  FROM homenajes_sala h
  WHERE h.salida_data IS NOT NULL AND h.salida_data->>'$.fecha' <> ''
)
SELECT h.id                              AS homenaje_id,
       a.codigo                          AS asistencia,
       a.nombre_ser_querido              AS ser_querido,
       a.contrato,
       sd.nombre                         AS sede,
       sv.codigo                         AS sala,
       sv.nombre                         AS sala_nombre,
       h.estado,
       e.evento, e.numero,
       e.momento, e.registrado_en,
       TIMESTAMPDIFF(MINUTE, e.momento, e.registrado_en)            AS desfase_min,
       TIMESTAMPDIFF(MINUTE,
         LAG(e.momento) OVER (PARTITION BY e.homenaje_id
                              ORDER BY e.orden, e.numero, e.momento),
         e.momento)                                                 AS desde_anterior_min,
       e.firmado = 1                     AS firmado,
       e.funcionario, e.familiar, e.observaciones,
       /* Todas las visitas del homenaje, no solo las que caen en el rango:
          si no, un homenaje que arranca a fin de mes se ve sin visitar. */
       (SELECT COUNT(*) FROM homenaje_sala_visitas v2
         WHERE v2.homenaje_sala_id = h.id) AS total_visitas
FROM eventos e
JOIN homenajes_sala h       ON h.id  = e.homenaje_id
LEFT JOIN asistencias a     ON a.id  = h.asistencia_id
LEFT JOIN salas_velacion sv ON sv.id = h.sala_id
LEFT JOIN sedes sd          ON sd.id = sv.sede_id
WHERE e.momento IS NOT NULL`

// Rango por defecto: el mes corrido, que es como lo mira gerencia.
function rango(q) {
  const hoy = new Date()
  const iso = d => d.toISOString().slice(0, 10)
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(q.desde || '')
    ? q.desde : iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(q.hasta || '') ? q.hasta : iso(hoy)
  return { desde, hasta }
}

// GET /api/h360/reportes/salas-velacion?desde=&hasta=&sede_id=&sala_id=
async function salasVelacion(req, res, next) {
  try {
    const { desde, hasta } = rango(req.query)
    const conds = ['DATE(e.momento) BETWEEN ? AND ?']
    const params = [desde, hasta]
    if (req.query.sede_id) { conds.push('sd.id = ?'); params.push(Number(req.query.sede_id)) }
    if (req.query.sala_id) { conds.push('sv.id = ?'); params.push(Number(req.query.sala_id)) }

    const [filas] = await db.query(
      `${SQL_EVENTOS} AND ${conds.join(' AND ')}
       ORDER BY e.momento DESC, e.homenaje_id DESC, e.orden, e.numero`,
      params)

    // Lo que mira gerencia es cuántos homenajes quedaron por debajo de las
    // dos visitas de protocolo, así que el resumen se agrupa por homenaje.
    const visitasPorHomenaje = new Map()
    for (const f of filas) visitasPorHomenaje.set(f.homenaje_id, f.total_visitas)
    const visitas = [...visitasPorHomenaje.values()]
    const resumen = {
      homenajes:      visitas.length,
      menos_de_dos:   visitas.filter(v => v < 2).length,
      dos:            visitas.filter(v => v === 2).length,
      mas_de_dos:     visitas.filter(v => v > 2).length,
    }

    res.json({ desde, hasta, resumen, data: filas })
  } catch (err) { next(err) }
}

module.exports = { salasVelacion }
