// ============================================
// src/bigday/routes/index.js — Router del módulo October Big Day (/api/bigday/v1)
// ============================================
const express = require('express');
const { leerEntorno } = require('../config/entorno');
const { crearRepositorioPerezoso } = require('../repositorio');
const { bigdayErrorHandler } = require('../middleware/errorHandler');
const { crearRouterRespuestas } = require('./respuestas.routes');
const { crearRouterResultados } = require('./resultados.routes');

/** Fábrica inyectable (tests): `repositorio` y `config` = { hashSalt, resultsToken? }. */
function crearRouterBigday({ repositorio, config }) {
  const router = express.Router();

  router.get('/health', async (req, res) => {
    try {
      await repositorio.ping();
      res.json({ estado: 'ok', bd: 'ok' });
    } catch (err) {
      console.error('bigday: fallo el ping a la BD:', err instanceof Error ? err.message : 'desconocido');
      res.status(503).json({ estado: 'error', bd: 'error' });
    }
  });

  router.use(crearRouterRespuestas({ repositorio, config }));
  router.use(crearRouterResultados({ repositorio, config }));
  router.use(bigdayErrorHandler);
  return router;
}

// Router de producción: toma la configuración de BIGDAY_* y se construye al primer request válido.
// Si faltan variables responde 503 sin tumbar Mantix (se re-evalúa por request, es barato).
let real = null;
let avisado = false;
function router(req, res, next) {
  const entorno = leerEntorno();
  if (!entorno.ok) {
    if (!avisado) {
      avisado = true;
      console.error(`bigday deshabilitado: faltan variables ${entorno.faltantes.join(', ')}`);
    }
    return res.status(503).json({
      error: 'El módulo October Big Day no está disponible: configuración del servidor incompleta.',
    });
  }
  if (!real) {
    real = crearRouterBigday({
      repositorio: crearRepositorioPerezoso(entorno.config.db),
      config: {
        hashSalt: entorno.config.hashSalt,
        // Se lee del entorno en cada petición: no depende de cuándo se construyó el router.
        get resultsToken() { return leerEntorno().config?.resultsToken ?? null; },
      },
    });
  }
  return real(req, res, next);
}

module.exports = { router, crearRouterBigday };
