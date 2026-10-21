// ============================================
// src/bigday/routes/index.js — Router del módulo October Big Day (/api/bigday/v1)
// ============================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const { leerEntorno } = require('../config/entorno');
const { crearRepositorioPerezoso } = require('../repositorio');
const { bigdayErrorHandler } = require('../middleware/errorHandler');
const { crearRouterRespuestas, claveIp } = require('./respuestas.routes');
const { crearRouterResultados } = require('./resultados.routes');

// Cabeceras de reintento que el front (en otro origen) necesita leer en un 429/503 para esperar lo justo.
const CABECERAS_REINTENTO = ['Retry-After', 'RateLimit', 'RateLimit-Policy'];

/** Si CORS ya expuso cabeceras, añade las de reintento (sin CORS —mismo origen, curl— no hace nada). */
function exponerCabecerasReintento(req, res, next) {
  const actual = res.getHeader('Access-Control-Expose-Headers');
  if (actual) {
    const lista = String(actual).split(',').map((c) => c.trim()).filter(Boolean);
    for (const c of CABECERAS_REINTENTO) if (!lista.includes(c)) lista.push(c);
    res.setHeader('Access-Control-Expose-Headers', lista.join(','));
  }
  next();
}

/** Fábrica inyectable (tests): `repositorio` y `config` = { hashSalt, resultsToken? }. */
function crearRouterBigday({ repositorio, config }) {
  const router = express.Router();
  router.use(exponerCabecerasReintento);

  // 60 peticiones por IP y minuto (IPv6 agrupada por /56). Se crea con el router, que en producción se
  // construye una sola vez al cargar el módulo: nunca dentro de un request (ERR_ERL_CREATED_IN_REQUEST_HANDLER).
  const limitadorHealth = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => claveIp(req.ip),
    message: { error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' },
  });

  router.get('/health', limitadorHealth, async (req, res) => {
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

// Router de producción: se construye UNA vez al cargar el módulo, porque express-rate-limit exige crear los
// limitadores en la inicialización y no dentro de un request (ERR_ERL_CREATED_IN_REQUEST_HANDLER).
// Nada aquí toca la red ni lanza si faltan variables: el pool se crea al primer uso de BD y la configuración
// se lee del entorno en cada acceso (agregar variables y reiniciar basta; resultsToken sigue siendo dinámico).
const real = crearRouterBigday({
  repositorio: crearRepositorioPerezoso(() => leerEntorno().config.db),
  config: {
    get hashSalt() { return leerEntorno().config?.hashSalt; },
    get resultsToken() { return leerEntorno().config?.resultsToken ?? null; },
  },
});

// Si faltan variables responde 503 sin tumbar Mantix (se re-evalúa por request, es barato).
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
  return real(req, res, next);
}

module.exports = { router, crearRouterBigday };
