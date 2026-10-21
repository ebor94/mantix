const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { respuestaSchema } = require('../shared/survey.config.cjs');
const { hashConSal } = require('../services/hash');

const DURACION_MIN_SEG = 8;
const MSG_GENERICO = 'No se pudo registrar la respuesta.';

function crearRouterRespuestas({ repositorio, config }) {
  const router = Router();

  // 10 peticiones por IP cada 10 minutos. Limitador nuevo por router: el estado no se comparte.
  // req.ip es la IP real del visitante gracias a `trust proxy` de app.js.
  const limitador = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' },
  });

  router.post('/respuestas', limitador, async (req, res) => {
    const cuerpo = req.body;

    // Anti-bot ANTES de zod: la respuesta es genérica y no revela la regla.
    const crudo = cuerpo && typeof cuerpo === 'object' ? cuerpo : {};
    const honeypotLleno = typeof crudo.website === 'string' && crudo.website !== '';
    const duracion = crudo.duracion_seg;
    const muyRapido = typeof duracion !== 'number' || !(duracion >= DURACION_MIN_SEG);
    if (honeypotLleno || muyRapido) {
      return res.status(400).json({ error: MSG_GENERICO });
    }

    const parseo = respuestaSchema.safeParse(cuerpo);
    if (!parseo.success) {
      return res.status(400).json({
        error: 'Datos inválidos.',
        detalles: parseo.error.issues.map((i) => ({
          campo: i.path.join('.') || 'cuerpo',
          mensaje: i.message,
        })),
      });
    }
    const r = parseo.data;

    const ua = req.get('user-agent');
    try {
      const resultado = await repositorio.guardar({
        uuid: r.uuid,
        p1: r.p1,
        p2: r.p2,
        p3: r.p3,
        p3_otro: r.p3_otro ? r.p3_otro : null,
        p4: r.p4,
        p4_otro: r.p4_otro ? r.p4_otro : null,
        p5: r.p5,
        p6: r.p6,
        p7: r.p7,
        origen: r.origen ? r.origen : null,
        duracion_seg: r.duracion_seg ?? null,
        ip_hash: req.ip ? hashConSal(req.ip, config.hashSalt) : null,
        ua_hash: ua ? hashConSal(ua, config.hashSalt) : null,
      });
      if (resultado === 'creada') return res.status(201).json({ ok: true });
      return res.status(200).json({ ok: true, duplicada: true });
    } catch (err) {
      // Solo el mensaje del error: sin IP, cuerpo ni user-agent.
      console.error('bigday: error al guardar respuesta:', err instanceof Error ? err.message : 'desconocido');
      return res.status(500).json({ error: 'No se pudo guardar la respuesta. Inténtalo de nuevo.' });
    }
  });

  return router;
}

module.exports = { crearRouterRespuestas };
