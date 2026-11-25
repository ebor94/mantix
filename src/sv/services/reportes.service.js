/**
 * sv/services/reportes.service.js
 * Dashboard por área (snapshot diario) + reportes del asesor y del equipo, calculados al momento.
 */
const { Op, QueryTypes, fn, col, literal } = require('sequelize');
const {
  sequelize, SvSnapshotDiario, SvUsuario, SvArea, SvGrupo, SvGestion, SvProspecto, SvResultado, SvMeta, SvEstado
} = require('../models');
const { aISO, hoyISO, rango } = require('../utils/fechas');
const ventas = require('./ventas.service');

async function dashboardArea({ scope, fecha }) {
  const dia = aISO(fecha) || hoyISO();

  // KPIs del usuario o equipo
  const where = { snap_fecha: dia };
  if (scope?.asesorId)      where.snap_usuario_id = scope.asesorId;
  else if (scope?.grupoId)  where.snap_grupo_id   = scope.grupoId;
  else if (scope?.areaId)   where.snap_area_id    = scope.areaId;

  const totales = await SvSnapshotDiario.findAll({
    where,
    attributes: [
      [fn('SUM', col('snap_gestiones_realizadas')), 'gestiones'],
      [fn('SUM', col('snap_interesados_nuevos')),   'interesados'],
      [fn('SUM', col('snap_contratos_cerrados')),   'contratos'],
      [fn('SUM', col('snap_vencidas_acumuladas')),  'vencidas'],
      [fn('SUM', col('snap_valor_vendido_cop')),    'valor']
    ],
    raw: true
  });
  return { fecha: dia, kpis: totales[0] || {} };
}

// Misma definición que snapshot.service. En SQL directo: en un `where`, Sequelize corre las horas
// del rango según la zona horaria del servidor.
async function contarGestiones(usrId, desde, hasta) {
  const [fila] = await sequelize.query(`
    SELECT COUNT(*) AS gestiones, COUNT(CASE WHEN r.resultado_es_positivo = 1 THEN 1 END) AS interesados
      FROM sv_crm_gestiones g
      LEFT JOIN sv_cfg_resultados_gestion r ON r.resultado_id = g.gest_resultado_id
     WHERE g.gest_asesor_id = :usrId AND g.gest_fecha_hora BETWEEN :inicio AND :fin`, {
    replacements: { usrId, inicio: `${desde} 00:00:00`, fin: `${hasta} 23:59:59` },
    type: QueryTypes.SELECT
  });
  return { gestiones: Number(fila.gestiones), interesados: Number(fila.interesados) };
}

async function reporteAsesor(usrId, { mes, anio, desde, hasta }) {
  // Si pasaron desde/hasta usar esos (normalizados); sino calcular del mes
  let dStart, dEnd;
  if (desde && hasta) {
    dStart = aISO(desde);
    dEnd   = aISO(hasta);
  } else {
    const y = anio || new Date().getFullYear();
    const m = (mes || (new Date().getMonth() + 1)) - 1;
    dStart = aISO(new Date(y, m,     1));
    dEnd   = aISO(new Date(y, m + 1, 0));
  }

  const snaps = await SvSnapshotDiario.findAll({
    where: { snap_usuario_id: usrId, snap_fecha: { [Op.between]: [dStart, dEnd] } },
    order: [['snap_fecha', 'ASC']]
  });

  // Todo al momento: el snapshot de hoy no existe hasta las 11:55 p. m., y las correcciones y
  // anulaciones del supervisor cambian días que ya guardó.
  const metricas = await ventas.metricasPorAsesor([usrId], dStart, dEnd);
  const totales = {
    ...(await contarGestiones(usrId, dStart, dEnd)),
    ...(metricas.get(usrId) || { contratos: 0, valor: 0 })
  };

  // Meta del periodo
  let meta = null;
  if (mes && anio) {
    meta = await SvMeta.findOne({ where: { meta_usuario_id: usrId, meta_anio: anio, meta_mes: mes } });
  }

  // Distribución por resultado en el periodo
  const distribucion = await SvGestion.findAll({
    where: {
      gest_asesor_id: usrId,
      gest_fecha_hora: { [Op.between]: [`${dStart} 00:00:00`, `${dEnd} 23:59:59`] }
    },
    // NOTA: dStart/dEnd ya son 'YYYY-MM-DD' string aquí (via aISO arriba)
    attributes: [
      [col('resultado.resultado_codigo'), 'codigo'],
      [col('resultado.resultado_nombre'), 'nombre'],
      [fn('COUNT', col('gest_id')), 'total']
    ],
    include: [{ model: SvResultado, as: 'resultado', attributes: [] }],
    group: ['resultado.resultado_codigo', 'resultado.resultado_nombre'],
    raw: true
  });

  return { desde: dStart, hasta: dEnd, totales, meta, distribucion, snaps };
}

/**
 * Reporte de equipo — soporta rango de fechas (desde / hasta) o fecha única.
 * Calcula en vivo desde sv_crm_gestiones y sv_crm_prospectos, NO depende del
 * snapshot diario (que solo se genera a las 23:55, dejaba el panel vacío durante
 * el día). Mantiene el formato de respuesta esperado por el frontend.
 *
 * payload:
 *   - grupoId: filtra asesores del grupo
 *   - desde / hasta: rango (default = hoy)
 *   - fecha: compatibilidad — equivale a desde=hasta=fecha
 */
