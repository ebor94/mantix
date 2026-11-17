/**
 * identity/services/identidad.service.js
 * Lógica de SSO: login contra el directorio activo, refresh/logout de sesión
 * y aplicaciones disponibles para una identidad.
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { QueryTypes } = require('sequelize');
const { sequelize, OrgIdentidad, OrgSesion, OrgAplicacion } = require('../models');
const jwtId = require('../config/jwt');
const ldap = require('../../h360/services/ldap.service');
const { normalizarAdUsuario, vincularAdUsuario } = require('./vinculoAd.service');

class IdentidadError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const MSG_CREDENCIALES = 'Usuario o contraseña incorrectos';
// ldap.service usa estos textos para clave errada y para cuenta inexistente; se
// unifican para no revelar qué cuentas existen. Sus demás mensajes (cuenta
// bloqueada, clave vencida…) están escritos para mostrarse tal cual.
const MENSAJES_AD_GENERICOS = new Set([MSG_CREDENCIALES, 'Usuario no encontrado en el directorio']);

function normalizarEmail(email) {
  return (email || '').toString().trim().toLowerCase();
}
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function usuarioParaLog(u) {
  return /^[a-z0-9._-]{1,64}$/i.test(u || '') ? u : '[formato no válido]';
}
function log(tag, campos) {
  console.log(JSON.stringify({ tag, ...campos }));
}

async function resolverSam(entrada) {
  if (!entrada.includes('@')) return entrada;
  const identidad = await OrgIdentidad.findOne({ where: { email_norm: normalizarEmail(entrada) } });
  if (!identidad) throw new IdentidadError('CREDENCIALES_INVALIDAS', MSG_CREDENCIALES);
  if (!identidad.ad_usuario) {
    throw new IdentidadError('NO_VINCULADO', 'Inicia sesión con tu usuario de red (el de Windows).');
  }
  return identidad.ad_usuario;
}

async function validarEnDirectorio(sam, password) {
  try {
    return await ldap.validarCredenciales(sam, password);
  } catch (e) {
    if (e.codigo === 'AD_NO_DISPONIBLE') {
      log('AUTH_AD_UNAVAILABLE', { detalle: String(e.message || '').slice(0, 200) });
      throw new IdentidadError('AD_NO_DISPONIBLE', 'No hay conexión con el directorio activo, intenta en unos minutos.');
    }
    log('AUTH_AD_FAIL', { ad_usuario: usuarioParaLog(normalizarAdUsuario(sam)), codigo: e.codigo || 'DESCONOCIDO' });
    const mensaje = e.codigo === 'CREDENCIALES_INVALIDAS' && e.message && !MENSAJES_AD_GENERICOS.has(e.message)
      ? e.message
      : MSG_CREDENCIALES;
    throw new IdentidadError('CREDENCIALES_INVALIDAS', mensaje);
  }
}

async function identidadDeCuentaAd(adUsuario, emailAd) {
  const vinculada = await OrgIdentidad.findOne({ where: { ad_usuario: adUsuario } });
  if (vinculada) return vinculada;
  if (!emailAd) return null;
  const libre = await OrgIdentidad.findOne({ where: { email_norm: normalizarEmail(emailAd), ad_usuario: null } });
  if (!libre) return null;
  await vincularAdUsuario(libre, adUsuario);
  log('AUTH_AD_VINCULADO_AUTO', { ad_usuario: usuarioParaLog(adUsuario), id_identidad: libre.id_identidad });
  return libre;
}

async function login({ usuario, password, ua, ip }) {
  if (typeof usuario !== 'string' || typeof password !== 'string') {
    throw new IdentidadError('VALIDATION_ERROR', 'Usuario y contraseña son requeridos');
  }
  const entrada = usuario.trim();
  if (!entrada || !password) throw new IdentidadError('VALIDATION_ERROR', 'Usuario y contraseña son requeridos');

  const t0 = Date.now();
  const sam = await resolverSam(entrada);
  const ad = await validarEnDirectorio(sam, password);
  const adUsuario = normalizarAdUsuario(ad.usuario);

  const identidad = await identidadDeCuentaAd(adUsuario, ad.email);
  if (!identidad) {
    log('AUTH_AD_SIN_ACCESO', { ad_usuario: usuarioParaLog(adUsuario) });
    throw new IdentidadError('SIN_ACCESO', 'Tu usuario de red no tiene acceso a GenFlow.');
  }
  if (!identidad.activo) throw new IdentidadError('USER_INACTIVE', 'Usuario inactivo');

  const accessToken  = jwtId.signAccess ({ id_identidad: identidad.id_identidad, email: identidad.email_norm });
  const refreshToken = jwtId.signRefresh({ id_identidad: identidad.id_identidad });

  // Persistir sesión con hash del refresh (nunca el token plano)
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14d
  await OrgSesion.create({
    sesion_id:           uuidv4(),
    sesion_identidad_id: identidad.id_identidad,
    sesion_refresh_hash: sha256(refreshToken),
    sesion_ua:           (ua || '').slice(0, 250),
    sesion_ip:           ip || null,
    sesion_expires_at:   expiresAt
  });

  await identidad.update({ ultimo_login: new Date() });
  log('AUTH_AD_OK', { ad_usuario: usuarioParaLog(adUsuario), id_identidad: identidad.id_identidad, ms: Date.now() - t0 });

  return { accessToken, refreshToken, identidad: publicIdentidad(identidad) };
}

async function refresh(refreshToken) {
  let payload;
  try { payload = jwtId.verifyRefresh(refreshToken); }
  catch (_) { throw new IdentidadError('REFRESH_INVALID', 'Refresh token inválido o expirado'); }

  const hash = sha256(refreshToken);
  const sesion = await OrgSesion.findOne({
    where: { sesion_identidad_id: payload.id_identidad, sesion_refresh_hash: hash }
  });
  if (!sesion) throw new IdentidadError('REFRESH_REVOKED', 'Refresh token revocado');
  if (sesion.sesion_expires_at && sesion.sesion_expires_at < new Date()) {
    await sesion.destroy();
    throw new IdentidadError('REFRESH_EXPIRED', 'Refresh token expirado');
  }

  const identidad = await OrgIdentidad.findByPk(payload.id_identidad);
  if (!identidad || !identidad.activo) throw new IdentidadError('USER_INACTIVE', 'Usuario inactivo');

  const accessToken = jwtId.signAccess({ id_identidad: identidad.id_identidad, email: identidad.email_norm });
  return { accessToken };
}

async function logout(refreshToken) {
  if (!refreshToken) return { ok: true };
  try {
    const hash = sha256(refreshToken);
    await OrgSesion.destroy({ where: { sesion_refresh_hash: hash } });
  } catch (_) { /* silencioso */ }
  return { ok: true };
}

