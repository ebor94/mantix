/**
 * sv/services/empresas.service.js
 * CRUD + anti-duplicados de empresas B2B.
 * UNIQUE real: empresa_nit_norm (solo dígitos sin DV).
 */
const { Op } = require('sequelize');
const { sequelize, SvEmpresa, SvProspecto, SvPersona, SvEstado, SvUsuario, SvGestion, SvResultado, SvFidelizMovimiento, SvTipoEmpresa, SvGrupoEmpresarial } = require('../models');
const { parse, normalizar, esValido } = require('../utils/nit');
const { grupoIdsAccesibles, areaIdsAccesibles } = require('../utils/acceso');
const { ROLES } = require('../config/constants');

const CATEGORIAS_VALIDAS = ['BRONCE', 'PLATA', 'ORO', 'PLATINO', 'DIAMANTE'];

/**
 * Devuelve el array de IDs de empresas que el usuario puede ver según su rol:
 *   - SUPER_ADMIN → null (sin filtro)
 *   - ASESOR / AGENTE_SVC → empresas con al menos un prospecto activo donde es asesor
 *   - SUPERVISOR / JEFE_PAP → empresas con prospectos en grupos accesibles (multi-grupo)
 *   - ADMIN_AREA / GERENTE_GENERAL → empresas con prospectos en áreas accesibles
 */
async function empresaIdsAccesibles(user) {
  const rol = user?.rol?.rol_codigo;
  if (!rol || rol === ROLES.SUPER_ADMIN) return null; // sin filtro

  const prospWhere = { prosp_activo: 1 };
  if (rol === ROLES.ASESOR || rol === ROLES.AGENTE_SVC) {
    prospWhere.prosp_asesor_id = user.usr_id;
  } else if (rol === ROLES.SUPERVISOR || rol === ROLES.JEFE_PAP) {
    const grupos = grupoIdsAccesibles(user);
    if (grupos === null) return null;
    if (!grupos.length) return [];
    prospWhere.prosp_grupo_id = { [Op.in]: grupos };
  } else if (rol === ROLES.ADMIN_AREA) {
    const areas = areaIdsAccesibles(user);
    if (areas === null) return null;
    if (!areas.length) return [];
    prospWhere.prosp_area_id = { [Op.in]: areas };
  } else {
    // Rol desconocido: cerrar acceso por defecto
    return [];
  }

  const rows = await SvProspecto.findAll({
    where: prospWhere,
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('prosp_empresa_id')), 'empresa_id']],
    raw: true
  });
  return rows.map(r => r.empresa_id).filter(Boolean);
}

class DuplicateError extends Error {
  constructor(empresa) { super('DUPLICATE_NIT'); this.code = 'DUPLICATE_NIT'; this.empresa = empresa; }
}

async function buscarPorNit(nit) {
  const norm = normalizar(nit);
  if (!norm) return null;
  return SvEmpresa.findOne({ where: { empresa_nit_norm: norm } });
}

async function crear(payload) {
  const parsed = parse(payload.empresa_nit);
  if (!parsed.norm || !esValido(payload.empresa_nit)) {
    const e = new Error('NIT inválido'); e.code = 'VALIDATION_ERROR'; throw e;
  }
  const existente = await SvEmpresa.findOne({ where: { empresa_nit_norm: parsed.norm } });
  if (existente) throw new DuplicateError(existente);

  return SvEmpresa.create({
    ...payload,
    empresa_nit: parsed.original,
    empresa_nit_norm: parsed.norm,
    empresa_dv: parsed.dv || payload.empresa_dv || null
  });
}

