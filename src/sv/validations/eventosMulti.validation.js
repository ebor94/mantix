/**
 * sv/validations/eventosMulti.validation.js
 * Schemas para el CRUD de eventos multi-asesor + pool público (SP-1a).
 */
const Joi = require('joi');

const TIPOS_EVENTO   = ['REUNION', 'VISITA', 'CAPACITACION', 'LLAMADA', 'FERIA', 'PERSONAL', 'OTRO', 'SEGUIMIENTO'];
const MODOS_FECHA    = ['UNICO', 'DIA_COMPLETO_MULTI', 'SLOTS'];
const ESTADOS_ASIS   = ['CONFIRMADO', 'ASISTIO', 'NO_ASISTIO', 'JUSTIFICADO'];

const slot = Joi.object({
  fecha:       Joi.date().iso().required(),
  hora_inicio: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required(),
  hora_fin:    Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required()
});

const crearEvento = Joi.object({
  titulo:      Joi.string().trim().min(2).max(180).required(),
  descripcion: Joi.string().allow('', null).max(2000),
  tipo:        Joi.string().valid(...TIPOS_EVENTO).required(),
  modo_fechas: Joi.string().valid(...MODOS_FECHA).required(),
  fecha_inicio: Joi.date().iso().required(),
  fecha_fin:   Joi.when('modo_fechas', {
    switch: [
      { is: 'UNICO', then: Joi.date().iso().greater(Joi.ref('fecha_inicio')).optional().allow(null) },
      { is: 'SLOTS', then: Joi.date().iso().allow(null).optional() },
      { is: 'DIA_COMPLETO_MULTI', then: Joi.date().iso().greater(Joi.ref('fecha_inicio')).required() }
    ]
  }),
  slots: Joi.when('modo_fechas', {
    is:  'SLOTS',
    then: Joi.array().items(slot).min(1).required(),
    otherwise: Joi.forbidden()
  }),
  asistentes_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
  apoyo_usr_id:   Joi.number().integer().positive().allow(null),
  empresa_id:     Joi.number().integer().positive().allow(null),
  prosp_id:       Joi.number().integer().positive().allow(null),
  registros_publicos_habilitado: Joi.boolean().default(false),
  meta_leads:     Joi.number().integer().min(0).allow(null)
}).prefs({ abortEarly: false });

const actualizarEvento = crearEvento.fork(
  ['titulo', 'tipo', 'modo_fechas', 'fecha_inicio', 'asistentes_ids'],
  (s) => s.optional()
);

const registroPublico = Joi.object({
  nombre:   Joi.string().trim().min(2).max(180).required(),
  telefono: Joi.string().trim().pattern(/^[+]?[\d\s\-()]{7,20}$/).required(),
  correo:   Joi.string().email({ tlds: { allow: false } }).allow('', null).max(180)
}).prefs({ abortEarly: false });

const asignarPool = Joi.object({
  asesor_id: Joi.number().integer().positive().required()
});

const actualizarMetricas = Joi.object({
  estado:             Joi.string().valid(...ESTADOS_ASIS),
  leads_captados:     Joi.number().integer().min(0).allow(null),
  prospectos_creados: Joi.number().integer().min(0).allow(null),
  ventas_cerradas:    Joi.number().integer().min(0).allow(null)
}).min(1).prefs({ abortEarly: false });

module.exports = {
  crearEvento, actualizarEvento, registroPublico, asignarPool, actualizarMetricas,
  TIPOS_EVENTO, MODOS_FECHA, ESTADOS_ASIS
};
