/**
 * identity/controllers/auth.controller.js
 * Endpoints de autenticación SSO.
 */
const identidad = require('../services/identidad.service');

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}
function fail(res, status, code, message) {
  return res.status(status).json({ success: false, error: code, message });
}

async function login(req, res) {
  try {
    const r = await identidad.login({
      email:    req.body.email,
      password: req.body.password,
      ua:       req.headers['user-agent'] || '',
      ip:       req.ip || req.connection?.remoteAddress
    });
    return ok(res, r);
  } catch (e) {
    if (e.code === 'VALIDATION_ERROR')   return fail(res, 422, e.code, e.message);
    if (e.code === 'CREDENTIALS_INVALID')return fail(res, 401, e.code, e.message);
    if (e.code === 'USER_INACTIVE')      return fail(res, 403, e.code, e.message);
    throw e;
  }
}

async function refresh(req, res) {
  try {
    const r = await identidad.refresh(req.body.refreshToken);
    return ok(res, r);
  } catch (e) {
    if (['REFRESH_INVALID','REFRESH_REVOKED','REFRESH_EXPIRED','USER_INACTIVE'].includes(e.code)) {
      return fail(res, 401, e.code, e.message);
    }
    throw e;
  }
}

async function logout(req, res) {
  await identidad.logout(req.body.refreshToken);
  return res.status(204).send();
}

async function me(req, res) {
  return ok(res, identidad.publicIdentidad(req.identidad));
}

async function cambiarPassword(req, res) {
  try {
    const r = await identidad.cambiarPassword(req.identidad.id_identidad, {
      actual: req.body.actual,
      nueva:  req.body.nueva
    });
    return ok(res, r);
  } catch (e) {
    if (e.code === 'VALIDATION_ERROR')    return fail(res, 422, e.code, e.message);
    if (e.code === 'CREDENTIALS_INVALID') return fail(res, 401, e.code, e.message);
    throw e;
  }
}

module.exports = { login, refresh, logout, me, cambiarPassword };