async function actualizar(id, payload) {
  const e = await SvEmpresa.findByPk(id);
  if (!e) { const err = new Error('Empresa no encontrada'); err.code = 'NOT_FOUND'; throw err; }

  if (payload.empresa_nit && payload.empresa_nit !== e.empresa_nit) {
    const parsed = parse(payload.empresa_nit);
    if (!parsed.norm || !esValido(payload.empresa_nit)) {
      const err = new Error('NIT inválido'); err.code = 'VALIDATION_ERROR'; throw err;
    }
    const otra = await SvEmpresa.findOne({ where: { empresa_nit_norm: parsed.norm } });
    if (otra && otra.empresa_id !== id) throw new DuplicateError(otra);
    payload.empresa_nit_norm = parsed.norm;
    payload.empresa_dv = parsed.dv || payload.empresa_dv;
  }

  await e.update(payload);
  return e;
}

async function list({ filtros = {}, scope, user, page = 1, limit = 20 }) {
  const where = { empresa_activa: 1 };

  // Restringir por scope del usuario (ASESOR ve solo sus empresas, etc.)
  if (user) {
    const idsAccesibles = await empresaIdsAccesibles(user);
    if (idsAccesibles !== null) {
      if (!idsAccesibles.length) {
        return { items: [], total: 0, page: parseInt(page), limit: parseInt(limit) };
      }
      where.empresa_id = { [Op.in]: idsAccesibles };
    }
  }

  if (filtros.q) {
    const q = `%${filtros.q}%`;
    where[Op.or] = [
      { empresa_razon_social:     { [Op.like]: q } },
      { empresa_nombre_comercial: { [Op.like]: q } },
      { empresa_nit_norm:         { [Op.like]: q.replace(/\D/g, '%') } }
    ];
  }
  if (filtros.sector) where.empresa_sector = filtros.sector;

  if (filtros.tipo_id) where.empresa_tipo_id = parseInt(filtros.tipo_id);
  if (filtros.grupo_empresarial_id) where.empresa_grupo_empresarial_id = parseInt(filtros.grupo_empresarial_id);

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows, count } = await SvEmpresa.findAndCountAll({
    where, order: [['empresa_razon_social', 'ASC']],
    limit: parseInt(limit), offset,
    include: [
      { model: SvTipoEmpresa,       as: 'tipo',             required: false, attributes: ['tipoemp_id','tipoemp_codigo','tipoemp_nombre'] },
      { model: SvGrupoEmpresarial,  as: 'grupoEmpresarial', required: false, attributes: ['grupemp_id','grupemp_nombre'] }
    ]
  });

  // Agregar conteo de prospectos activos por empresa (1 query adicional)
  if (rows.length) {
    const ids = rows.map(r => r.empresa_id);
    const counts = await SvProspecto.findAll({
      where: { prosp_empresa_id: ids, prosp_activo: 1 },
      attributes: ['prosp_empresa_id',
        [require('sequelize').fn('COUNT', require('sequelize').col('prosp_id')), 'total']],
      group: ['prosp_empresa_id'], raw: true
    });
    const map = new Map(counts.map(c => [c.prosp_empresa_id, parseInt(c.total)]));
    for (const r of rows) r.dataValues.prospectos_activos = map.get(r.empresa_id) || 0;
  }

  return { items: rows, total: count, page: parseInt(page), limit: parseInt(limit) };
}

