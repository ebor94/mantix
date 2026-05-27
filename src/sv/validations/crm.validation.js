/**
 * sv/validations/crm.validation.js
 * Joi schemas para personas, prospectos, gestiones y listas.
 */
const Joi = require('joi');

const personas = {
  buscar: Joi.object({
    telefono: Joi.string().min(7).required()
  }),
  create: Joi.object({
    persona_nombre:             Joi.string().min(2).max(100).required(),
    persona_apellido:           Joi.string().max(100).allow('', null),
    persona_telefono_principal: Joi.string().min(7).max(20).required(),
    persona_telefono_alterno:   Joi.string().max(20).allow('', null),
    persona_email:              Joi.string().email().allow('', null),
    persona_documento_tipo:     Joi.string().valid('CC', 'CE', 'PAS', 'TI', 'NIT').allow('', null),
    persona_documento_num:      Joi.string().max(20).allow('', null),
    persona_direccion:          Joi.string().max(250).allow('', null),
    persona_barrio:             Joi.string().max(100).allow('', null),
    persona_ciudad:             Joi.string().max(80).default('Cucuta')
  }),
  update: Joi.object({
    persona_nombre:             Joi.string().min(2).max(100),
    persona_apellido:           Joi.string().max(100).allow('', null),
    persona_telefono_principal: Joi.string().min(7).max(20),
    persona_telefono_alterno:   Joi.string().max(20).allow('', null),
    persona_email:              Joi.string().email().allow('', null),
    persona_documento_tipo:     Joi.string().valid('CC', 'CE', 'PAS', 'TI', 'NIT').allow('', null),
    persona_documento_num:      Joi.string().max(20).allow('', null),
    persona_direccion:          Joi.string().max(250).allow('', null),
    persona_barrio:             Joi.string().max(100).allow('', null),
    persona_ciudad:             Joi.string().max(80)
  }).min(1)
};

const prospectos = {
  list: Joi.object({
    page:  Joi.number().integer().min(1).default(1),
    // Hasta 500: el Kanban necesita ver todos los activos del grupo de una vez.
    limit: Joi.number().integer().min(1).max(500).default(20),
    // Filtros de área/grupo: el frontend los pasa según el contexto de la vista
    // para que un supervisor multi-área no mezcle áreas distintas.
    area_id:    Joi.number().integer(),
    grupo_id:   Joi.number().integer(),
    estado_id:  Joi.number().integer(),
    estado_codigo: Joi.string().max(40),
    fuente_id:  Joi.number().integer(),
    punto_id:   Joi.number().integer(),
    lista_id:   Joi.number().integer(),
    zona_pap:   Joi.string().max(100),
    subproceso: Joi.string().valid('nuevo', 'recuperacion'),  // SVC comercial
    q:          Joi.string().min(2),
    filtro_rapido: Joi.string().valid('urgentes', 'hoy', 'proximas', 'sin_gestion', 'cerrados'),
    prox_gestion_fecha: Joi.date().iso(),
    prox_gestion_mes:   Joi.string().pattern(/^\d{4}-\d{2}$/)
  }),
  panelDia: Joi.object({
    asesor_id:  Joi.number().integer(),
    area_id:    Joi.number().integer(),
    grupo_id:   Joi.number().integer(),
    subproceso: Joi.string().valid('nuevo', 'recuperacion'),
    fecha: Joi.date().iso()
  }),
  agendaMes: Joi.object({
    anio: Joi.number().integer().min(2025).max(2099).required(),
    mes:  Joi.number().integer().min(1).max(12).required(),
    area_id:  Joi.number().integer(),
    grupo_id: Joi.number().integer()
  }),
  create: Joi.object({
    prosp_area_id:    Joi.number().integer().required(),
    prosp_grupo_id:   Joi.number().integer().required(),
    prosp_persona_id: Joi.number().integer(),
    prosp_empresa_id: Joi.number().integer(),
    prosp_contacto_empresa_id: Joi.number().integer(),
    prosp_asesor_id:  Joi.number().integer(),
    prosp_estado_id:  Joi.number().integer().required(),
    prosp_fuente_id:  Joi.number().integer(),
    prosp_punto_id:   Joi.number().integer(),
    prosp_lista_id:   Joi.number().integer(),
    prosp_prox_gestion_fecha: Joi.date().iso().allow(null),
    prosp_prox_gestion_hora:  Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).allow(null, ''),
    prosp_prioridad:  Joi.number().integer().min(1).max(5).default(3),
    prosp_zona_pap:   Joi.string().max(100).allow('', null),
    prosp_subproceso: Joi.string().valid('nuevo', 'recuperacion').allow(null),
    prosp_nota_inicial: Joi.string().allow('', null),
    productos: Joi.array().items(Joi.object({
      prod_id: Joi.number().integer().required(),
      es_principal: Joi.boolean().default(false),
      nota: Joi.string().max(200).allow('', null)
    })).default([])
  }).or('prosp_persona_id', 'prosp_empresa_id'),
  update: Joi.object({
    prosp_prox_gestion_fecha: Joi.date().iso().allow(null),
    prosp_prox_gestion_hora:  Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).allow(null, ''),
    prosp_prioridad:          Joi.number().integer().min(1).max(5),
    prosp_zona_pap:           Joi.string().max(100).allow('', null),
    prosp_nota_inicial:       Joi.string().allow('', null),
    prosp_punto_id:           Joi.number().integer().allow(null),
    prosp_fuente_id:          Joi.number().integer().allow(null)
  }).min(1),
  reasignar: Joi.object({
    nuevo_asesor_id: Joi.number().integer().required()
  })
};

