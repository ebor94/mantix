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
const ENTERO = /^\d{1,9}$/;
const vacio = (v) => v === undefined || v === '';

function leerFiltros(query) {
  const fecha = (v) => {
    if (vacio(v)) return undefined;
    if (typeof v !== 'string' || !FECHA.test(v)) throw invalido('Fecha inválida (usa AAAA-MM-DD)');
    const [a, m, d] = v.split('-').map(Number);
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) throw invalido('Fecha inválida (usa AAAA-MM-DD)');
    return v;
  };
  const positivo = (v, mensaje) => {
    if (vacio(v)) return undefined;
    if (typeof v !== 'string' || !ENTERO.test(v) || Number(v) <= 0) throw invalido(mensaje);
    return Number(v);
  };
  const tipo = vacio(query.tipo_vehiculo) ? undefined : query.tipo_vehiculo;
  if (tipo !== undefined && !TIPOS.includes(tipo)) throw invalido('Tipo de vehículo inválido');
  const booleanoQuery = (v) => {
    if (vacio(v)) return undefined;
    if (typeof v !== 'string' || !['1', 'true', '0', 'false'].includes(v)) throw invalido('Valor inválido en inconsistente');
    return v === '1' || v === 'true';
  };
  const desde = fecha(query.desde);
  const hasta = fecha(query.hasta);
  if (desde && hasta && desde > hasta) throw invalido('La fecha inicial es posterior a la final');
  if (query.placa !== undefined && typeof query.placa !== 'string') throw invalido('Placa inválida');
  return {
    filtros: {
      desde,
      hasta,
      placa: normalizarPlaca(query.placa) || undefined,
      tipoVehiculo: tipo,
      motivoId: positivo(query.motivo_id, 'Motivo inválido'),
      inconsistente: booleanoQuery(query.inconsistente),
    },
    pagina: positivo(query.pagina, 'Página inválida') ?? 1,
  };
}

const idDe = (req) => {
  if (!ENTERO.test(req.params.id) || Number(req.params.id) <= 0) throw noExiste();
  return Number(req.params.id);
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

module.exports = { crearRouterEventos, leerFiltros };
