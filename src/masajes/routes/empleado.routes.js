// Rutas del empleado (spec §8). Cada ruta lleva su cadena completa: código de API → token → límite →
// beneficiario activo releído. El beneficiario sale SIEMPRE de la sesión, nunca del cuerpo de la petición.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { requiereBeneficiario } = require('../middleware/autenticacion');
const { validar, inicio, idParam, fecha, texto } = require('../middleware/validar');
const aw = require('../utils/aw');

const auditoriaDe = (req) => ({ ip: req.ip, userAgent: req.get('user-agent'), requestId: req.msjApiCodigo });
const citaPublica = (c) => ({ id: c.id, inicio: c.inicio.toISOString(), fin: c.fin ? c.fin.toISOString() : undefined, periodo: c.periodo, estado: c.estado });

function crearRouterEmpleado({ autenticar, resolverBeneficiario, limites, servicios }) {
  const router = express.Router();
  const { citas, disponibilidad } = servicios;
  const lectura = (codigo) => [apiCodigo(codigo), autenticar, limites.lectura, resolverBeneficiario, requiereBeneficiario];
  const escritura = (codigo) => [apiCodigo(codigo), autenticar, limites.escritura, resolverBeneficiario, requiereBeneficiario];

  router.get('/me', ...lectura('MSJ-EMP-001'), validar({}), aw(async (req, res) => {
    const resumen = await citas.resumenDelBeneficiario(req.msjBeneficiario.id);
    res.json({ success: true, data: { beneficiario: req.msjBeneficiario, ...resumen } });
  }));

  router.get('/disponibilidad', ...lectura('MSJ-EMP-002'), validar({ query: { desde: fecha.required(), hasta: fecha.required() } }), aw(async (req, res) => {
    const { desde, hasta } = req.v.query;
    res.json({ success: true, data: await disponibilidad.consultar({ desde, hasta, esAdmin: false }) });
  }));

  router.post('/citas', ...escritura('MSJ-CIT-001'), validar({ body: { inicio: inicio.required() } }), aw(async (req, res) => {
    const cita = await citas.agendar({
      beneficiarioId: req.msjBeneficiario.id, inicio: req.v.body.inicio, actor: req.msjUsuario.usuario, esAdmin: false, auditoria: auditoriaDe(req),
    });
    res.status(201).json({ success: true, data: citaPublica(cita) });
  }));

  router.patch('/citas/:id/reprogramar', ...escritura('MSJ-CIT-002'), validar({ params: { id: idParam.required() }, body: { inicio: inicio.required() } }), aw(async (req, res) => {
    const cita = await citas.reprogramar({
      citaId: req.v.params.id, inicio: req.v.body.inicio, actor: req.msjUsuario.usuario, esAdmin: false,
      beneficiarioIdActor: req.msjBeneficiario.id, auditoria: auditoriaDe(req),
    });
    res.json({ success: true, data: citaPublica(cita) });
  }));

  router.post('/citas/:id/cancelar', ...escritura('MSJ-CIT-003'), validar({ params: { id: idParam.required() }, body: { motivo: texto(255) } }), aw(async (req, res) => {
    const cita = await citas.cancelar({
      citaId: req.v.params.id, motivo: req.v.body.motivo, actor: req.msjUsuario.usuario, esAdmin: false,
      beneficiarioIdActor: req.msjBeneficiario.id, auditoria: auditoriaDe(req),
    });
    res.json({ success: true, data: citaPublica(cita) });
  }));

  return router;
}

module.exports = { crearRouterEmpleado, citaPublica };
