const Joi = require('joi');

const puntoSchema = Joi.object({
  ts:        Joi.alternatives().try(Joi.date().iso(), Joi.number()).required(),
  lat:       Joi.number().min(-90).max(90).required(),
  lng:       Joi.number().min(-180).max(180).required(),
  accuracy:  Joi.number().min(0).allow(null),
  altitude:  Joi.number().allow(null),
  speed:     Joi.number().allow(null),
  battery:   Joi.number().integer().min(0).max(100).allow(null),
  source:    Joi.string().valid('foreground', 'service_worker', 'manual').default('foreground')
});

module.exports = {
  iniciarJornada: Joi.object({
    lat:         Joi.number().min(-90).max(90).allow(null),
    lng:         Joi.number().min(-180).max(180).allow(null),
    dispositivo: Joi.string().max(255).allow('', null)
  }),

  finalizarJornada: Joi.object({
    lat: Joi.number().min(-90).max(90).allow(null),
    lng: Joi.number().min(-180).max(180).allow(null)
  }),

  batchPuntos: Joi.object({
    puntos: Joi.array().items(puntoSchema).min(1).max(200).required()
  }),

  recorrido: Joi.object({
    fecha: Joi.date().iso()
  }),

  liveEquipo: Joi.object({
    grupo_id: Joi.number().integer().allow(null, ''),
    area_id:  Joi.number().integer().allow(null, '')
  }),

  listarJornadas: Joi.object({
    usr_id: Joi.number().integer(),
    desde:  Joi.date().iso(),
    hasta:  Joi.date().iso()
  }),

  exportar: Joi.object({
    desde: Joi.date().iso(),
    hasta: Joi.date().iso()
  })
};
