const empresaAdmin = require('../services/empresaAdmin.service');
const parametroSvc = require('../services/empresaParametro.service');

async function listar(req, res, next) {
  try { res.json({ success: true, data: await empresaAdmin.listarEmpresas() }); }
  catch (err) { next(err); }
}
async function crear(req, res, next) {
  try { res.status(201).json({ success: true, data: await empresaAdmin.crearEmpresa(req.body) }); }
  catch (err) { next(err); }
}
async function editar(req, res, next) {
  try { res.json({ success: true, data: await empresaAdmin.editarEmpresa(req.params.id, req.body) }); }
  catch (err) { next(err); }
}
async function listarAsesores(req, res, next) {
  try { res.json({ success: true, data: await empresaAdmin.listarAsesores() }); }
  catch (err) { next(err); }
}

async function editarPlan(req, res, next) {
  try { res.json({ success: true, data: await parametroSvc.editarPlan(req.params.id, req.params.planTipo, req.body) }); }
  catch (err) { next(err); }
}
async function listarParametros(req, res, next) {
  try { res.json({ success: true, data: await parametroSvc.listarParametros() }); }
  catch (err) { next(err); }
}
async function crearParametro(req, res, next) {
  try { res.status(201).json({ success: true, data: await parametroSvc.crearParametro(req.body) }); }
  catch (err) { next(err); }
}
async function editarParametro(req, res, next) {
  try { res.json({ success: true, data: await parametroSvc.editarParametro(req.params.anio, req.body) }); }
  catch (err) { next(err); }
}
async function activarParametro(req, res, next) {
  try { res.json({ success: true, data: await parametroSvc.activarParametro(req.params.anio) }); }
  catch (err) { next(err); }
}

module.exports = {
  listar, crear, editar, listarAsesores,
  editarPlan, listarParametros, crearParametro, editarParametro, activarParametro
};
