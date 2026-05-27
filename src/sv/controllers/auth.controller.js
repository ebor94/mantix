/**
 * sv/controllers/auth.controller.js
 * Login + refresh + logout + me (SerVentas).
 */
const { Op } = require('sequelize');
const { SvUsuario, SvRol, SvArea, SvGrupo, SvPunto, SvSesion } = require('../models');
const { signAccess, signRefresh, verifyRefresh } = require('../utils/jwt');
const { compare } = require('../utils/password');
const { sha256 } = require('../utils/hashRefresh');
const { ok, fail, noContent } = require('../utils/response');
const { ERROR_CODES, JWT } = require('../config/constants');

// Parser ligero de duraciones tipo "7d", "15m", "12h", "30s"
function parseDuration(str) {
  const m = String(str).match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = unit === 's' ? 1000
            : unit === 'm' ? 60 * 1000
            : unit === 'h' ? 60 * 60 * 1000
            : 24 * 60 * 60 * 1000;
  return n * mult;
}

function refreshExpiresAt() {
  return new Date(Date.now() + parseDuration(JWT.REFRESH_EXPIRES_IN));
}

function publicUser(u) {
  return {
    usr_id:        u.usr_id,
    usr_email:     u.usr_email,
    usr_nombre:    u.usr_nombre,
    usr_apellido:  u.usr_apellido,
    usr_telefono:  u.usr_telefono,
    usr_area_id:   u.usr_area_id,
    usr_grupo_id:  u.usr_grupo_id,
    usr_punto_id:  u.usr_punto_id,
    usr_preferencias: u.usr_preferencias || null,
    // Fase 7: tracking GPS
    usr_consentimiento_geo_at: u.usr_consentimiento_geo_at || null,
    usr_horario_laboral:       u.usr_horario_laboral || null,
    rol:   u.rol   ? { rol_id: u.rol.rol_id, rol_codigo: u.rol.rol_codigo, rol_nombre: u.rol.rol_nombre, rol_nivel: u.rol.rol_nivel, rol_permisos: u.rol.rol_permisos } : null,
    area:  u.area  ? { area_id: u.area.area_id, area_codigo: u.area.area_codigo, area_nombre: u.area.area_nombre, area_color_hex: u.area.area_color_hex, area_icono: u.area.area_icono } : null,
    grupo: u.grupo ? { grupo_id: u.grupo.grupo_id, grupo_codigo: u.grupo.grupo_codigo, grupo_nombre: u.grupo.grupo_nombre } : null,
    punto: u.punto ? { punto_id: u.punto.punto_id, punto_codigo: u.punto.punto_codigo, punto_nombre: u.punto.punto_nombre } : null,
    // Grupos supervisados: combina grupo principal + grupos extra (multi-grupo)
    grupos_supervisados: gruposSupervisados(u),
    // Áreas accesibles: combina área principal + áreas extra (multi-área)
    areas_accesibles: areasAccesibles(u)
  };
}

/**
 * Combina el área principal (usr_area_id) con las áreas extra (belongsToMany).
 * Devuelve array deduplicado de { area_id, area_codigo, area_nombre, area_color_hex, area_icono }.
 */
function areasAccesibles(u) {
  const lista = [];
  const ids = new Set();
  if (u.area) {
    ids.add(u.area.area_id);
    lista.push({
      area_id:        u.area.area_id,
      area_codigo:    u.area.area_codigo,
      area_nombre:    u.area.area_nombre,
      area_color_hex: u.area.area_color_hex,
      area_icono:     u.area.area_icono,
      principal:      true
    });
  }
  for (const a of (u.areasExtra || [])) {
    if (ids.has(a.area_id)) continue;
    ids.add(a.area_id);
    lista.push({
      area_id:        a.area_id,
      area_codigo:    a.area_codigo,
      area_nombre:    a.area_nombre,
      area_color_hex: a.area_color_hex,
      area_icono:     a.area_icono,
      principal:      false
    });
  }
  return lista;
}

/**
 * Combina el grupo principal (usr_grupo_id) con los grupos extra (belongsToMany).
 * Devuelve array deduplicado de { grupo_id, grupo_codigo, grupo_nombre, grupo_area_id }.
 */
function gruposSupervisados(u) {
  const lista = [];
  const ids = new Set();
  if (u.grupo) {
    ids.add(u.grupo.grupo_id);
    lista.push({
      grupo_id:      u.grupo.grupo_id,
      grupo_codigo:  u.grupo.grupo_codigo,
      grupo_nombre:  u.grupo.grupo_nombre,
      grupo_area_id: u.grupo.grupo_area_id || u.usr_area_id
    });
  }
  for (const g of (u.gruposExtra || [])) {
    if (ids.has(g.grupo_id)) continue;
    ids.add(g.grupo_id);
    lista.push({
      grupo_id:      g.grupo_id,
      grupo_codigo:  g.grupo_codigo,
      grupo_nombre:  g.grupo_nombre,
      grupo_area_id: g.grupo_area_id
    });
  }
  return lista;
}

