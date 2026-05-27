/**
 * sv/services/snapshot.service.js
 * Genera el snapshot diario de KPIs por usuario.
 * Usado por:
 *   - cron 23:55 (snapshotDiario.job)
 *   - hook on-logout (recalcula el día actual del usuario que cierra sesión)
 */
const pool   = require('../config/db');
const logger = require('../../utils/logger');

/**
 * Genera/actualiza snapshots para un día específico.
 * @param {string} fecha - 'YYYY-MM-DD' (default: hoy)
 * @param {number} [usuarioId] - si se pasa, solo recalcula ese usuario
 * @returns {Promise<{insertados:number, actualizados:number, fecha:string}>}
 */
const { aISO, hoyISO } = require('../utils/fechas');

async function generarSnapshot(fecha = null, usuarioId = null) {
  const dia = aISO(fecha) || hoyISO();

  // Filtro opcional por usuario
  const userFilter = usuarioId ? 'AND u.usr_id = ?' : '';
  const params = usuarioId ? [dia, dia, dia, dia, usuarioId] : [dia, dia, dia, dia];

  // Query agregada:
  //   - gestiones del día por asesor
  //   - interesados nuevos = gestiones cuyo resultado_es_positivo=1 del día
  //   - contratos cerrados = prospectos que pasaron a estado_es_ganado=1 hoy (vía gestiones)
  //   - vencidas acumuladas = prospectos activos con prox_fecha < hoy del asesor
  const sql = `
    INSERT INTO sv_rpt_snapshot_diario
      (snap_usuario_id, snap_area_id, snap_grupo_id, snap_fecha,
       snap_gestiones_realizadas, snap_interesados_nuevos, snap_contratos_cerrados,
       snap_vencidas_acumuladas, snap_valor_vendido_cop)
    SELECT
      u.usr_id,
      u.usr_area_id,
      u.usr_grupo_id,
      ? AS snap_fecha,
      COALESCE((
        SELECT COUNT(*) FROM sv_crm_gestiones g
         WHERE g.gest_asesor_id = u.usr_id AND DATE(g.gest_fecha_hora) = ?
      ), 0) AS gestiones,
      COALESCE((
        SELECT COUNT(*) FROM sv_crm_gestiones g
         JOIN sv_cfg_resultados_gestion r ON r.resultado_id = g.gest_resultado_id
         WHERE g.gest_asesor_id = u.usr_id AND DATE(g.gest_fecha_hora) = ?
           AND r.resultado_es_positivo = 1
      ), 0) AS interesados,
      COALESCE((
        SELECT COUNT(DISTINCT g.gest_prosp_id) FROM sv_crm_gestiones g
         JOIN sv_cfg_estados_gestion e ON e.estado_id = g.gest_estado_nuevo_id
         WHERE g.gest_asesor_id = u.usr_id AND DATE(g.gest_fecha_hora) = ?
           AND e.estado_es_ganado = 1
      ), 0) AS contratos,
      COALESCE((
        SELECT COUNT(*) FROM sv_crm_prospectos p
         WHERE p.prosp_asesor_id = u.usr_id
           AND p.prosp_activo = 1
           AND p.prosp_prox_gestion_fecha < CURDATE()
      ), 0) AS vencidas,
      0 AS valor   -- Se completa en Fase 4 al haber contratos con valor
    FROM sv_org_usuarios u
    WHERE u.usr_activo = 1
      AND u.usr_grupo_id IS NOT NULL
      AND u.usr_area_id  IS NOT NULL
      ${userFilter}
    ON DUPLICATE KEY UPDATE
      snap_gestiones_realizadas = VALUES(snap_gestiones_realizadas),
      snap_interesados_nuevos   = VALUES(snap_interesados_nuevos),
      snap_contratos_cerrados   = VALUES(snap_contratos_cerrados),
      snap_vencidas_acumuladas  = VALUES(snap_vencidas_acumuladas),
      snap_valor_vendido_cop    = VALUES(snap_valor_vendido_cop),
      snap_updated_at           = CURRENT_TIMESTAMP
  `;

  const t0 = Date.now();
  const [result] = await pool.execute(sql, params);
  const elapsed = Date.now() - t0;
  logger.info(`[SerVentas] Snapshot ${dia}${usuarioId ? ' (usr=' + usuarioId + ')' : ''}: ${result.affectedRows} filas (${elapsed}ms)`);
  return { afectados: result.affectedRows, fecha: dia, elapsed };
}

module.exports = { generarSnapshot };
