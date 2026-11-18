/**
 * sv/services/personas.service.js
 * CRUD + anti-duplicados de personas naturales.
 * El UNIQUE real es sobre persona_telefono_norm.
 *
 * Cross-área:
 * - prospectosActivos(personaId): prospectos activos del cliente en todas las áreas,
 *   solo con los campos que pinta el aviso cross-área
 * - historialCompleto(personaId): timeline cronológico de todas las gestiones cross-área
 * - alcancesDePersona(personaId): carga liviana para decidir si un usuario
 *   tiene relación con la persona (utils/alcancePersona)
 */
const {
  SvPersona, SvProspecto, SvGestion, SvArea, SvGrupo, SvEstado,
  SvUsuario, SvResultado, SvEmpresa
} = require('../models');
const { normalizar, esValido } = require('../utils/telefono');

class DuplicateError extends Error {
  constructor(persona, prospectosActivos = []) {
    super('DUPLICATE_PHONE');
    this.code = 'DUPLICATE_PHONE';
    this.persona = persona;
    this.prospectos_activos = prospectosActivos;
  }
}

async function buscarPorTelefono(telefono) {
  const norm = normalizar(telefono);
  if (!norm) return null;
  return SvPersona.findOne({ where: { persona_telefono_norm: norm } });
}

// Campos que pintan los consumidores del aviso cross-área (ProspectosCrossArea,
// HistorialClienteCompleto, NuevoProspecto). Quedan fuera la nota inicial, el
// contrato SAP, las fechas de convenio, la prioridad, la zona PAP, la fuente,
// el correo del asesor y el NIT de la empresa.
const ATRIBUTOS_CROSS_AREA = [
  'prosp_id', 'prosp_area_id', 'prosp_grupo_id', 'prosp_estado_id',
  'prosp_asesor_id', 'prosp_empresa_id', 'prosp_subproceso',
  'prosp_prox_gestion_fecha', 'prosp_prox_gestion_hora', 'prosp_updated_at'
];

/**
 * Prospectos activos del cliente en cualquier área: aviso cross-área de la
 * ficha, de /personas/buscar y del 409 por teléfono duplicado.
 */
async function prospectosActivos(personaId) {
  // Incluye prospectos donde la persona es persona_id O contacto_empresa_id
  const { Op } = require('sequelize');
  return SvProspecto.findAll({
    where: {
      prosp_activo: 1,
      [Op.or]: [
        { prosp_persona_id: personaId },
        { prosp_contacto_empresa_id: personaId }
      ]
    },
    attributes: ATRIBUTOS_CROSS_AREA,
    include: [
      { model: SvArea,    as: 'area',    attributes: ['area_id','area_codigo','area_nombre','area_color_hex','area_icono'] },
      { model: SvGrupo,   as: 'grupo',   attributes: ['grupo_id','grupo_codigo','grupo_nombre'] },
      { model: SvEstado,  as: 'estado',  attributes: ['estado_id','estado_codigo','estado_nombre','estado_color_hex','estado_es_final','estado_es_ganado'] },
      { model: SvUsuario, as: 'asesor',  attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvEmpresa, as: 'empresa', attributes: ['empresa_id','empresa_razon_social'] }
    ],
    order: [['prosp_updated_at', 'DESC']]
  });
}

/**
 * Prospectos de la persona como titular o como contacto de empresa, activos e
 * inactivos, con los 4 campos de la regla de alcance. Los inactivos cuentan:
 * quien abre la ficha de su prospecto cerrado conserva el aviso cross-área.
 */
async function alcancesDePersona(personaId) {
  const { Op } = require('sequelize');
  return SvProspecto.findAll({
    where: {
      [Op.or]: [
        { prosp_persona_id: personaId },
        { prosp_contacto_empresa_id: personaId }
      ]
    },
    attributes: ['prosp_id', 'prosp_asesor_id', 'prosp_grupo_id', 'prosp_area_id']
  });
}