async function obtenerConDetalle(id) {
  const empresa = await SvEmpresa.findByPk(id, {
    include: [
      { model: SvTipoEmpresa,       as: 'tipo',             required: false },
      { model: SvGrupoEmpresarial,  as: 'grupoEmpresarial', required: false }
    ]
  });
  if (!empresa) return null;

  const [prospectos, contactos] = await Promise.all([
    SvProspecto.findAll({
      where: { prosp_empresa_id: id },
      include: [
        { model: SvEstado,  as: 'estado' },
        { model: SvPersona, as: 'contacto' },
        { model: SvUsuario, as: 'asesor', attributes: ['usr_id','usr_nombre','usr_apellido'] }
      ],
      order: [['prosp_updated_at', 'DESC']]
    }),
    // Contactos = personas referenciadas como contacto-empresa en algún prospecto.
    // Los contactos B2B se guardan en prosp_contacto_empresa_id (NO en prosp_persona_id,
    // que es la persona principal para Prenec/individual). Usamos subquery directa
    // para no depender de un alias de asociación extra.
    SvPersona.findAll({
      where: {
        persona_id: {
          [Op.in]: sequelize.literal(
            `(SELECT DISTINCT prosp_contacto_empresa_id
                FROM sv_crm_prospectos
               WHERE prosp_empresa_id = ${parseInt(id)}
                 AND prosp_contacto_empresa_id IS NOT NULL)`
          )
        }
      },
      order: [['persona_nombre', 'ASC']]
    })
  ]);

  // Historial = gestiones de todos los prospectos de la empresa
  let gestiones = [];
  if (prospectos.length) {
    gestiones = await SvGestion.findAll({
      where: { gest_prosp_id: prospectos.map(p => p.prosp_id) },
      include: [
        { model: SvResultado, as: 'resultado' },
        { model: SvEstado,    as: 'estadoNuevo' },
        { model: SvUsuario,   as: 'asesor', attributes: ['usr_id','usr_nombre','usr_apellido'] }
      ],
      order: [['gest_fecha_hora', 'DESC']],
      limit: 30
    });
  }

  return { ...empresa.toJSON(), prospectos, contactos, gestiones };
}

/**
 * Reasignar el asesor de TODOS los prospectos activos de la empresa al nuevo asesor.
 * Crea una gestión inmutable por cada prospecto reasignado (mismo patrón que reasignación masiva).
 * Devuelve el conteo y el nuevo asesor.
 */
async function reasignarAsesor(empresaId, nuevoAsesorId, { actorId, motivo = '' } = {}) {
  const empresa = await SvEmpresa.findByPk(empresaId);
  if (!empresa) { const e = new Error('Empresa no encontrada'); e.code = 'NOT_FOUND'; throw e; }
  const destino = await SvUsuario.findByPk(nuevoAsesorId);
  if (!destino || !destino.usr_activo) { const e = new Error('Asesor destino inválido o inactivo'); e.code = 'VALIDATION_ERROR'; throw e; }

  // Tomar prospectos activos de la empresa
  const prospectos = await SvProspecto.findAll({ where: { prosp_empresa_id: empresaId, prosp_activo: 1 } });
  if (!prospectos.length) {
    // Empresa sin prospectos activos: nada que reasignar
    return { reasignados: 0, nuevoAsesor: destino.usr_id };
  }
  // Validar que el grupo del asesor coincide con el grupo de los prospectos
  const grupoEmpresa = prospectos[0].prosp_grupo_id;
  if (destino.usr_grupo_id !== grupoEmpresa) {
    const e = new Error('El asesor destino no pertenece al grupo de los prospectos de la empresa');
    e.code = 'VALIDATION_ERROR'; throw e;
  }

  const t = await sequelize.transaction();
  try {
    for (const p of prospectos) {
      const anterior = p.prosp_asesor_id;
      if (anterior === nuevoAsesorId) continue;
      await p.update({ prosp_asesor_id: nuevoAsesorId }, { transaction: t });
      await SvGestion.create({
        gest_prosp_id:    p.prosp_id,
        gest_asesor_id:   actorId,
        gest_canal:       'sistema',
        gest_comentario:  `[Reasignación empresa] de asesor #${anterior ?? '—'} a #${nuevoAsesorId}` +
                          (motivo ? `. Motivo: ${motivo}` : '')
      }, { transaction: t });
    }
    await t.commit();
  } catch (e) { await t.rollback(); throw e; }

  // Hook migración 019: mover seguimientos futuros no completados al nuevo asesor.
  let seguimientosReasignados = 0;
  try {
    const seg = require('./seguimientosEmpresa.service');
    seguimientosReasignados = await seg.reasignarFuturos({
      empresaId, nuevoAsesorId
    });
  } catch (_) { /* no bloquear */ }

  return { reasignados: prospectos.length, nuevoAsesor: destino.usr_id, seguimientos_reasignados: seguimientosReasignados };
}

