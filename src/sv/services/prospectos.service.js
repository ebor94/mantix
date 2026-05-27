/**
 * sv/services/prospectos.service.js
 * CRUD de prospectos + Panel del Día + filtros por scope (área/grupo/asesor).
 */
const { Op, fn, col, literal } = require('sequelize');
const {
  sequelize, SvProspecto, SvProspectoProducto, SvPersona, SvUsuario, SvEstado,
  SvFuente, SvPunto, SvLista, SvGestion, SvResultado, SvEmpresa
} = require('../models');
const { aISO, hoyISO, rangoDia } = require('../utils/fechas');

// Construye WHERE base según el scope del usuario
function buildScopeWhere(scope) {
  const w = { prosp_activo: 1 };
  if (scope?.asesorId) w.prosp_asesor_id = scope.asesorId;
  else if (scope?.grupoId) w.prosp_grupo_id = scope.grupoId;
  else if (scope?.areaId)  w.prosp_area_id  = scope.areaId;
  return w;
}

// Para el filtro_rapido del Mis Clientes
function applyFiltroRapido(where, filtro) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  // Subquery: estados NO finales (los que aún requieren gestión)
  const noFinales = literal(`(SELECT estado_id FROM sv_cfg_estados_gestion WHERE estado_es_final = 0)`);
  switch (filtro) {
    case 'urgentes':
      where.prosp_prox_gestion_fecha = { [Op.lt]: hoy };
      where.prosp_estado_id = { [Op.in]: noFinales };
      break;
    case 'hoy':
      where.prosp_prox_gestion_fecha = hoy.toISOString().slice(0, 10);
      where.prosp_estado_id = { [Op.in]: noFinales };
      break;
    case 'proximas':
      where.prosp_prox_gestion_fecha = { [Op.gt]: hoy };
      where.prosp_estado_id = { [Op.in]: noFinales };
      break;
    case 'sin_gestion':
      where.prosp_prox_gestion_fecha = { [Op.is]: null };
      where.prosp_estado_id = { [Op.in]: noFinales };
      break;
    case 'cerrados':
      // Cerrados = inactivos por flag o estado final ganado (lo manejamos por estado_es_ganado vía include en query)
      where['$estado.estado_es_ganado$'] = 1;
      break;
  }
}

