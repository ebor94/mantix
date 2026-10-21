// Resultados agregados y exportación CSV, protegidos con BIGDAY_RESULTS_TOKEN (Bearer).
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { createHash, timingSafeEqual } = require('node:crypto');
const { claveIp } = require('./respuestas.routes');
const { totales, distribucion, nps, matrizP2P3, ultimasFrases } = require('../services/stats');
const { construirCsv } = require('../services/csv');

const sha256 = (v) => createHash('sha256').update(String(v)).digest();

// Comparación en tiempo constante: se comparan hashes (siempre 32 bytes), sin filtrar la longitud del token.
function tokenValido(cabecera, esperado) {
  const m = /^Bearer\s+(.+)$/i.exec(typeof cabecera === 'string' ? cabecera : '');
  const recibido = m ? m[1].trim() : '';
  return timingSafeEqual(sha256(recibido), sha256(esperado)) && recibido !== '';
}

function crearRouterResultados({ repositorio, config }) {
  const router = Router();

  // 30 peticiones por IP cada 10 minutos (solo IP, sin UA) para frenar la fuerza bruta del token.
  // Limitador nuevo por router: el estado no se comparte entre fábricas.
  const limitador = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => claveIp(req.ip),
    message: { error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' },
  });

  // 503 si no hay token configurado (nunca se acepta un token vacío); 401 idéntico para ausente o incorrecto.
  function exigirToken(req, res, next) {
    const esperado = typeof config.resultsToken === 'string' ? config.resultsToken.trim() : '';
    if (!esperado) {
      return res.status(503).json({
        error: 'Los resultados no están disponibles: configuración del servidor incompleta.',
      });
    }
    if (!tokenValido(req.get('authorization'), esperado)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    return next();
  }

  // Respuesta 500 genérica: solo el mensaje del error en el log (sin IP, token ni filas).
  const falla = (res, err, donde) => {
    console.error(`bigday: error al ${donde}:`, err instanceof Error ? err.message : 'desconocido');
    if (!res.headersSent) res.status(500).json({ error: 'No se pudieron obtener los resultados.' });
  };

  router.use(['/resultados', '/resultados.csv'], limitador, exigirToken);

  // try/catch propio: en Express 4 un rechazo en un handler async no llega al manejador de errores.
  router.get('/resultados', async (req, res) => {
    try {
      const filas = await repositorio.listar();
      const cuerpo = {
        total: totales(filas),
        distribucion: distribucion(filas),
        nps: nps(filas),
        matrizP2P3: matrizP2P3(filas),
        ultimasFrases: ultimasFrases(filas, 20),
      };
      res.set('Cache-Control', 'no-store');
      return res.json(cuerpo);
    } catch (err) {
      return falla(res, err, 'calcular resultados');
    }
  });

  router.get('/resultados.csv', async (req, res) => {
    try {
      const csv = construirCsv(await repositorio.listar());
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bigday-respuestas.csv"',
        'Cache-Control': 'no-store',
      });
      return res.send(csv);
    } catch (err) {
      return falla(res, err, 'exportar el CSV');
    }
  });

  return router;
}

module.exports = { crearRouterResultados };
