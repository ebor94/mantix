// src/porteria/routes/vehiculosExternos.routes.js
// Catálogo de vehículos de proveedor: el guarda busca y crea; el admin además corrige e inactiva.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { requiereRol } = require('../middleware/autenticacion');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');
const { normalizarPlaca } = require('../utils/placa');
const { textoOpcional } = require('../utils/texto');
const { ROLES } = require('../services/auth.service');

const TIPOS_EXTERNOS = ['PROVEEDOR_ASISTENCIA', 'PROVEEDOR'];
const invalido = (message) => new PorteriaError(400, 'VALIDACION', message);

function textoCampo(valor, max, mensaje) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string' || valor.trim().length > max) throw invalido(mensaje);
  return valor.trim() || null;
}

function crearRouterVehiculosExternos({ autenticar, vehiculosExternos, h360 }) {
  const router = express.Router();

  router.get('/', apiCodigo('POR-VEX-001'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await vehiculosExternos.buscar(textoOpcional(req.query.q)) });
  }));

  router.post('/', apiCodigo('POR-VEX-002'), autenticar, aw(async (req, res) => {
    const body = req.body || {};
    const placa = typeof body.placa === 'string' ? normalizarPlaca(body.placa) : '';
    if (!placa) throw invalido('Indica la placa');
    if (placa.length > 20) throw invalido('La placa es demasiado larga');
    if (!TIPOS_EXTERNOS.includes(body.tipo)) throw invalido('Tipo de vehículo inválido');
    const empresa = textoCampo(body.empresa, 150, 'Indica la empresa');
    if (!empresa) throw invalido('Indica la empresa');
    const descripcion = textoCampo(body.descripcion, 255, 'La descripción es demasiado larga');
    if (await h360.obtenerVehiculoPropioPorPlaca(placa)) {
      throw new PorteriaError(409, 'PLACA_PROPIA', 'La placa es de un vehículo de la empresa');
    }
    const id = await vehiculosExternos.crear({ placa, tipo: body.tipo, empresa, descripcion, usuario: req.porUsuario.usuario });
    res.status(201).json({ success: true, data: await vehiculosExternos.obtenerPorId(id) });
  }));

  router.patch('/:id', apiCodigo('POR-VEX-003'), autenticar, requiereRol(ROLES.ADMIN), aw(async (req, res) => {
    const id = Number(req.params.id);
    const noExiste = () => new PorteriaError(404, 'NO_ENCONTRADO', 'El vehículo no existe');
    if (!Number.isInteger(id) || id <= 0) throw noExiste();
    const body = req.body || {};
    const cambios = {};
    if ('tipo' in body) {
      if (!TIPOS_EXTERNOS.includes(body.tipo)) throw invalido('Tipo de vehículo inválido');
      cambios.tipo = body.tipo;
    }
    if ('empresa' in body) {
      cambios.empresa = textoCampo(body.empresa, 150, 'Indica la empresa');
      if (!cambios.empresa) throw invalido('Indica la empresa');
    }
    if ('descripcion' in body) cambios.descripcion = textoCampo(body.descripcion, 255, 'La descripción es demasiado larga');
    if ('activo' in body) {
      if (typeof body.activo !== 'boolean') throw invalido('Activo inválido');
      cambios.activo = body.activo;
    }
    if (Object.keys(cambios).length === 0) throw invalido('No hay cambios');
    if (!(await vehiculosExternos.actualizar(id, cambios, req.porUsuario.usuario))) throw noExiste();
    res.json({ success: true, data: await vehiculosExternos.obtenerPorId(id) });
  }));

  return router;
}

module.exports = { crearRouterVehiculosExternos };
