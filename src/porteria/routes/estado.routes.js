// src/porteria/routes/estado.routes.js
// Vehículos dentro de una sede, propios fuera y sugerencia por placa.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { sedeDeConsulta } = require('../middleware/autenticacion');
const aw = require('../utils/aw');

function crearRouterEstado({ autenticar, estado }) {
  const router = express.Router();

  router.get('/dentro', apiCodigo('POR-EST-001'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await estado.dentro(sedeDeConsulta(req)) });
  }));

  router.get('/fuera', apiCodigo('POR-EST-002'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await estado.fuera(sedeDeConsulta(req, { todasParaAdmin: true })) });
  }));

  router.get('/placa/:placa', apiCodigo('POR-EST-003'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await estado.sugerir(req.params.placa) });
  }));

  return router;
}

module.exports = { crearRouterEstado };
