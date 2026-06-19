/**
 * identity/services/identidad.service.js
 * Lógica de SSO: login, lookup de identidad y aplicaciones disponibles.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { QueryTypes } = require('sequelize');
const { sequelize, OrgIdentidad, OrgSesion, OrgAplicacion } = require('../models');
const jwtId = require('../config/jwt');

class IdentidadError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function normalizarEmail(email) {
  return (email || '').toString().trim().toLowerCase();
}
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function login({ email, password, ua, ip }) {
  const emailNorm = normalizarEmail(email);
  if (!emailNorm || !password) throw new IdentidadError('VALIDATION_ERROR', 'Email y contraseña son requeridos');

  const identidad = await OrgIdentidad.findOne({ where: { email_norm: emailNorm } });
  if (!identidad)           throw new IdentidadError('CREDENTIALS_INVALID', 'Credenciales inválidas');
  if (!identidad.activo)    throw new IdentidadError('USER_INACTIVE', 'Usuario inactivo');

  const ok = await bcrypt.compare(password, identidad.password_hash);
  if (!ok) throw new IdentidadError('CREDENTIALS_INVALID', 'Credenciales inválidas');

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

  return {
    accessToken,
    refreshToken,
    identidad: publicIdentidad(identidad),
    must_reset: !!identidad.must_reset
  };
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

async function cambiarPassword(idIdentidad, { actual, nueva }) {
  const identidad = await OrgIdentidad.findByPk(idIdentidad);
  if (!identidad) throw new IdentidadError('NOT_FOUND', 'Identidad no encontrada');
  if (!nueva || nueva.length < 6) throw new IdentidadError('VALIDATION_ERROR', 'La nueva contraseña debe tener al menos 6 caracteres');

  // Si NO está en must_reset, exigir password actual
  if (!identidad.must_reset) {
    if (!actual) throw new IdentidadError('VALIDATION_ERROR', 'Contraseña actual requerida');
    const ok = await bcrypt.compare(actual, identidad.password_hash);
    if (!ok)    throw new IdentidadError('CREDENTIALS_INVALID', 'Contraseña actual incorrecta');
  }

  const hash = await bcrypt.hash(nueva, 10);
  await identidad.update({
    password_hash:       hash,
    password_changed_at: new Date(),
    must_reset:          0
  });
  // Invalidar todas las sesiones (logout en otros dispositivos)
  await OrgSesion.destroy({ where: { sesion_identidad_id: idIdentidad } });
  return { ok: true };
}

function publicIdentidad(i) {
  return {
    id_identidad: i.id_identidad,
    email:        i.email_norm,
    nombre:       i.nombre,
    apellido:     i.apellido,
    telefono:     i.telefono,
    activo:       !!i.activo,
    ultimo_login: i.ultimo_login,
    must_reset:   !!i.must_reset
  };
}

module.exports = {
  login, refresh, logout, me,
  aplicacionesDisponibles, cambiarPassword,
  normalizarEmail, sha256, publicIdentidad,
  IdentidadError
};
