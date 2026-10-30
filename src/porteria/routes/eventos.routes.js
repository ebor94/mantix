// src/porteria/routes/eventos.routes.js
// Registro, consulta, corrección y anulación de ingresos y salidas.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { requiereSede, sedeDeConsulta } = require('../middleware/autenticacion');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');
const { normalizarPlaca } = require('../utils/placa');
const { ROLES } = require('../services/auth.service');
const { TIPOS } = require('../services/detalleEvento');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const invalido = (message) => new PorteriaError(400, 'VALIDACION', message);
const noExiste = () => new PorteriaError(404, 'NO_ENCONTRADO', 'El registro no existe');
const vacio = (v) => v === undefined || v === '';

function leerFiltros(query) {
  const fecha = (v) => {
    if (vacio(v)) return undefined;
    if (typeof v !== 'string' || !FECHA.test(v)) throw invalido('Fecha inválida (usa AAAA-MM-DD)');
    return v;
  };
  const positivo = (v, mensaje) => {
    if (vacio(v)) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw invalido(mensaje);
    return n;
  };
  const tipo = vacio(query.tipo_vehiculo) ? undefined : query.tipo_vehiculo;
  if (tipo !== undefined && !TIPOS.includes(tipo)) throw invalido('Tipo de vehículo inválido');
  return {
    filtros: {
      desde: fecha(query.desde),
      hasta: fecha(query.hasta),
      placa: typeof query.placa === 'string' ? normalizarPlaca(query.placa) || undefined : undefined,
      tipoVehiculo: tipo,
      motivoId: positivo(query.motivo_id, 'Motivo inválido'),
      inconsistente: vacio(query.inconsistente) ? undefined : ['1', 'true'].includes(query.inconsistente),
    },
    pagina: positivo(query.pagina, 'Página inválida') ?? 1,
  };
}

const idDe = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw noExiste();
  return id;
};
const ctx = (req) => ({ ip: req.ip, apiCodigo: req.porApiCodigo });

function crearRouterEventos({ autenticar, eventos }) {
  const router = express.Router();

  router.post('/', apiCodigo('POR-EVT-001'), autenticar, requiereSede, aw(async (req, res) => {
    res.status(201).json({ success: true, data: await eventos.registrar(req.body, req.porUsuario, ctx(req)) });
  }));

  router.get('/', apiCodigo('POR-EVT-002'), autenticar, aw(async (req, res) => {
    const { filtros, pagina } = leerFiltros(req.query);
    const sedeId = sedeDeConsulta(req, { todasParaAdmin: true });
    res.json({ success: true, data: await eventos.listar({ sedeId, ...filtros }, { pagina }) });
  }));

  router.get('/:id', apiCodigo('POR-EVT-003'), autenticar, aw(async (req, res) => {
    const evento = await eventos.obtener(idDe(req));
    const ajeno = evento && req.porUsuario.rol !== ROLES.ADMIN && evento.sede_id !== req.porUsuario.sede_id;
    if (!evento || ajeno) throw noExiste();
    res.json({ success: true, data: evento });
  }));

  router.patch('/:id', apiCodigo('POR-EVT-004'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await eventos.corregir(idDe(req), req.body, req.porUsuario, ctx(req)) });
  }));

  router.post('/:id/anular', apiCodigo('POR-EVT-005'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await eventos.anular(idDe(req), req.body, req.porUsuario, ctx(req)) });
  }));

  return router;
}

module.exports = { crearRouterEventos };
