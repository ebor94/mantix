/**
 * sv/services/empresas.service.js
 * CRUD + anti-duplicados de empresas B2B.
 * UNIQUE real: empresa_nit_norm (solo dígitos sin DV).
 */
const { Op } = require('sequelize');
const { sequelize, SvEmpresa, SvProspecto, SvPersona, SvEstado, SvUsuario, SvGestion, SvResultado, SvFidelizMovimiento } = require('../models');
const { parse, normalizar, esValido } = require('../utils/nit');

const CATEGORIAS_VALIDAS = ['BRONCE', 'PLATA', 'ORO', 'PLATINO', 'DIAMANTE'];

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

async function list({ filtros = {}, scope, page = 1, limit = 20 }) {
  const where = { empresa_activa: 1 };
  if (filtros.q) {
    const q = `%${filtros.q}%`;
    where[Op.or] = [
      { empresa_razon_social:     { [Op.like]: q } },
      { empresa_nombre_comercial: { [Op.like]: q } },
      { empresa_nit_norm:         { [Op.like]: q.replace(/\D/g, '%') } }
    ];
  }
  if (filtros.sector) where.empresa_sector = filtros.sector;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows, count } = await SvEmpresa.findAndCountAll({
    where, order: [['empresa_razon_social', 'ASC']],
    limit: parseInt(limit), offset
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
  const empresa = await SvEmpresa.findByPk(id);
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
    // Contactos = personas que son contacto de algún prospecto de esta empresa
    SvPersona.findAll({
      include: [{
        model: SvProspecto, as: 'prospectos', required: true, attributes: [],
        where: { prosp_empresa_id: id }
      }],
      group: ['SvPersona.persona_id']
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
  return { reasignados: prospectos.length, nuevoAsesor: destino.usr_id };
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

module.exports = {
  buscarPorNit, crear, actualizar, list, obtenerConDetalle,
  reasignarAsesor, actualizarCategoria, ajustarPresupuesto, movimientosPresupuesto,
  DuplicateError, CATEGORIAS_VALIDAS
};
