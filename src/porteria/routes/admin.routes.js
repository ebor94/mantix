// src/porteria/routes/admin.routes.js
// Administración (solo admin_porteria): motivos y reporte de movimientos.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { requiereRol, sedeDeConsulta } = require('../middleware/autenticacion');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');
const { ROLES } = require('../services/auth.service');
const { leerFiltros } = require('./eventos.routes');
const { escribirMovimientosXlsx } = require('../services/movimientosXlsx');

const ENTERO = /^\d{1,9}$/;
const ctx = (req) => ({ apiCodigo: req.porApiCodigo, ip: req.ip });
const idMotivo = (req) => {
  if (!ENTERO.test(req.params.id) || Number(req.params.id) <= 0) {
    throw new PorteriaError(404, 'NO_ENCONTRADO', 'El motivo no existe');
  }
  return Number(req.params.id);
};

function crearRouterAdmin({ autenticar, motivosAdmin, reportes }) {
  const router = express.Router();
  const soloAdmin = [autenticar, requiereRol(ROLES.ADMIN)];

  router.get('/motivos', apiCodigo('POR-ADM-001'), ...soloAdmin, aw(async (req, res) => {
    res.json({ success: true, data: await motivosAdmin.listar() });
  }));

  router.post('/motivos', apiCodigo('POR-ADM-002'), ...soloAdmin, aw(async (req, res) => {
    res.status(201).json({ success: true, data: await motivosAdmin.crear(req.body, req.porUsuario, ctx(req)) });
  }));

  router.patch('/motivos/:id', apiCodigo('POR-ADM-003'), ...soloAdmin, aw(async (req, res) => {
    res.json({ success: true, data: await motivosAdmin.actualizar(idMotivo(req), req.body, req.porUsuario, ctx(req)) });
  }));

  router.delete('/motivos/:id', apiCodigo('POR-ADM-004'), ...soloAdmin, aw(async (req, res) => {
    res.json({ success: true, data: await motivosAdmin.eliminar(idMotivo(req), req.porUsuario, ctx(req)) });
  }));

  router.get('/reportes/movimientos.xlsx', apiCodigo('POR-ADM-005'), ...soloAdmin, aw(async (req, res) => {
    const { filtros } = leerFiltros(req.query);
    const sedeId = sedeDeConsulta(req, { todasParaAdmin: true });
    const filas = await reportes.movimientos({ sedeId, ...filtros });
    // Las fechas ya vienen validadas (AAAA-MM-DD): el nombre es seguro en la cabecera.
    const nombre = `movimientos_${filtros.desde || 'inicio'}_${filtros.hasta || 'hoy'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    await escribirMovimientosXlsx(res, filas);
  }));

  return router;
}

module.exports = { crearRouterAdmin };
