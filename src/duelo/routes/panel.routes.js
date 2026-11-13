const express = require('express');
const DueloError = require('../utils/DueloError');
const { crearOrigen } = require('../middleware/origen');
const { crearLimites } = require('../middleware/limites');
const { firmarToken, credencialesValidas, crearAutenticacion } = require('../middleware/autenticacion');
const { libroExcel, escribirZip } = require('../services/exportar.service');
const { nombreFotoZip } = require('../dominio/nombresArchivo');

const envolver = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const noEncontrada = () => new DueloError(404, 'NO_ENCONTRADO', 'No encontramos esa foto');

function crearRouterPanel({ obtenerConfig, repo, fotos }) {
  const router = express.Router();
  const autenticar = crearAutenticacion(obtenerConfig);
  const { login: limiteLogin } = crearLimites(obtenerConfig);

  router.post('/login', crearOrigen(obtenerConfig), limiteLogin, (req, res, next) => {
    const config = obtenerConfig();
    const { usuario, clave } = req.body || {};
    if (!credencialesValidas(config, usuario, clave)) {
      return next(new DueloError(401, 'CREDENCIALES', 'Usuario o clave incorrectos'));
    }
    return res.json({ success: true, data: { token: firmarToken(config) } });
  });

  router.use(autenticar);

  router.get('/inscripciones', envolver(async (req, res) => {
    res.json({ success: true, data: await repo.listar(String(req.query.q || '')) });
  }));

  router.get('/fotos/:id', envolver(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) throw noEncontrada();
    const companero = await repo.companeroPorId(Number(req.params.id));
    const ruta = companero && fotos.ruta(companero.foto_ruta);
    if (!ruta) throw noEncontrada();
    res.set('Cache-Control', 'private, no-store');
    res.type('image/jpeg');
    await new Promise((ok, mal) => res.sendFile(ruta, (err) => (err ? mal(noEncontrada()) : ok())));
  }));

  router.get('/exportar.xlsx', envolver(async (req, res) => {
    const { inscripciones } = await repo.listar();
    res.set('Cache-Control', 'private, no-store');
    res.attachment('inscritos-taller-duelo-animal.xlsx');
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(await libroExcel(inscripciones));
  }));

  router.get('/fotos.zip', envolver(async (req, res) => {
    const entradas = (await repo.fotosParaZip())
      .map((f) => ({ ruta: fotos.ruta(f.foto_ruta), nombre: nombreFotoZip(f) }));
    res.set('Cache-Control', 'private, no-store');
    res.attachment('fotos-taller-duelo-animal.zip');
    res.type('application/zip');
    await escribirZip(res, entradas);
  }));

  return router;
}

module.exports = { crearRouterPanel };