async function actualizarCategoria(empresaId, categoria) {
  const empresa = await SvEmpresa.findByPk(empresaId);
  if (!empresa) { const e = new Error('Empresa no encontrada'); e.code = 'NOT_FOUND'; throw e; }
  if (categoria !== null && !CATEGORIAS_VALIDAS.includes(categoria)) {
    const e = new Error(`Categoría inválida. Valores: ${CATEGORIAS_VALIDAS.join(', ')}`);
    e.code = 'VALIDATION_ERROR'; throw e;
  }
  await empresa.update({ empresa_categoria: categoria });
  return empresa;
}

/**
 * Ajustar presupuesto de fidelización (ASIGNACION inicial o AJUSTE manual +/-).
 * Para CONSUMO automático ver fidelizacion.service.registrarEnvio.
 */
async function ajustarPresupuesto(empresaId, { monto, tipo = 'AJUSTE', descripcion = '', actorId }) {
  const empresa = await SvEmpresa.findByPk(empresaId);
  if (!empresa) { const e = new Error('Empresa no encontrada'); e.code = 'NOT_FOUND'; throw e; }
  if (!['ASIGNACION', 'AJUSTE'].includes(tipo)) {
    const e = new Error('Tipo inválido (ASIGNACION | AJUSTE)'); e.code = 'VALIDATION_ERROR'; throw e;
  }
  const m = parseFloat(monto);
  if (Number.isNaN(m)) { const e = new Error('Monto inválido'); e.code = 'VALIDATION_ERROR'; throw e; }

  const t = await sequelize.transaction();
  try {
    const nuevoPresupuesto = parseFloat(empresa.empresa_presupuesto_fideliz) + m;
    if (nuevoPresupuesto < 0) {
      const e = new Error('El presupuesto resultante sería negativo'); e.code = 'VALIDATION_ERROR'; throw e;
    }
    await empresa.update({ empresa_presupuesto_fideliz: nuevoPresupuesto }, { transaction: t });
    await SvFidelizMovimiento.create({
      mov_empresa_id:  empresaId,
      mov_tipo:        tipo,
      mov_monto:       m,
      mov_descripcion: descripcion || (tipo === 'ASIGNACION' ? 'Asignación inicial' : 'Ajuste manual'),
      mov_usuario_id:  actorId
    }, { transaction: t });
    await t.commit();
  } catch (e) { await t.rollback(); throw e; }
  return empresa.reload();
}

async function movimientosPresupuesto(empresaId, { page = 1, limit = 50 } = {}) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows, count } = await SvFidelizMovimiento.findAndCountAll({
    where: { mov_empresa_id: empresaId },
    include: [
      { model: SvUsuario, as: 'usuario', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
    ],
    order: [['mov_fecha', 'DESC']],
    limit: parseInt(limit),
    offset
  });
  return { items: rows, total: count };
}

/**
 * Reporte agregado de presupuesto de fidelización por categoría.
 * Devuelve, para cada categoría (BRONCE/PLATA/ORO/PLATINO/DIAMANTE + "Sin categoría"):
 *   - count_empresas
 *   - total_asignado, total_gastado, total_disponible
 *   - pct_consumido
 *   - num_envios (todos los envíos hechos a empresas de esa categoría)
 *   - num_envios_con_costo (los que descontaron presupuesto)
 *   - total_descuento_envios (suma de env_costo)
 * Devuelve además los totales globales.
 */