const gestiones = {
  create: Joi.object({
    gest_prosp_id:        Joi.number().integer().required(),
    gest_asesor_id:       Joi.number().integer(),
    gest_resultado_id:    Joi.number().integer().allow(null),
    gest_estado_nuevo_id: Joi.number().integer().allow(null),
    gest_canal:           Joi.string().valid('llamada', 'presencial', 'correo').default('llamada'),
    gest_comentario:      Joi.string().allow('', null),
    gest_duracion_seg:    Joi.number().integer().min(0).allow(null),
    gest_prox_fecha:      Joi.date().iso().allow(null),
    gest_prox_hora:       Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).allow(null, ''),
    gest_ubicacion_lat:   Joi.number().min(-90).max(90).allow(null),
    gest_ubicacion_lng:   Joi.number().min(-180).max(180).allow(null),
    gest_fecha_hora:      Joi.date().iso()
  }),
  list: Joi.object({
    page:  Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    prosp_id: Joi.number().integer().required()
  }),
  resumenDia: Joi.object({
    asesor_id: Joi.number().integer(),
    fecha: Joi.date().iso()
  })
};

const listas = {
  cargar: Joi.object({
    area_id:  Joi.number().integer().required(),
    grupo_id: Joi.number().integer().required(),
    fuente_id: Joi.number().integer().required(),
    asesor_id: Joi.number().integer().required(),
    nombre:   Joi.string().max(150).allow('', null)
  })
};

const reportes = {
  dashboard: Joi.object({
    area_id:  Joi.number().integer(),
    grupo_id: Joi.number().integer(),
    asesor_id: Joi.number().integer(),
    fecha:    Joi.date().iso()
  }),
  asesor: Joi.object({
    mes:   Joi.number().integer().min(1).max(12),
    anio:  Joi.number().integer().min(2025).max(2099),
    desde: Joi.date().iso(),
    hasta: Joi.date().iso()
  }),
  equipo: Joi.object({
    grupo_id: Joi.number().integer().required(),
    fecha:    Joi.date().iso(),  // legacy: día único
    desde:    Joi.date().iso(),  // nuevo: rango
    hasta:    Joi.date().iso()
  })
};

const buscador = {
  buscar: Joi.object({
    q: Joi.string().min(2).required(),
    limit: Joi.number().integer().min(1).max(20).default(5)
  })
};

module.exports = { personas, prospectos, gestiones, listas, reportes, buscador };
