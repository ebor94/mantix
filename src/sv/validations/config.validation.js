const Joi = require('joi');

const hex = Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/);

module.exports = {
  area: {
    create: Joi.object({
      area_codigo:       Joi.string().max(20).required(),
      area_nombre:       Joi.string().max(100).required(),
      area_descripcion:  Joi.string().allow('', null),
      area_color_hex:    hex.allow(null, ''),
      area_icono:        Joi.string().max(50).allow('', null),
      area_tipo_cliente: Joi.string().valid('individual', 'empresa', 'contrato').default('individual'),
      area_activa:       Joi.number().valid(0, 1).default(1)
    }),
    update: Joi.object({
      area_codigo:       Joi.string().max(20),
      area_nombre:       Joi.string().max(100),
      area_descripcion:  Joi.string().allow('', null),
      area_color_hex:    hex.allow(null, ''),
      area_icono:        Joi.string().max(50).allow('', null),
      area_tipo_cliente: Joi.string().valid('individual', 'empresa', 'contrato'),
      area_activa:       Joi.number().valid(0, 1)
    }).min(1)
  },
  grupo: {
    create: Joi.object({
      grupo_area_id:      Joi.number().integer().required(),
      grupo_codigo:       Joi.string().max(30).required(),
      grupo_nombre:       Joi.string().max(100).required(),
      grupo_tipo_venta:   Joi.string().valid('individual', 'b2b', 'masivo', 'postventa').default('individual'),
      grupo_meta_default: Joi.number().integer().min(0).default(0),
      grupo_activo:       Joi.number().valid(0, 1).default(1)
    }),
    update: Joi.object({
      grupo_area_id:      Joi.number().integer(),
      grupo_codigo:       Joi.string().max(30),
      grupo_nombre:       Joi.string().max(100),
      grupo_tipo_venta:   Joi.string().valid('individual', 'b2b', 'masivo', 'postventa'),
      grupo_meta_default: Joi.number().integer().min(0),
      grupo_activo:       Joi.number().valid(0, 1)
    }).min(1)
  },
  producto: {
    create: Joi.object({
      prod_area_id:          Joi.number().integer().required(),
      prod_codigo:           Joi.string().max(30).required(),
      prod_nombre:           Joi.string().max(120).required(),
      prod_descripcion:      Joi.string().allow('', null),
      prod_categoria:        Joi.string().max(50).allow('', null),
      prod_precio_base:      Joi.number().min(0).allow(null),
      prod_requiere_empresa: Joi.number().valid(0, 1).default(0),
      prod_activo:           Joi.number().valid(0, 1).default(1),
      prod_orden_display:    Joi.number().integer().default(0)
    }),
    update: Joi.object({
      prod_area_id:          Joi.number().integer(),
      prod_codigo:           Joi.string().max(30),
      prod_nombre:           Joi.string().max(120),
      prod_descripcion:      Joi.string().allow('', null),
      prod_categoria:        Joi.string().max(50).allow('', null),
      prod_precio_base:      Joi.number().min(0).allow(null),
      prod_requiere_empresa: Joi.number().valid(0, 1),
      prod_activo:           Joi.number().valid(0, 1),
      prod_orden_display:    Joi.number().integer()
    }).min(1)
  },
  estado: {
    create: Joi.object({
      estado_grupo_id:       Joi.number().integer().required(),
      estado_codigo:         Joi.string().max(30).required(),
      estado_nombre:         Joi.string().max(80).required(),
      estado_color_hex:      hex.allow(null, ''),
      estado_es_final:       Joi.number().valid(0, 1).default(0),
      estado_es_ganado:      Joi.number().valid(0, 1).default(0),
      estado_requiere_fecha: Joi.number().valid(0, 1).default(0),
      estado_orden:          Joi.number().integer().default(0),
      estado_activo:         Joi.number().valid(0, 1).default(1)
    }),
    update: Joi.object({
      estado_codigo:         Joi.string().max(30),
      estado_nombre:         Joi.string().max(80),
      estado_color_hex:      hex.allow(null, ''),
      estado_es_final:       Joi.number().valid(0, 1),
      estado_es_ganado:      Joi.number().valid(0, 1),
      estado_requiere_fecha: Joi.number().valid(0, 1),
      estado_orden:          Joi.number().integer(),
      estado_activo:         Joi.number().valid(0, 1)
    }).min(1)
  },
  resultado: {
    create: Joi.object({
      resultado_grupo_id:       Joi.number().integer().required(),
      resultado_codigo:         Joi.string().max(30).required(),
      resultado_nombre:         Joi.string().max(80).required(),
      resultado_icono:          Joi.string().max(10).allow('', null),
      resultado_es_positivo:    Joi.number().valid(0, 1).default(1),
      resultado_requiere_fecha: Joi.number().valid(0, 1).default(0),
      resultado_orden:          Joi.number().integer().default(0),
      resultado_activo:         Joi.number().valid(0, 1).default(1)
    }),
    update: Joi.object({
      resultado_codigo:         Joi.string().max(30),
      resultado_nombre:         Joi.string().max(80),
      resultado_icono:          Joi.string().max(10).allow('', null),
      resultado_es_positivo:    Joi.number().valid(0, 1),
      resultado_requiere_fecha: Joi.number().valid(0, 1),
      resultado_orden:          Joi.number().integer(),
      resultado_activo:         Joi.number().valid(0, 1)
    }).min(1)
  },
  fuente: {
    create: Joi.object({
      fuente_area_id:   Joi.number().integer().required(),
      fuente_codigo:    Joi.string().max(30).required(),
      fuente_nombre:    Joi.string().max(80).required(),
      fuente_es_masiva: Joi.number().valid(0, 1).default(0),
      fuente_activa:    Joi.number().valid(0, 1).default(1),
      fuente_orden:     Joi.number().integer().default(0)
    }),
    update: Joi.object({
      fuente_codigo:    Joi.string().max(30),
      fuente_nombre:    Joi.string().max(80),
      fuente_es_masiva: Joi.number().valid(0, 1),
      fuente_activa:    Joi.number().valid(0, 1),
      fuente_orden:     Joi.number().integer()
    }).min(1)
  },
  punto: {
    create: Joi.object({
      punto_codigo:    Joi.string().max(20).required(),
      punto_nombre:    Joi.string().max(100).required(),
      punto_direccion: Joi.string().max(200).allow('', null),
      punto_ciudad:    Joi.string().max(80).default('Cucuta'),
      punto_telefono:  Joi.string().max(20).allow('', null),
      punto_activo:    Joi.number().valid(0, 1).default(1)
    }),
    update: Joi.object({
      punto_codigo:    Joi.string().max(20),
      punto_nombre:    Joi.string().max(100),
      punto_direccion: Joi.string().max(200).allow('', null),
      punto_ciudad:    Joi.string().max(80),
      punto_telefono:  Joi.string().max(20).allow('', null),
      punto_activo:    Joi.number().valid(0, 1)
    }).min(1)
  }
};
