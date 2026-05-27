/**
 * sv/services/empresas.service.js
 * CRUD + anti-duplicados de empresas B2B.
 * UNIQUE real: empresa_nit_norm (solo dígitos sin DV).
 */
const { Op } = require('sequelize');
const { SvEmpresa, SvProspecto, SvPersona, SvEstado, SvUsuario, SvGestion, SvResultado } = require('../models');
const { parse, normalizar, esValido } = require('../utils/nit');

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

module.exports = { buscarPorNit, crear, actualizar, list, obtenerConDetalle, DuplicateError };