/**
 * Historial cronológico unificado: todas las gestiones del cliente cross-área.
 */
async function historialCompleto(personaId) {
  const persona = await SvPersona.findByPk(personaId);
  if (!persona) return null;

  const prospectos = await prospectosActivos(personaId);
  const prospIds = prospectos.map(p => p.prosp_id);

  // Si no hay prospectos activos, intentar también con los inactivos (histórico completo)
  if (prospIds.length === 0) {
    const { Op } = require('sequelize');
    const todos = await SvProspecto.findAll({
      where: { [Op.or]: [{ prosp_persona_id: personaId }, { prosp_contacto_empresa_id: personaId }] },
      attributes: ['prosp_id']
    });
    prospIds.push(...todos.map(p => p.prosp_id));
  }

  let gestiones = [];
  if (prospIds.length) {
    gestiones = await SvGestion.findAll({
      where: { gest_prosp_id: prospIds },
      include: [
        { model: SvResultado, as: 'resultado' },
        { model: SvEstado,    as: 'estadoNuevo' },
        { model: SvUsuario,   as: 'asesor', attributes: ['usr_id','usr_nombre','usr_apellido'] },
        {
          model: SvProspecto, as: 'prospecto',
          attributes: ['prosp_id','prosp_area_id','prosp_grupo_id'],
          include: [
            { model: SvArea,  as: 'area',  attributes: ['area_id','area_codigo','area_nombre','area_color_hex','area_icono'] },
            { model: SvGrupo, as: 'grupo', attributes: ['grupo_id','grupo_codigo','grupo_nombre'] }
          ]
        }
      ],
      order: [['gest_fecha_hora', 'DESC']]
    });
  }

  return {
    persona,
    prospectos,
    gestiones,
    total_prospectos: prospectos.length,
    total_gestiones: gestiones.length,
    areas_con_actividad: [...new Set(prospectos.map(p => p.area?.area_codigo).filter(Boolean))]
  };
}

async function crear(payload) {
  const norm = normalizar(payload.persona_telefono_principal);
  if (!norm || !esValido(payload.persona_telefono_principal)) {
    const e = new Error('Teléfono inválido'); e.code = 'VALIDATION_ERROR'; throw e;
  }
  const existente = await SvPersona.findOne({ where: { persona_telefono_norm: norm } });
  if (existente) {
    // Incluir prospectos activos para informar al usuario
    const prosp = await prospectosActivos(existente.persona_id);
    throw new DuplicateError(existente, prosp);
  }

  return SvPersona.create({
    ...payload,
    persona_telefono_norm: norm
  });
}

async function actualizar(id, payload) {
  const persona = await SvPersona.findByPk(id);
  if (!persona) { const e = new Error('Persona no encontrada'); e.code = 'NOT_FOUND'; throw e; }

  // Si cambia el teléfono, re-normalizar y validar UNIQUE
  if (payload.persona_telefono_principal && payload.persona_telefono_principal !== persona.persona_telefono_principal) {
    const norm = normalizar(payload.persona_telefono_principal);
    if (!norm || !esValido(payload.persona_telefono_principal)) {
      const e = new Error('Teléfono inválido'); e.code = 'VALIDATION_ERROR'; throw e;
    }
    const otra = await SvPersona.findOne({ where: { persona_telefono_norm: norm } });
    if (otra && otra.persona_id !== id) {
      const prosp = await prospectosActivos(otra.persona_id);
      throw new DuplicateError(otra, prosp);
    }
    payload.persona_telefono_norm = norm;
  }
  await persona.update(payload);
  return persona;
}

async function obtener(id) {
  return SvPersona.findByPk(id);
}

module.exports = {
  buscarPorTelefono, crear, actualizar, obtener,
  prospectosActivos, historialCompleto, alcancesDePersona,
  DuplicateError
};
