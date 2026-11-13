const express = require('express');
const { crearOrigen } = require('../middleware/origen');
const { crearLimites } = require('../middleware/limites');
const { subida } = require('../middleware/subida');
const { crearTurnstile } = require('../middleware/turnstile');

function crearRouterPublico({ obtenerConfig, servicio, http }) {
  const router = express.Router();
  const origen = crearOrigen(obtenerConfig);
  const limites = crearLimites(obtenerConfig);
  const verificarTurnstile = crearTurnstile(obtenerConfig, http);

  router.get('/estado', (req, res) => {
    const { abiertas, versionPolitica } = obtenerConfig();
    res.json({ success: true, data: { abiertas, versionPolitica } });
  });

  router.post('/inscripciones', origen, limites.inscripciones, subida, async (req, res, next) => {
    try {
      // Honeypot: los bots llenan el campo oculto; se les responde éxito sin guardar nada.
      if (String(req.body.sitio_web || '').trim()) return res.status(201).json({ success: true });
      await verificarTurnstile(req);

      const archivos = {};
      for (const orden of [1, 2, 3]) {
        const archivo = req.files && req.files[`foto_${orden}`] && req.files[`foto_${orden}`][0];
        if (archivo) archivos[orden] = archivo.buffer;
      }
      const { id, datos } = await servicio.inscribir({
        cuerpo: req.body, archivos, ip: req.ip, userAgent: req.get('User-Agent'),
      });
      res.status(201).json({ success: true });
      // El correo va después de responder: su resultado no afecta la inscripción.
      Promise.resolve(servicio.notificarInscripcion(id, datos)).catch(() => {});
      return undefined;
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { crearRouterPublico };
