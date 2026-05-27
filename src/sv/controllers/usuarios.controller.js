/**
 * sv/controllers/usuarios.controller.js
 * CRUD de usuarios SerVentas + reset password + toggle activo.
 */
const { Op } = require('sequelize');
const { SvUsuario, SvRol, SvArea, SvGrupo, SvPunto } = require('../models');
const { hash } = require('../utils/password');
const { ok, created, fail, noContent } = require('../utils/response');
const { ERROR_CODES, ROLES } = require('../config/constants');

function adminAreaFilter(req) {
  const c = req.user.rol?.rol_codigo;
  if (c === ROLES.SUPER_ADMIN) return {};
  if (c === ROLES.ADMIN_AREA)  return { usr_area_id: req.user.usr_area_id };
  // JEFE_PAP: solo ve usuarios del grupo PAP (3)
  if (c === ROLES.JEFE_PAP) return { usr_grupo_id: 3 };
  // SUPERVISOR: ve usuarios de su área principal y de sus áreas extra (multi-área)
  if (c === ROLES.SUPERVISOR) {
    const areaIds = new Set();
    if (req.user.usr_area_id) areaIds.add(req.user.usr_area_id);
    for (const a of (req.user.areasExtra || [])) areaIds.add(a.area_id);
    return { usr_area_id: { [Op.in]: [...areaIds] } };
  }
  return null;
}

async function list(req, res) {
  const scopeWhere = adminAreaFilter(req);
  if (scopeWhere === null) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Sin permiso');

  const where = { ...scopeWhere };
  if (req.query.q) {
    const q = `%${req.query.q}%`;
    where[Op.or] = [
      { usr_nombre:   { [Op.like]: q } },
      { usr_apellido: { [Op.like]: q } },
      { usr_email:    { [Op.like]: q } }
    ];
  }
  if (req.query.area_id)  where.usr_area_id  = parseInt(req.query.area_id);
  if (req.query.grupo_id) where.usr_grupo_id = parseInt(req.query.grupo_id);
  if (req.query.activo === '0' || req.query.activo === '1') where.usr_activo = parseInt(req.query.activo);

  const usuarios = await SvUsuario.findAll({
    where,
    include: [
      { model: SvRol,   as: 'rol',   attributes: ['rol_id','rol_codigo','rol_nombre','rol_nivel'] },
      { model: SvArea,  as: 'area',  attributes: ['area_id','area_codigo','area_nombre','area_color_hex'] },
      { model: SvGrupo, as: 'grupo', attributes: ['grupo_id','grupo_codigo','grupo_nombre'] },
      { model: SvPunto, as: 'punto', attributes: ['punto_id','punto_codigo','punto_nombre'] }
    ],
    order: [['usr_id', 'ASC']]
  });
  return ok(res, usuarios);
}

async function getOne(req, res) {
  const id = parseInt(req.params.id);
  const u = await SvUsuario.findByPk(id, {
    include: [
      { model: SvRol,   as: 'rol' },
      { model: SvArea,  as: 'area' },
      { model: SvGrupo, as: 'grupo' },
      { model: SvPunto, as: 'punto' }
    ]
  });
  if (!u) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Usuario no encontrado');
  if (req.user.rol?.rol_codigo === ROLES.ADMIN_AREA && u.usr_area_id !== req.user.usr_area_id) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu área');
  }
  return ok(res, u);
}

async function create(req, res) {
  const data = { ...req.body };
  // ADMIN_AREA solo puede crear usuarios de su propia área
  if (req.user.rol?.rol_codigo === ROLES.ADMIN_AREA) {
    data.usr_area_id = req.user.usr_area_id;
  }
  data.usr_email = data.usr_email.toLowerCase().trim();
  data.usr_password_hash = await hash(data.usr_password);
  delete data.usr_password;

  try {
    const u = await SvUsuario.create(data);
    return created(res, await SvUsuario.findByPk(u.usr_id, {
      include: [{ model: SvRol, as: 'rol' }]
    }));
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      return fail(res, 409, ERROR_CODES.DUPLICATE_EMAIL, 'Email ya registrado');
    }
    throw e;
  }
}

async function update(req, res) {
  const id = parseInt(req.params.id);
  const u  = await SvUsuario.findByPk(id);
  if (!u) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Usuario no encontrado');
  if (req.user.rol?.rol_codigo === ROLES.ADMIN_AREA && u.usr_area_id !== req.user.usr_area_id) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu área');
  }
  const data = { ...req.body };
  if (data.usr_email) data.usr_email = data.usr_email.toLowerCase().trim();
  // ADMIN_AREA no puede mover usuarios fuera de su área
  if (req.user.rol?.rol_codigo === ROLES.ADMIN_AREA) {
    delete data.usr_area_id;
  }
  await u.update(data);
  return ok(res, u);
}

async function toggle(req, res) {
  const id = parseInt(req.params.id);
  const u  = await SvUsuario.findByPk(id);
  if (!u) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Usuario no encontrado');
  if (req.user.rol?.rol_codigo === ROLES.ADMIN_AREA && u.usr_area_id !== req.user.usr_area_id) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu área');
  }
  await u.update({ usr_activo: u.usr_activo ? 0 : 1 });
  return ok(res, u);
}

async function resetPassword(req, res) {
  const id = parseInt(req.params.id);
  const u  = await SvUsuario.findByPk(id);
  if (!u) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Usuario no encontrado');
  if (req.user.rol?.rol_codigo === ROLES.ADMIN_AREA && u.usr_area_id !== req.user.usr_area_id) {
    return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu área');
  }
  await u.update({ usr_password_hash: await hash(req.body.nueva) });
  return ok(res, { ok: true });
}

module.exports = { list, getOne, create, update, toggle, resetPassword };