async function login(req, res) {
  const { email, password } = req.body;

  const usuario = await SvUsuario.scope('withPassword').findOne({
    where: { usr_email: email.toLowerCase().trim() },
    include: [
      { model: SvRol,   as: 'rol' },
      { model: SvArea,  as: 'area' },
      { model: SvGrupo, as: 'grupo' },
      { model: SvPunto, as: 'punto' },
      { model: SvGrupo, as: 'gruposExtra' },
      { model: SvArea,  as: 'areasExtra' }
    ]
  });

  if (!usuario || !usuario.usr_activo) {
    return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'Credenciales inválidas');
  }

  const okPwd = await compare(password, usuario.usr_password_hash);
  if (!okPwd) {
    return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'Credenciales inválidas');
  }

  const accessToken  = signAccess({
    usr_id:       usuario.usr_id,
    rol_codigo:   usuario.rol?.rol_codigo,
    rol_nivel:    usuario.rol?.rol_nivel,
    usr_area_id:  usuario.usr_area_id,
    usr_grupo_id: usuario.usr_grupo_id
  });
  const refreshToken = signRefresh({ usr_id: usuario.usr_id });

  await SvSesion.create({
    sesion_usuario_id:  usuario.usr_id,
    sesion_token_hash:  sha256(refreshToken),
    sesion_dispositivo: (req.headers['user-agent'] || '').slice(0, 200),
    sesion_ip:          req.ip,
    sesion_expires_at:  refreshExpiresAt()
  });

  await usuario.update({ usr_ultimo_login: new Date() }, { silent: true });

  return ok(res, {
    accessToken,
    refreshToken,
    user: publicUser(usuario)
  });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;

  let decoded;
  try { decoded = verifyRefresh(refreshToken); }
  catch { return fail(res, 401, ERROR_CODES.REFRESH_INVALID, 'Refresh token inválido o expirado'); }

  const hash   = sha256(refreshToken);
  const sesion = await SvSesion.findOne({
    where: {
      sesion_usuario_id: decoded.usr_id,
      sesion_token_hash: hash,
      sesion_expires_at: { [Op.gt]: new Date() }
    }
  });
  if (!sesion) {
    return fail(res, 401, ERROR_CODES.REFRESH_INVALID, 'Sesión no encontrada o expirada');
  }

  const usuario = await SvUsuario.findByPk(decoded.usr_id, { include: [{ model: SvRol, as: 'rol' }] });
  if (!usuario || !usuario.usr_activo) {
    return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'Usuario inactivo');
  }

  const accessToken = signAccess({
    usr_id:       usuario.usr_id,
    rol_codigo:   usuario.rol?.rol_codigo,
    rol_nivel:    usuario.rol?.rol_nivel,
    usr_area_id:  usuario.usr_area_id,
    usr_grupo_id: usuario.usr_grupo_id
  });
  return ok(res, { accessToken });
}

async function logout(req, res) {
  const { refreshToken } = req.body || {};
  let usuarioId = null;
  if (refreshToken) {
    const hash = sha256(refreshToken);
    const sesion = await SvSesion.findOne({ where: { sesion_token_hash: hash } });
    if (sesion) {
      usuarioId = sesion.sesion_usuario_id;
      await sesion.destroy();
    }
  }
  // Regenerar snapshot del día para el usuario que cierra sesión (best-effort, no bloquea)
  if (usuarioId) {
    const { generarSnapshot } = require('../services/snapshot.service');
    generarSnapshot(null, usuarioId).catch(() => { /* logueado dentro del service */ });
  }
  return noContent(res);
}

async function me(req, res) {
  return ok(res, publicUser(req.user));
}

async function changePassword(req, res) {
  const { actual, nueva } = req.body;
  const usuario = await SvUsuario.scope('withPassword').findByPk(req.user.usr_id);
  const okPwd = await compare(actual, usuario.usr_password_hash);
  if (!okPwd) return fail(res, 401, ERROR_CODES.UNAUTHORIZED, 'Contraseña actual incorrecta');
  const { hash } = require('../utils/password');
  await usuario.update({ usr_password_hash: await hash(nueva) });
  // Invalidar todas las sesiones del usuario al cambiar password
  await SvSesion.destroy({ where: { sesion_usuario_id: usuario.usr_id } });
  return ok(res, { ok: true });
}

async function updatePreferencias(req, res) {
  const prefs = req.body || {};
  await SvUsuario.update({ usr_preferencias: prefs }, { where: { usr_id: req.user.usr_id } });
  return ok(res, { usr_preferencias: prefs });
}

module.exports = { login, refresh, logout, me, changePassword, updatePreferencias };
