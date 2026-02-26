const Joi = require('joi');

// ── Esquema de beneficiario ───────────────────────────────────
const beneficiarioSchema = Joi.object({
  tipoBeneficiario: Joi.string().valid('DE_LEY', 'ADICIONAL').required()
    .messages({ 'any.only': 'Tipo de beneficiario debe ser DE_LEY o ADICIONAL' }),

  parentesco: Joi.string().valid(
    'ABUELASTRO (A)', 'ABUELO (A)', 'AHIJADO (A)', 'ASEGURADO PRINCIPAL',
    'BISABUELO (A)', 'BISNIETO (A)', 'COMPAÑERO (A)', 'CONYUGE',
    'CUÑADO (A)', 'EX-ESPOSO (A)', 'HERMANASTRO (A)', 'HERMANO (A)',
    'HERMANO CON INCAPACIDAD', 'HIJASTRO (A)', 'HIJO (A)', 'HIJO ADOPTIVO',
    'HIJO CON INCAPACIDAD', 'MADRASTRA', 'MADRE', 'MADRINA',
    'NIETO (A)', 'OTRO', 'PADRASTRO', 'PADRE', 'PADRINO',
    'PRIMO (A)', 'PROTEGIDO (A)', 'SERVICIO DOMESTICO (A)', 'SOBRINO (A)',
    'SUEGRASTRO', 'SUEGRO (A)', 'TIO (A)', 'YERNO/NUERA'
  ).required()
    .messages({ 'any.only': 'Parentesco no válido' }),

  genero: Joi.string().valid('M', 'F').allow('', null),

  valorPorPersona: Joi.number().min(0).allow(null),

  tipoDocumento: Joi.string().valid('CC', 'TI', 'CE', 'PA', 'NIT', 'PPT', 'ADT').required()
    .messages({ 'any.only': 'Tipo de documento no válido' }),

  numeroDocumento: Joi.string().pattern(/^\d{5,20}$/).required().trim()
    .messages({ 'string.pattern.base': 'Número de documento debe tener entre 5 y 20 dígitos' }),

  primerApellido: Joi.string().max(80).required().trim()
    .messages({ 'string.empty': 'Primer apellido es obligatorio' }),
  segundoApellido: Joi.string().max(80).allow('', null).trim(),
  primerNombre: Joi.string().max(80).required().trim()
    .messages({ 'string.empty': 'Primer nombre es obligatorio' }),
  segundoNombre: Joi.string().max(80).allow('', null).trim(),

  fechaNacimiento: Joi.date().iso().max('now').required()
    .messages({ 'date.max': 'Fecha de nacimiento no puede ser futura' }),
  edad: Joi.number().integer().min(0).max(150).required(),

  estado: Joi.string().valid('ACTUALIZACION', 'RETIRO', 'INGRESO').required()
    .messages({ 'any.only': 'Estado debe ser ACTUALIZACION, RETIRO o INGRESO' })
});

// ── Esquema de seguro ─────────────────────────────────────────
const seguroSchema = Joi.object({
  nombre: Joi.string().valid('SOLICANASTA', 'ACCIDENTES', 'SINERGIA', 'SOLIENVIDA').required()
    .messages({ 'any.only': 'Nombre de seguro no válido' }),
  monto: Joi.number().positive().required()
    .messages({ 'number.positive': 'El monto del seguro debe ser positivo' }),
  prima: Joi.number().min(0).default(0)
});

// ── Esquema del contrato / valor ──────────────────────────────
const contratoSchema = Joi.object({
  tarifaId: Joi.number().integer().positive().allow(null),
  valorPlanExequial: Joi.number().min(0).default(0),
  valorAdicionales: Joi.number().min(0).default(0),
  valorSeguros: Joi.number().min(0).default(0),
  valorTotal: Joi.number().min(0).default(0),
  periodicidad: Joi.string()
    .valid('MENSUAL', 'ANUAL', 'TRIMESTRAL', 'SEMESTRAL', 'SEMANAL')
    .default('MENSUAL'),
  nCuotas: Joi.number().integer().min(1).default(1),
  valorCuota: Joi.number().min(0).default(0)
});