async function me(idIdentidad) {
  const identidad = await OrgIdentidad.findByPk(idIdentidad);
  if (!identidad) throw new IdentidadError('NOT_FOUND', 'Identidad no encontrada');
  return publicIdentidad(identidad);
}

/**
 * Aplicaciones del ecosistema con flag `tiene_acceso` calculado para esta identidad.
 * Para cada app activa, ejecuta una query rápida contra su `app_tabla_users`
 * verificando que exista una fila enlazada vía `app_columna_fk` y activa.
 */
async function aplicacionesDisponibles(idIdentidad) {
  const apps = await OrgAplicacion.findAll({
    where: { app_activa: 1 },
    order: [['app_orden', 'ASC'], ['app_nombre', 'ASC']]
  });

  const resultado = [];
  for (const app of apps) {
    let tieneAcceso = false;
    if (!app.app_tabla_users || !app.app_columna_fk) {
      // app sin tabla local de usuarios → acceso libre a cualquier identidad logueada
      tieneAcceso = true;
    } else {
      const activoCol = app.app_columna_activo || 'activo';
      try {
        const sql = `SELECT 1 FROM \`${app.app_tabla_users}\`
                     WHERE \`${app.app_columna_fk}\` = :id
                       AND \`${activoCol}\` = 1
                     LIMIT 1`;
        const rows = await sequelize.query(sql, {
          replacements: { id: idIdentidad },
          type: QueryTypes.SELECT
        });
        tieneAcceso = rows.length > 0;
      } catch (e) {
        // Si la tabla/columna no existe (app aún no migrada al SSO), se reporta como sin acceso
        tieneAcceso = false;
      }
    }
    resultado.push({
      app_id:          app.app_id,
      app_codigo:      app.app_codigo,
      app_nombre:      app.app_nombre,
      app_descripcion: app.app_descripcion,
      app_url_base:    app.app_url_base,
      app_icon:        app.app_icon,
      app_color_hex:   app.app_color_hex,
      app_orden:       app.app_orden,
      tiene_acceso:    tieneAcceso
    });
  }
  return resultado;
}

function publicIdentidad(i) {
  return {
    id_identidad: i.id_identidad,
    email:        i.email_norm,
    ad_usuario:   i.ad_usuario || null,
    nombre:       i.nombre,
    apellido:     i.apellido,
    telefono:     i.telefono,
    activo:       !!i.activo,
    ultimo_login: i.ultimo_login
  };
}

module.exports = {
  login, refresh, logout, me,
  aplicacionesDisponibles,
  normalizarEmail, sha256, publicIdentidad,
  IdentidadError
};
