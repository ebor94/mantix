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

const HTTP_LOGIN = {
  VALIDATION_ERROR:       422,
  CREDENCIALES_INVALIDAS: 401,
  NO_VINCULADO:           401,
  SIN_ACCESO:             403,
  USER_INACTIVE:          403,
  AD_NO_DISPONIBLE:       503
};

async function login(req, res) {
  try {
    const body = req.body || {};
    const r = await identidad.login({
      usuario:  body.usuario ?? body.email,
      password: body.password,
      ua:       req.headers['user-agent'] || '',
      ip:       req.ip || req.connection?.remoteAddress
    });
    return ok(res, r);
  } catch (e) {
    const status = HTTP_LOGIN[e.code];
    if (status) return fail(res, status, e.code, e.message);
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

module.exports = { login, refresh, logout, me };
