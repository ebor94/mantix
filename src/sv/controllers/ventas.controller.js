/**
 * sv/controllers/ventas.controller.js — ventas de un cliente y sus correcciones.
 * Ver: quien puede ver al cliente. Corregir y anular: supervisor o superior, en su alcance.
 */
const ventas = require('../services/ventas.service');
const prospectos = require('../services/prospectos.service');
const { ok, fail } = require('../utils/response');
const { ERROR_CODES, ROLES_SUPERVISORES } = require('../config/constants');
const { fueraDeAlcance } = require('../utils/alcanceProspecto');

// Solo cifras: Number() también acepta '1e3', '0x10' o ' 40'.
const idDe = (req) => {
  const id = /^\d{1,10}$/.test(req.params.id) ? Number(req.params.id) : 0;
  return id > 0 ? id : null;
};

// Verifica el alcance sobre el cliente. Devuelve false si ya respondió 404 / 403.
async function clienteEnAlcance(req, res, prospId, noEncontrado) {
  const p = prospId ? await prospectos.obtenerAlcance(prospId) : null;
  if (!p) { fail(res, 404, ERROR_CODES.NOT_FOUND, noEncontrado); return false; }
  const motivo = fueraDeAlcance(req.user, req.scope, p);
  if (motivo) { fail(res, 403, ERROR_CODES.FORBIDDEN, motivo); return false; }
  return true;
}

async function listarDeProspecto(req, res) {
  const id = idDe(req);
  if (!(await clienteEnAlcance(req, res, id, 'Prospecto no encontrado'))) return;
  return ok(res, await ventas.listarDeProspecto(id));
}

// Rol, existencia y alcance de la venta. Devuelve su id, o null si ya respondió.
async function ventaEditable(req, res) {
  if (!ROLES_SUPERVISORES.includes(req.user.rol?.rol_codigo)) {
    fail(res, 403, ERROR_CODES.FORBIDDEN, 'Solo el supervisor puede corregir o anular una venta');
    return null;
  }
  const id = idDe(req);
  const venta = id ? await ventas.obtener(id) : null;
  if (!(await clienteEnAlcance(req, res, venta?.venta_prosp_id, 'Venta no encontrada'))) return null;
  return id;
}

async function corregir(req, res) {
  const id = await ventaEditable(req, res);
  if (!id) return;
  return ok(res, await ventas.corregir(id, req.body, req.user.usr_id));
}

async function anular(req, res) {
  const id = await ventaEditable(req, res);
  if (!id) return;
  return ok(res, await ventas.anular(id, req.body, req.user.usr_id));
}

module.exports = { listarDeProspecto, corregir, anular };