async function reporteEquipo({ grupoId, desde = null, hasta = null, fecha = null }) {
  // Resolver el rango
  let dDesde, dHasta;
  if (fecha && !desde && !hasta) {
    dDesde = dHasta = aISO(fecha);
  } else {
    dDesde = aISO(desde) || hoyISO();
    dHasta = aISO(hasta) || dDesde;
  }
  const start = `${dDesde} 00:00:00`;
  const end   = `${dHasta} 23:59:59`;
  const hoy   = hoyISO();

  // 1) Asesores activos del grupo (rol ASESOR=4 o AGENTE_SVC=4 con grupo_id correspondiente)
  const asesores = await SvUsuario.findAll({
    where: { usr_grupo_id: grupoId, usr_activo: 1 },
    attributes: ['usr_id', 'usr_nombre', 'usr_apellido', 'usr_email', 'usr_rol_id']
  });
  const grupo = await SvGrupo.findByPk(grupoId, { attributes: ['grupo_area_id'] });
  const registraVentas = !!grupo && await ventas.areaRegistraVentas(grupo.grupo_area_id);
  if (!asesores.length) return { desde: dDesde, hasta: dHasta, registra_ventas: registraVentas, asesores: [] };
  const asesorIds = asesores.map(u => u.usr_id);

  // 2) Conteo de gestiones por asesor en el rango
  const gestRows = await SvGestion.findAll({
    where: {
      gest_asesor_id: { [Op.in]: asesorIds },
      gest_fecha_hora: { [Op.between]: [start, end] }
    },
    attributes: [
      'gest_asesor_id',
      [fn('COUNT', col('gest_id')), 'total']
    ],
    group: ['gest_asesor_id'],
    raw: true
  });
  const mapGest = new Map(gestRows.map(r => [r.gest_asesor_id, parseInt(r.total)]));

  // 3) Cambios a "interesado" en el rango (cualquier estado con código INTERESADO o que contenga 'INTERES')
  const interesRows = await SvGestion.findAll({
    where: {
      gest_asesor_id: { [Op.in]: asesorIds },
      gest_fecha_hora: { [Op.between]: [start, end] }
    },
    include: [{
      model: SvEstado,
      as: 'estadoNuevo',
      where: { estado_codigo: { [Op.in]: ['INTERESADO', 'INTERES'] } },
      required: true,
      attributes: []
    }],
    attributes: [
      'gest_asesor_id',
      [fn('COUNT', col('gest_id')), 'total']
    ],
    group: ['gest_asesor_id'],
    raw: true
  });
  const mapInter = new Map(interesRows.map(r => [r.gest_asesor_id, parseInt(r.total)]));

  // 4) Contratos (firmados / afiliados) y valor vendido en el rango
  const metricas = await ventas.metricasPorAsesor(asesorIds, dDesde, dHasta);

  // 5) Vencidas acumuladas (prospectos con prox_gestion_fecha < hoy y estado no final)
  const vencRows = await SvProspecto.findAll({
    where: {
      prosp_asesor_id: { [Op.in]: asesorIds },
      prosp_grupo_id:  grupoId,
      prosp_activo:    1,
      prosp_prox_gestion_fecha: { [Op.lt]: hoy }
    },
    include: [{
      model: SvEstado, as: 'estado',
      where: { estado_es_final: 0 },
      required: true,
      attributes: []
    }],
    attributes: [
      'prosp_asesor_id',
      [fn('COUNT', col('prosp_id')), 'total']
    ],
    group: ['prosp_asesor_id'],
    raw: true
  });
  const mapVenc = new Map(vencRows.map(r => [r.prosp_asesor_id, parseInt(r.total)]));

  // 6) Metas del grupo (si existen)
  const metas = await SvMeta.findAll({ where: { meta_grupo_id: grupoId } });
  const metaContratos = metas.find(m => m.meta_metric_codigo === 'contratos_mes')?.meta_valor || 0;

  // 7) Componer resultado — usa las mismas claves del snapshot para compatibilidad con TablaAsesores
  const filas = asesores.map(u => {
    const { contratos, valor } = metricas.get(u.usr_id) || { contratos: 0, valor: 0 };
    return {
      snap_usuario_id:           u.usr_id,
      usuario:                   { usr_id: u.usr_id, usr_nombre: u.usr_nombre, usr_apellido: u.usr_apellido, usr_email: u.usr_email },
      snap_gestiones_realizadas: mapGest.get(u.usr_id) || 0,
      snap_interesados_nuevos:   mapInter.get(u.usr_id) || 0,
      snap_contratos_cerrados:   contratos,
      snap_valor_vendido_cop:    valor,
      snap_vencidas_acumuladas:  mapVenc.get(u.usr_id) || 0,
      snap_meta_contratos:       metaContratos,
      snap_meta_porcentaje:      metaContratos > 0 ? Math.round((contratos / metaContratos) * 100) : null
    };
  })
  // Ordenar por contratos desc, luego gestiones desc
  .sort((a, b) =>
    (b.snap_contratos_cerrados - a.snap_contratos_cerrados)
    || (b.snap_gestiones_realizadas - a.snap_gestiones_realizadas)
  );

  return { desde: dDesde, hasta: dHasta, registra_ventas: registraVentas, asesores: filas };
}

module.exports = { dashboardArea, reporteAsesor, reporteEquipo };
