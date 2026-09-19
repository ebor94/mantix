const { Op, fn, col, literal } = require('sequelize');
const { Afiliado, Convenio, Usuario } = require('../models');
const {
  resolverScope, normalizarRango, elegirGranularidad, construirWhere,
  ensamblarKpis, ensamblarPorOrigen, ensamblarRanking
} = require('./dashboardAfiliaciones.helpers');

const TOP_RANKING = 15;

// Expresiones SQL reutilizables (columnas camelCase en la tabla afiliados).
const SUM_APROBADAS  = literal('SUM(CASE WHEN estadoRegistro = 1 AND anulado = 0 THEN 1 ELSE 0 END)');
const SUM_PENDIENTES = literal('SUM(CASE WHEN estadoRegistro = 0 AND rechazado = 0 THEN 1 ELSE 0 END)');
const SUM_RECHAZADAS = literal('SUM(CASE WHEN rechazado = 1 THEN 1 ELSE 0 END)');
const SUM_ANULADAS   = literal('SUM(CASE WHEN anulado = 1 THEN 1 ELSE 0 END)');

/** Normaliza el 'periodo' devuelto por SQL a string 'YYYY-MM-DD' o 'YYYY-MM'. */
function fmtPeriodo(p) {
  if (p instanceof Date) {
    const y = p.getFullYear();
    const m = String(p.getMonth() + 1).padStart(2, '0');
    const d = String(p.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(p);
}

async function calcularDashboard({ usuario, desde, hasta, origen, convenioId }) {
  const scope = resolverScope(usuario);
  const rango = normalizarRango(desde, hasta);
  const granularidad = elegirGranularidad(rango.desde, rango.hasta);
  const where = construirWhere({ rango, scope, origen, convenioId });

  // ── KPIs (una sola fila agregada) ─────────────────────────────
  const kpiRows = await Afiliado.findAll({
    where,
    attributes: [
      [fn('COUNT', col('id')), 'registradas'],
      [SUM_APROBADAS, 'aprobadas'],
      [SUM_PENDIENTES, 'pendientes'],
      [SUM_RECHAZADAS, 'rechazadas'],
      [SUM_ANULADAS, 'anuladas']
    ],
    raw: true
  });
  const kpis = ensamblarKpis(kpiRows[0]);

  // ── Serie temporal ────────────────────────────────────────────
  const dateExpr = granularidad === 'dia'
    ? "DATE(createdAt)"
    : "DATE_FORMAT(createdAt, '%Y-%m')";
  const serieRows = await Afiliado.findAll({
    where,
    attributes: [
      [literal(dateExpr), 'periodo'],
      [fn('COUNT', col('id')), 'registradas'],
      [SUM_APROBADAS, 'aprobadas']
    ],
    group: [literal(dateExpr)],
    order: [literal(`${dateExpr} ASC`)],
    raw: true
  });
  const serie = serieRows.map(r => ({
    periodo: fmtPeriodo(r.periodo),
    registradas: Number(r.registradas || 0),
    aprobadas: Number(r.aprobadas || 0)
  }));

  // ── Por origen y ranking: solo en vista global ────────────────
  let porOrigen = [];
  let ranking = [];

  if (scope.esGlobal) {
    const origenRows = await Afiliado.findAll({
      where,
      attributes: [
        'origen', 'convenioId',
        [fn('COUNT', col('id')), 'registradas'],
        [SUM_APROBADAS, 'aprobadas']
      ],
      group: ['origen', 'convenioId'],
      raw: true
    });
    const convenioIds = [...new Set(origenRows.map(r => r.convenioId).filter(Boolean))];
    const convenios = convenioIds.length
      ? await Convenio.findAll({ where: { id: { [Op.in]: convenioIds } }, attributes: ['id', 'nombre'], raw: true })
      : [];
    const convenioNombreById = Object.fromEntries(convenios.map(c => [c.id, c.nombre]));
    porOrigen = ensamblarPorOrigen(origenRows, convenioNombreById);

    const rankingRows = await Afiliado.findAll({
      where: { ...where, asesorId: { [Op.ne]: null } },
      attributes: [
        'asesorId',
        [fn('COUNT', col('id')), 'registradas'],
        [SUM_APROBADAS, 'aprobadas']
      ],
      group: ['asesorId'],
      raw: true
    });
    const asesorIds = rankingRows.map(r => r.asesorId);
    const usuarios = asesorIds.length
      ? await Usuario.findAll({ where: { id: { [Op.in]: asesorIds } }, attributes: ['id', 'nombre', 'apellido'], raw: true })
      : [];
    const usuarioById = Object.fromEntries(
      usuarios.map(u => [u.id, `${u.nombre || ''} ${u.apellido || ''}`.trim()])
    );
    ranking = ensamblarRanking(rankingRows, usuarioById, TOP_RANKING);
  }

  return {
    rango: { desde: rango.desde, hasta: rango.hasta, granularidad },
    esGlobal: scope.esGlobal,
    kpis,
    serie,
    porOrigen,
    ranking
  };
}

module.exports = { calcularDashboard };
