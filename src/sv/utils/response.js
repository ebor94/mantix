/**
 * sv/utils/response.js
 * Helpers para respuestas REST estandarizadas en el módulo SerVentas.
 * Consistente con el patrón Mantix: { success, data } / { success:false, error, message, errors }
 */

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function created(res, data) {
  return ok(res, data, 201);
}

function noContent(res) {
  return res.status(204).send();
}

function fail(res, status, code, message, errors) {
  const body = { success: false, error: code, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}

module.exports = { ok, created, noContent, fail };
