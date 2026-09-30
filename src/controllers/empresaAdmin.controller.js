const empresaAdmin = require('../services/empresaAdmin.service');
// Nota: los handlers de planes/parámetros se agregan en Task 6 (no importar su servicio aún).

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

module.exports = { listar, crear, editar };