async function reportePresupuestoFidelizPorCategoria() {
  // 1. Agregado de empresas por categoría
  const empresasAgg = await SvEmpresa.findAll({
    attributes: [
      'empresa_categoria',
      [sequelize.fn('COUNT', sequelize.col('empresa_id')), 'count_empresas'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('empresa_presupuesto_fideliz')), 0), 'total_asignado'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('empresa_presupuesto_gastado')), 0), 'total_gastado']
    ],
    where: { empresa_activa: 1 },
    group: ['empresa_categoria'],
    raw: true
  });

  // 2. Agregado de envíos por categoría (vía JOIN con empresas)
  // Usamos query SQL nativa porque agrupar por columna de tabla joineada con Sequelize es engorroso.
  const [enviosAgg] = await sequelize.query(`
    SELECT
      e.empresa_categoria,
      COUNT(env.env_id)                         AS num_envios,
      SUM(CASE WHEN env.env_costo IS NOT NULL AND env.env_costo > 0 THEN 1 ELSE 0 END) AS num_envios_con_costo,
      COALESCE(SUM(env.env_costo), 0)           AS total_descuento_envios
    FROM sv_fideliz_envios env
    JOIN sv_crm_empresas e ON e.empresa_id = env.env_empresa_id
    WHERE e.empresa_activa = 1
    GROUP BY e.empresa_categoria
  `);

  // 3. Fusionar y normalizar
  const NIVELES = ['BRONCE', 'PLATA', 'ORO', 'PLATINO', 'DIAMANTE', null];
  const enviosMap = new Map(enviosAgg.map(r => [r.empresa_categoria || '__null__', r]));

  const porCategoria = NIVELES.map(cat => {
    const empBase = empresasAgg.find(e => (e.empresa_categoria || '__null__') === (cat || '__null__'));
    const envBase = enviosMap.get(cat || '__null__') || {};
    const totalAsignado  = parseFloat(empBase?.total_asignado || 0);
    const totalGastado   = parseFloat(empBase?.total_gastado || 0);
    const disponible     = totalAsignado - totalGastado;
    const pct            = totalAsignado > 0 ? (totalGastado / totalAsignado) * 100 : 0;
    return {
      categoria:               cat,                          // null = sin categoría
      categoria_label:         cat || 'Sin categoría',
      count_empresas:          parseInt(empBase?.count_empresas || 0),
      total_asignado:          totalAsignado,
      total_gastado:           totalGastado,
      total_disponible:        disponible,
      pct_consumido:           Math.round(pct * 10) / 10,    // 1 decimal
      num_envios:              parseInt(envBase.num_envios || 0),
      num_envios_con_costo:    parseInt(envBase.num_envios_con_costo || 0),
      total_descuento_envios:  parseFloat(envBase.total_descuento_envios || 0)
    };
  });

  // 4. Totales globales
  const totales = porCategoria.reduce((acc, r) => ({
    count_empresas:         acc.count_empresas + r.count_empresas,
    total_asignado:         acc.total_asignado + r.total_asignado,
    total_gastado:          acc.total_gastado + r.total_gastado,
    total_disponible:       acc.total_disponible + r.total_disponible,
    num_envios:             acc.num_envios + r.num_envios,
    num_envios_con_costo:   acc.num_envios_con_costo + r.num_envios_con_costo,
    total_descuento_envios: acc.total_descuento_envios + r.total_descuento_envios
  }), {
    count_empresas: 0, total_asignado: 0, total_gastado: 0, total_disponible: 0,
    num_envios: 0, num_envios_con_costo: 0, total_descuento_envios: 0
  });
  totales.pct_consumido = totales.total_asignado > 0
    ? Math.round((totales.total_gastado / totales.total_asignado) * 1000) / 10
    : 0;

  return { por_categoria: porCategoria, totales };
}

module.exports = {
  buscarPorNit, crear, actualizar, list, obtenerConDetalle,
  reasignarAsesor, actualizarCategoria, ajustarPresupuesto, movimientosPresupuesto,
  reportePresupuestoFidelizPorCategoria, empresaIdsAccesibles,
  DuplicateError, CATEGORIAS_VALIDAS
};
