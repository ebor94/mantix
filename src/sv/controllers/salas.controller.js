/**
 * sv/controllers/salas.controller.js — visitas de Prenecesidad en salas de velación.
 * Cada handler captura sus errores: los de negocio (SalaError) se responden aquí;
 * el resto va a next(e) para no tumbar el proceso.
 */
const salas = require('../services/salas.service');
const SalaError = require('../services/salaError');
const { ok, created, fail } = require('../utils/response');

function idDe(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function noEncontrado(res) {
  return fail(res, 404, 'HOMENAJE_NO_ENCONTRADO', 'Homenaje no encontrado');
}

function responderError(e, res, next) {
  if (e instanceof SalaError) return fail(res, e.status, e.code, e.message);
  return next(e);
}

async function listar(req, res, next) {
  try {
    return ok(res, await salas.listar(req.user));
  } catch (e) { return responderError(e, res, next); }
}

async function obtener(req, res, next) {
  const id = idDe(req);
  if (!id) return noEncontrado(res);
  try {
    return ok(res, await salas.obtener(id, req.user));
  } catch (e) { return responderError(e, res, next); }
}

async function atender(req, res, next) {
  const id = idDe(req);
  if (!id) return noEncontrado(res);
  try {
    return ok(res, await salas.atender(id, req.user, req.body));
  } catch (e) { return responderError(e, res, next); }
}

async function registrarVisita(req, res, next) {
  const id = idDe(req);
  if (!id) return noEncontrado(res);
  try {
    return created(res, await salas.registrarVisita(id, req.user, req.body));
  } catch (e) { return responderError(e, res, next); }
}

module.exports = { listar, obtener, atender, registrarVisita };