async function list({ scope, filtros = {}, page = 1, limit = 20 }) {
  const where = buildScopeWhere(scope);
  // Filtros de contexto (área/grupo): el frontend los pasa según la vista activa
  // para que multi-área no mezcle datos de áreas distintas.
  // Estos filtros se intersectan con el scope del usuario (no lo amplían).
  if (filtros.area_id)     where.prosp_area_id     = parseInt(filtros.area_id);
  if (filtros.grupo_id)    where.prosp_grupo_id    = parseInt(filtros.grupo_id);
  if (filtros.estado_id)   where.prosp_estado_id   = parseInt(filtros.estado_id);
  if (filtros.fuente_id)   where.prosp_fuente_id   = parseInt(filtros.fuente_id);
  if (filtros.punto_id)    where.prosp_punto_id    = parseInt(filtros.punto_id);
  if (filtros.lista_id)    where.prosp_lista_id    = parseInt(filtros.lista_id);
  if (filtros.zona_pap)    where.prosp_zona_pap    = filtros.zona_pap;
  if (filtros.subproceso)  where.prosp_subproceso  = filtros.subproceso;   // SVC comercial
  // Filtro por código de estado (más legible que id): ej. "VOLVER", "AFILIADO"
  if (filtros.estado_codigo) where['$estado.estado_codigo$'] = filtros.estado_codigo;
  if (filtros.prox_gestion_fecha) where.prosp_prox_gestion_fecha = filtros.prox_gestion_fecha;
  if (filtros.prox_gestion_mes) {
    const [y, m] = filtros.prox_gestion_mes.split('-').map(Number);
    const inicio = new Date(y, m - 1, 1);
    const fin    = new Date(y, m,     1);
    where.prosp_prox_gestion_fecha = { [Op.gte]: inicio, [Op.lt]: fin };
  }

  if (filtros.q) {
    const q = `%${filtros.q}%`;
    where[Op.or] = [
      { '$persona.persona_nombre$':   { [Op.like]: q } },
      { '$persona.persona_apellido$': { [Op.like]: q } },
      { '$persona.persona_telefono_norm$': { [Op.like]: q.replace(/[\s\-+]/g, '') } },
      { '$persona.persona_email$':    { [Op.like]: q } }
    ];
  }

  if (filtros.filtro_rapido) applyFiltroRapido(where, filtros.filtro_rapido);

  const offset = (parseInt(page) - 1) * parseInt(limit);

  const { rows, count } = await SvProspecto.findAndCountAll({
    where,
    include: [
      { model: SvPersona, as: 'persona' },
      { model: SvEmpresa, as: 'empresa', attributes: ['empresa_id','empresa_nit','empresa_razon_social','empresa_nombre_comercial','empresa_sector'] },
      { model: SvPersona, as: 'contacto' },
      { model: SvEstado,  as: 'estado' },
      { model: SvUsuario, as: 'asesor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] },
      { model: SvFuente,  as: 'fuente', attributes: ['fuente_id', 'fuente_codigo', 'fuente_nombre'] }
    ],
    order: [['prosp_prox_gestion_fecha', 'ASC'], ['prosp_prox_gestion_hora', 'ASC']],
    limit: parseInt(limit),
    offset,
    distinct: true
  });

  return { items: rows, total: count, page: parseInt(page), limit: parseInt(limit) };
}

// Panel del día: 4 categorías ejecutadas en paralelo
async function panelDia({ scope, fecha, areaId, grupoId, subproceso }) {
  const hoy = aISO(fecha) || hoyISO();
  const { start: diaStart, end: diaEnd } = rangoDia(hoy);
  const baseWhere = buildScopeWhere(scope);
  // Filtro de contexto (área activa) — evita que multi-área mezcle
  if (areaId)     baseWhere.prosp_area_id    = parseInt(areaId);
  if (grupoId)    baseWhere.prosp_grupo_id   = parseInt(grupoId);
  if (subproceso) baseWhere.prosp_subproceso = subproceso;
  const includes = [
    { model: SvPersona, as: 'persona' },
    { model: SvEstado,  as: 'estado' },
    { model: SvUsuario, as: 'asesor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
  ];

  // Subquery: ids de estados FINAL (Contrato firmado, Cerrado, Perdido...). Estos
  // prospectos se excluyen de urgentes/hoy/nuevos porque ya no requieren gestión.
  const estadosNoFinales = literal(`(SELECT estado_id FROM sv_cfg_estados_gestion WHERE estado_es_final = 0)`);

  const [urgentes, hoyItems, nuevos, completadosHoy] = await Promise.all([
    SvProspecto.findAll({
      where: {
        ...baseWhere,
        prosp_prox_gestion_fecha: { [Op.lt]: hoy },
        prosp_estado_id: { [Op.in]: estadosNoFinales }
      },
      include: includes,
      order: [['prosp_prox_gestion_fecha', 'ASC'], ['prosp_prox_gestion_hora', 'ASC']],
      limit: 50
    }),
    SvProspecto.findAll({
      where: {
        ...baseWhere,
        prosp_prox_gestion_fecha: hoy,
        prosp_estado_id: { [Op.in]: estadosNoFinales }
      },
      include: includes,
      order: [['prosp_prox_gestion_hora', 'ASC']],
      limit: 100
    }),
    SvProspecto.findAll({
      where: { ...baseWhere, prosp_estado_id: { [Op.in]: literal(`(SELECT estado_id FROM sv_cfg_estados_gestion WHERE estado_codigo = 'NUEVO')`) } },
      include: includes,
      order: [['prosp_created_at', 'DESC']],
      limit: 50
    }),
    SvGestion.findAll({
      where: {
        ...(scope?.asesorId ? { gest_asesor_id: scope.asesorId } : {}),
        gest_fecha_hora: { [Op.gte]: diaStart, [Op.lte]: diaEnd }
      },
      include: [
        { model: SvProspecto, as: 'prospecto', include: [{ model: SvPersona, as: 'persona' }] },
        { model: SvResultado, as: 'resultado' }
      ],
      order: [['gest_fecha_hora', 'DESC']],
      limit: 50
    })
  ]);

  return { urgentes, hoy: hoyItems, nuevos, completados_hoy: completadosHoy, fecha: hoy };
}

// Conteo de eventos por día del mes (para colorear dots del MiniCalendar)
// Excluye prospectos en estados FINAL (firmado/cerrado/perdido) — ya no requieren gestión.
async function agendaMes({ scope, anio, mes }) {
  const baseWhere = buildScopeWhere(scope);
  const inicio = new Date(anio, mes - 1, 1);
  const fin    = new Date(anio, mes,     1);
  const estadosNoFinales = literal(`(SELECT estado_id FROM sv_cfg_estados_gestion WHERE estado_es_final = 0)`);
  const rows = await SvProspecto.findAll({
    where: {
      ...baseWhere,
      prosp_prox_gestion_fecha: { [Op.gte]: inicio, [Op.lt]: fin },
      prosp_estado_id: { [Op.in]: estadosNoFinales }
    },
    attributes: [
      'prosp_prox_gestion_fecha',
      [fn('COUNT', col('prosp_id')), 'total'],
      [fn('SUM', literal('CASE WHEN prosp_prox_gestion_fecha < CURDATE() THEN 1 ELSE 0 END')), 'vencidas']
    ],
    group: ['prosp_prox_gestion_fecha'],
    raw: true
  });
  return rows;
}

async function obtenerCompleto(id) {
  return SvProspecto.findByPk(id, {
    include: [
      { model: SvPersona, as: 'persona' },
      { model: SvEmpresa, as: 'empresa' },
      { model: SvPersona, as: 'contacto' },
      { model: SvEstado,  as: 'estado' },
      { model: SvUsuario, as: 'asesor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido', 'usr_email'] },
      { model: SvFuente,  as: 'fuente' },
      { model: SvPunto,   as: 'punto'  },
      { model: SvLista,   as: 'lista', attributes: ['lista_id', 'lista_nombre'] },
      { model: SvProspectoProducto, as: 'productos', include: ['producto'] }
    ]
  });
}

async function crear(payload, asesorId) {
  const t = await sequelize.transaction();
  try {
    const productos = payload.productos || []; // [{prod_id, es_principal, nota}]
    delete payload.productos;

    const data = {
      prosp_area_id:    payload.prosp_area_id,
      prosp_grupo_id:   payload.prosp_grupo_id,
      prosp_persona_id: payload.prosp_persona_id || null,
      prosp_empresa_id: payload.prosp_empresa_id || null,
      prosp_contacto_empresa_id: payload.prosp_contacto_empresa_id || null,
      prosp_asesor_id:  payload.prosp_asesor_id || asesorId,
      prosp_estado_id:  payload.prosp_estado_id,
      prosp_fuente_id:  payload.prosp_fuente_id || null,
      prosp_punto_id:   payload.prosp_punto_id  || null,
      prosp_lista_id:   payload.prosp_lista_id  || null,
      prosp_prox_gestion_fecha: payload.prosp_prox_gestion_fecha || null,
      prosp_prox_gestion_hora:  payload.prosp_prox_gestion_hora  || null,
      prosp_prioridad:  payload.prosp_prioridad || 3,
      prosp_zona_pap:   payload.prosp_zona_pap || null,
      prosp_subproceso: payload.prosp_subproceso || null,
      prosp_nota_inicial: payload.prosp_nota_inicial || null
    };
    const p = await SvProspecto.create(data, { transaction: t });

    for (const prod of productos) {
      await SvProspectoProducto.create({
        pp_prosp_id: p.prosp_id,
        pp_prod_id:  prod.prod_id,
        pp_es_principal: prod.es_principal ? 1 : 0,
        pp_nota: prod.nota || null
      }, { transaction: t });
    }
    await t.commit();
    return obtenerCompleto(p.prosp_id);
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

async function actualizar(id, payload) {
  const p = await SvProspecto.findByPk(id);
  if (!p) { const e = new Error('Prospecto no encontrado'); e.code = 'NOT_FOUND'; throw e; }
  // Solo campos editables vía PUT (no usar para cambiar estado — eso va por gestiones)
  const editables = ['prosp_prox_gestion_fecha', 'prosp_prox_gestion_hora', 'prosp_prioridad',
                     'prosp_zona_pap', 'prosp_nota_inicial', 'prosp_punto_id', 'prosp_fuente_id'];
  const data = {};
  for (const k of editables) if (payload[k] !== undefined) data[k] = payload[k];
  await p.update(data);
  return obtenerCompleto(id);
}

/**
 * Reemplaza la lista de productos de interés de un prospecto.
 * payload.productos = [{ prod_id, es_principal, nota }]
 *
 * Estrategia: borrar los actuales e insertar los nuevos en transacción.
 * (Más simple que diffear y mantiene el orden + es_principal coherente.)
 */
async function actualizarProductos(prospId, productos = []) {
  const p = await SvProspecto.findByPk(prospId);
  if (!p) { const e = new Error('Prospecto no encontrado'); e.code = 'NOT_FOUND'; throw e; }

  // Validar: máximo 1 principal
  const principales = productos.filter(x => x.es_principal).length;
  if (principales > 1) {
    const e = new Error('Solo puede haber un producto principal'); e.code = 'VALIDATION_ERROR'; throw e;
  }

  const t = await sequelize.transaction();
  try {
    await SvProspectoProducto.destroy({ where: { pp_prosp_id: prospId }, transaction: t });
    for (const prod of productos) {
      if (!prod.prod_id) continue;
      await SvProspectoProducto.create({
        pp_prosp_id:     prospId,
        pp_prod_id:      prod.prod_id,
        pp_es_principal: prod.es_principal ? 1 : 0,
        pp_nota:         prod.nota || null
      }, { transaction: t });
    }
    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }
  return obtenerCompleto(prospId);
}

async function reasignar(id, nuevoAsesorId) {
  const p = await SvProspecto.findByPk(id);
  if (!p) { const e = new Error('Prospecto no encontrado'); e.code = 'NOT_FOUND'; throw e; }
  await p.update({ prosp_asesor_id: nuevoAsesorId });
  return obtenerCompleto(id);
}

/**
 * Conteo de prospectos activos por asesor (para vista de reasignación).
 * Si se pasa areaId o grupoId, filtra por ese alcance.
 */
async function prospectosPorAsesor({ areaId = null, grupoId = null } = {}) {
  const where = { prosp_activo: 1, prosp_asesor_id: { [Op.ne]: null } };
  if (areaId)  where.prosp_area_id  = parseInt(areaId);
  if (grupoId) where.prosp_grupo_id = parseInt(grupoId);

  const rows = await SvProspecto.findAll({
    where,
    attributes: [
      'prosp_asesor_id',
      [require('sequelize').fn('COUNT', require('sequelize').col('prosp_id')), 'total']
    ],
    group: ['prosp_asesor_id'],
    raw: true
  });

  // Enriquecer con datos del asesor
  const ids = rows.map(r => r.prosp_asesor_id);
  if (!ids.length) return [];
  const usuarios = await SvUsuario.findAll({
    where: { usr_id: ids },
    attributes: ['usr_id', 'usr_nombre', 'usr_apellido', 'usr_email', 'usr_area_id', 'usr_grupo_id', 'usr_activo']
  });
  const mapU = new Map(usuarios.map(u => [u.usr_id, u]));

  return rows.map(r => ({
    asesor:        mapU.get(r.prosp_asesor_id) || null,
    asesor_id:     r.prosp_asesor_id,
    total_activos: parseInt(r.total)
  })).sort((a, b) => b.total_activos - a.total_activos);
}

/**
 * Reasignación masiva de TODOS los prospectos activos de un asesor origen
 * hacia uno o más asesores destino (round-robin o todo a uno).
 *
 * payload = {
 *   asesor_origen_id (required),
 *   asesor_destino_id (opcional — si null, requiere asesores_destino[])
 *   asesores_destino (opcional [int] — distribución round-robin)
 *   solo_estados_no_finales (default true) — no reasigna ganados/perdidos
 *   motivo (string) — se registra como gestión "Reasignación masiva: motivo"
 *   area_id / grupo_id (opcional) — filtra qué prospectos del origen mover
 * }
 *
 * Retorna: { reasignados, distribucion: { asesor_id: count }, prospectos_no_reasignados }
 */
async function reasignacionMasiva(payload, usuarioActorId) {
  const {
    asesor_origen_id,
    asesor_destino_id = null,
    asesores_destino = [],
    solo_estados_no_finales = true,
    motivo = 'Reasignación masiva',
    area_id = null,
    grupo_id = null
  } = payload;

  if (!asesor_origen_id) {
    const e = new Error('asesor_origen_id requerido'); e.code = 'VALIDATION_ERROR'; throw e;
  }

  // Construir lista efectiva de destinos
  const destinos = asesor_destino_id ? [asesor_destino_id] : asesores_destino;
  if (!destinos.length) {
    const e = new Error('Debe indicar asesor_destino_id o asesores_destino[]'); e.code = 'VALIDATION_ERROR'; throw e;
  }

  // Validar que los destinos no incluyan al origen
  if (destinos.includes(asesor_origen_id)) {
    const e = new Error('El asesor destino no puede ser el mismo que el origen'); e.code = 'VALIDATION_ERROR'; throw e;
  }

  // Buscar prospectos del origen
  const where = { prosp_activo: 1, prosp_asesor_id: asesor_origen_id };
  if (area_id)  where.prosp_area_id  = parseInt(area_id);
  if (grupo_id) where.prosp_grupo_id = parseInt(grupo_id);

  const include = solo_estados_no_finales
    ? [{ model: SvEstado, as: 'estado', where: { estado_es_final: 0 }, required: true, attributes: ['estado_id', 'estado_es_final'] }]
    : [{ model: SvEstado, as: 'estado', attributes: ['estado_id', 'estado_es_final'] }];

  const prospectos = await SvProspecto.findAll({ where, include });
  if (!prospectos.length) {
    return { reasignados: 0, distribucion: {}, prospectos_no_reasignados: 0 };
  }

  // Distribución round-robin
  const distribucion = {};
  destinos.forEach(d => distribucion[d] = 0);

  let i = 0;
  const t = await sequelize.transaction();
  try {
    for (const p of prospectos) {
      const destino = destinos[i % destinos.length];
      await p.update({ prosp_asesor_id: destino }, { transaction: t });
      // Insertar gestión inmutable como traza
      await SvGestion.create({
        gest_prosp_id:    p.prosp_id,
        gest_asesor_id:   usuarioActorId,
        gest_canal:       'sistema',
        gest_comentario:  `[Reasignación masiva] de asesor #${asesor_origen_id} a asesor #${destino}. Motivo: ${motivo}`
      }, { transaction: t });
      distribucion[destino] += 1;
      i += 1;
    }
    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }

  return {
    reasignados: prospectos.length,
    distribucion,
    prospectos_no_reasignados: 0
  };
}

/**
 * Lista prospectos SIN asesor asignado (cola de distribución para supervisor).
 */
async function sinAsignar({ areaId, grupoId, scope, page = 1, limit = 50 }) {
  const where = { prosp_activo: 1, prosp_asesor_id: null };
  if (areaId)  where.prosp_area_id  = parseInt(areaId);
  if (grupoId) where.prosp_grupo_id = parseInt(grupoId);

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows, count } = await SvProspecto.findAndCountAll({
    where,
    include: [
      { model: SvPersona, as: 'persona' },
      { model: SvEstado,  as: 'estado' },
      { model: SvFuente,  as: 'fuente', attributes: ['fuente_id', 'fuente_codigo', 'fuente_nombre'] },
      { model: SvArea,    as: 'area',   attributes: ['area_id', 'area_codigo', 'area_nombre', 'area_color_hex'] }
    ],
    order: [['prosp_created_at', 'ASC']],   // los más antiguos primero (FIFO)
    limit: parseInt(limit), offset
  });
  return { items: rows, total: count, page: parseInt(page), limit: parseInt(limit) };
}

/**
 * Cuenta prospectos sin asignar por área (para badges).
 */
async function contadorSinAsignar(areaId) {
  return SvProspecto.count({
    where: {
      prosp_activo: 1,
      prosp_asesor_id: null,
      ...(areaId ? { prosp_area_id: parseInt(areaId) } : {})
    }
  });
}

module.exports = {
  list, panelDia, agendaMes, obtenerCompleto, crear, actualizar, actualizarProductos,
  reasignar, reasignacionMasiva, prospectosPorAsesor,
  sinAsignar, contadorSinAsignar, buildScopeWhere
};
