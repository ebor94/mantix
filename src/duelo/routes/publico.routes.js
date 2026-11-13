const express = require('express');
const { crearOrigen } = require('../middleware/origen');
const { crearLimites } = require('../middleware/limites');
const { subida } = require('../middleware/subida');
const { crearTurnstile } = require('../middleware/turnstile');
const logger = require('../../utils/logger');

// Registra un fallo del correo sin datos personales: solo el id de la inscripción y la clase del error.
const registrarFalloCorreo = (id) => (err) => {
  logger.error('duelo: falló el envío del correo de confirmación', { inscripcion: id, nombre: err && err.name, codigo: err && err.code });
};

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
      // Sin multipart ni parser de cuerpo, Express deja req.body sin definir.
      if (!req.body) req.body = {};
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
      // Tanto la excepción síncrona como el rechazo se registran; ninguno puede llegar a next() tras el 201.
      try {
        Promise.resolve(servicio.notificarInscripcion(id, datos)).catch(registrarFalloCorreo(id));
      } catch (errCorreo) {
        registrarFalloCorreo(id)(errCorreo);
      }
      return undefined;
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { crearRouterPublico };