// ── Esquema principal afiliado ────────────────────────────────
const createAfiliadoSchema = Joi.object({
  // Datos de solicitud
  sucursal: Joi.string()
    .valid('CUCUTA', 'PAMPLONA', 'OCAÑA', 'SARAVENA', 'ARAUCA', 'TAME', 'CRISTO REY', 'ARAUQUITA')
    .allow('', null),
  novedad: Joi.string().valid('NUEVO', 'CAMBIO', 'TRASLADO', 'ACTUALIZACION').allow('', null),
  vigenciaDesde: Joi.date().iso().allow('', null),
  vigenciaHasta: Joi.date().iso().min(Joi.ref('vigenciaDesde')).allow('', null)
    .messages({ 'date.min': 'Vigencia hasta no puede ser anterior a Vigencia desde' }),

  // Identificación
  tipoDocumento: Joi.string().valid('CC', 'TI', 'CE', 'PA', 'NIT').required()
    .messages({ 'any.only': 'Tipo de documento no válido' }),
  numeroDocumento: Joi.string().pattern(/^\d{5,15}$/).required().trim()
    .messages({ 'string.pattern.base': 'Número de documento debe tener entre 5 y 15 dígitos' }),
  primerApellido: Joi.string().max(80).required().trim()
    .messages({ 'string.empty': 'Primer apellido es obligatorio' }),
  segundoApellido: Joi.string().max(80).allow('', null).trim(),
  primerNombre: Joi.string().max(80).required().trim()
    .messages({ 'string.empty': 'Primer nombre es obligatorio' }),
  segundoNombre: Joi.string().max(80).allow('', null).trim(),
  fechaNacimiento: Joi.date().iso().max('now').required()
    .messages({ 'date.max': 'Fecha de nacimiento no puede ser futura' }),
  edad: Joi.number().integer().min(0).max(150).required(),
  sexo: Joi.string().valid('F', 'M', 'X').required()
    .messages({ 'any.only': 'Sexo debe ser F, M o X' }),
  estadoCivil: Joi.string()
    .valid('SOLTERO', 'CASADO', 'UNION_LIBRE', 'DIVORCIADO', 'VIUDO', 'SEPARADO').required()
    .messages({ 'any.only': 'Estado civil no válido' }),

  // Contacto
  celular: Joi.string().pattern(/^\d{7,15}$/).required()
    .messages({ 'string.pattern.base': 'Celular debe tener entre 7 y 15 dígitos' }),
  celular2: Joi.string().pattern(/^\d{7,15}$/).allow('', null)
    .messages({ 'string.pattern.base': 'Celular 2 debe tener entre 7 y 15 dígitos' }),
  email: Joi.string().email().allow('', null)
    .messages({ 'string.email': 'Email no tiene formato válido' }),

  // Ubicación
  departamento: Joi.string().max(80).allow('', null).trim(),
  ciudad: Joi.string().max(80).allow('', null).trim(),
  barrio: Joi.string().max(120).allow('', null).trim(),
  direccion: Joi.string().max(200).allow('', null).trim(),

  // Empresa
  nit: Joi.string().max(20).allow('', null).trim(),
  nombreEmpresa: Joi.string().max(200).allow('', null).trim(),
  empresaId: Joi.number().integer().positive().allow(null),

  // Comercial
  canal: Joi.string().valid('EMPRESARIAL', 'INDIVIDUAL', 'CENS').allow('', null)
    .messages({ 'any.only': 'Canal debe ser EMPRESARIAL, INDIVIDUAL o CENS' }),
  producto: Joi.string().valid('VERDE', 'INTEGRAL', 'CENS').allow('', null)
    .messages({ 'any.only': 'Producto debe ser VERDE, INTEGRAL o CENS' }),
  grupo: Joi.string()
    .valid('UNIPERSONAL', 'UNIFAMILIAR', 'BASICO', 'CENS_II', 'INDIVIDUAL', 'TRADICIONAL')
    .allow('', null)
    .messages({ 'any.only': 'Grupo no válido' }),
  asistenciaFueraDeCasa: Joi.string().valid('SI', 'NO').allow('', null),

  // Actividad económica
  actividadEconomica: Joi.string().max(200).allow('', null).trim(),
  ocupacion: Joi.string().max(150).allow('', null).trim(),
  codigoCiiu: Joi.string().max(10).allow('', null).trim(),

  // Campos CENS — obligatorios cuando canal = 'CENS' (validación condicional)
  usuarioCens: Joi.when('canal', {
    is: 'CENS',
    then: Joi.string().max(80).required()
      .messages({ 'string.empty': 'Usuario CENS es obligatorio para canal CENS' }),
    otherwise: Joi.string().max(80).allow('', null)
  }),
  cicloEstrato: Joi.when('canal', {
    is: 'CENS',
    then: Joi.string().max(20).required()
      .messages({ 'string.empty': 'Ciclo/Estrato es obligatorio para canal CENS' }),
    otherwise: Joi.string().max(20).allow('', null)
  }),
  relacionPredio: Joi.when('canal', {
    is: 'CENS',
    then: Joi.string().valid('FAMILIAR', 'ARRENDADO', 'PROPIETARIO').required()
      .messages({ 'any.only': 'Relación con el predio es obligatoria para canal CENS' }),
    otherwise: Joi.string().valid('FAMILIAR', 'ARRENDADO', 'PROPIETARIO').allow('', null)
  }),

  // Observaciones
  observaciones: Joi.string().max(2000).allow('', null).trim(),

  // Relaciones anidadas
  beneficiarios: Joi.array().items(beneficiarioSchema).min(0).default([]),
  seguros: Joi.array().items(seguroSchema).min(0).default([]),
  contrato: contratoSchema.default({})
});

// ── Esquema empresa (POST /empresas) ──────────────────────────
const createEmpresaSchema = Joi.object({
  nit: Joi.string().max(20).required().trim()
    .messages({ 'string.empty': 'NIT es obligatorio' }),
  nombre: Joi.string().max(200).required().trim()
    .messages({ 'string.empty': 'Nombre de empresa es obligatorio' })
});

module.exports = { createAfiliadoSchema, beneficiarioSchema, seguroSchema, createEmpresaSchema };
