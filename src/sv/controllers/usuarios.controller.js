/**
 * sv/controllers/usuarios.controller.js
 * CRUD de usuarios SerVentas + reset password + toggle activo.
 */
const { Op } = require('sequelize');
const { SvUsuario, SvRol, SvArea, SvGrupo, SvPunto } = require('../models');
const { hash } = require('../utils/password');
const { ok, created, fail, noContent } = require('../utils/response');
const { ERROR_CODES, ROLES } = require('../config/constants');
const { usuariosAccesibles } = require('../utils/acceso');

const usuariosAd  = require('../services/usuariosAd.service');
const directorioAd = require('../services/directorioAd.service');

const HTTP_AD = {
  AD_USUARIO_NO_EXISTE: 422,
  AD_USUARIO_INVALIDO:  422,
  AD_USUARIO_TOMADO:    409,
  CORREO_CON_OTRO_AD:   409,
  AD_NO_DISPONIBLE:     503
};

function manejarErrorAd(res, e) {
  const status = HTTP_AD[e.code];
  if (!status) throw e;
  return fail(res, status, status === 422 ? ERROR_CODES.VALIDATION_ERROR : e.code, e.message);
}

async function conAdUsuario(rows) {
  const mapa = await usuariosAd.adUsuariosPorIdentidad(rows.map(r => r.usr_id_identidad));
  return rows.map(r => ({ ...r.toJSON(), ad_usuario: mapa.get(r.usr_id_identidad) ?? null }));
}

function adminAreaFilter(req) {
  const c = req.user.rol?.rol_codigo;
  // Visión absolutamente global: solo SUPER_ADMIN.
  if (c === ROLES.SUPER_ADMIN) return {};
  if (c === ROLES.ADMIN_AREA)  return { usr_area_id: req.user.usr_area_id };
  // JEFE_PAP: solo ve usuarios del grupo PAP (3)
  if (c === ROLES.JEFE_PAP) return { usr_grupo_id: 3 };
  // Roles multi-área: filtran por área principal + áreas extra (asignadas en
  // sv_org_usuario_areas). Cubre SUPERVISOR, COORDINADOR_PREVISION, DIRECTOR_COMERCIAL
  // y GERENTE_GENERAL. La diferencia entre ellos es CUÁNTAS áreas tienen:
  //   - SUPERVISOR / COORDINADOR: típicamente 1 (su área principal).
  //   - DIRECTOR_COMERCIAL: 3 (EMP+PAP+SVC, sin PRENEC).
  //   - GERENTE_GENERAL: típicamente 4 (todas).
  if (c === ROLES.SUPERVISOR
   || c === ROLES.COORDINADOR_PREVISION
   || c === ROLES.DIRECTOR_COMERCIAL
   || c === ROLES.GERENTE_GENERAL) {
    const areaIds = new Set();
    if (req.user.usr_area_id) areaIds.add(req.user.usr_area_id);
    for (const a of (req.user.areasExtra || [])) areaIds.add(a.area_id);
    if (areaIds.size === 0) return null;  // sin áreas asignadas = sin acceso
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
  return ok(res, await conAdUsuario(usuarios));
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
  return ok(res, (await conAdUsuario([u]))[0]);
}

async function create(req, res) {
  const { ad_usuario: adUsuario, ...data } = req.body;
  // ADMIN_AREA solo puede crear usuarios de su propia área
  if (req.user.rol?.rol_codigo === ROLES.ADMIN_AREA) {
    data.usr_area_id = req.user.usr_area_id;
  }
  data.usr_email = data.usr_email.toLowerCase().trim();

  try {
    data.usr_id_identidad = await usuariosAd.resolverIdentidad({
      adUsuario,
      email:          data.usr_email,
      nombre:         data.usr_nombre,
      apellido:       data.usr_apellido,
      telefono:       data.usr_telefono,
      permitirCambio: false
    });
  } catch (e) { return manejarErrorAd(res, e); }

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
  const { ad_usuario: adUsuario, ...data } = req.body;
  if (data.usr_email) data.usr_email = data.usr_email.toLowerCase().trim();
  // ADMIN_AREA no puede mover usuarios fuera de su área
  if (req.user.rol?.rol_codigo === ROLES.ADMIN_AREA) {
    delete data.usr_area_id;
  }
  if (adUsuario !== undefined) {
    try {
      data.usr_id_identidad = await usuariosAd.resolverIdentidad({
        adUsuario,
        email:             data.usr_email    || u.usr_email,
        nombre:            data.usr_nombre   || u.usr_nombre,
        apellido:          data.usr_apellido || u.usr_apellido,
        telefono:          data.usr_telefono ?? u.usr_telefono,
        idIdentidadActual: u.usr_id_identidad || null,
        permitirCambio:    !!u.usr_id_identidad
      });
    } catch (e) { return manejarErrorAd(res, e); }
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

/**
 * GET /usuarios/accesibles
 * Devuelve EXACTAMENTE el scope de usuariosAccesibles(actor) — el mismo
 * usado por agenda.listarSemana / eventosAgenda.listado — para que los
 * selectores de asesores del frontend no muestren usuarios que luego el
 * backend rechazará con 403 (mismatch área vs. grupo, SP-2 hotfix).
 * Autenticado (svAuth), sin gate de rol: cada quien recibe SU propio scope.
 */
async function accesibles(req, res) {
  const scope = await usuariosAccesibles(req.user);
  // scope es null (super_admin) o array. Si null, devolver todos los activos.
  const where = { usr_activo: 1 };
  if (Array.isArray(scope)) where.usr_id = { [Op.in]: scope };
  const rows = await SvUsuario.findAll({
    where,
    attributes: ['usr_id', 'usr_nombre', 'usr_apellido', 'usr_email'],
    include: [{ model: SvRol, as: 'rol', attributes: ['rol_codigo', 'rol_nombre'] }],
    order: [['usr_nombre', 'ASC'], ['usr_apellido', 'ASC']]
  });
  return ok(res, rows);
}

/**
 * GET /usuarios/directorio?q=
 * Busca cuentas del directorio activo para el alta (roles admin).
 */
async function directorio(req, res) {
  try {
    return ok(res, await directorioAd.buscar(req.query.q));
  } catch (e) {
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    return manejarErrorAd(res, e);
  }
}

module.exports = { list, getOne, create, update, toggle, resetPassword, accesibles, directorio };
