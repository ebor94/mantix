/**
 * src/services/crmSync.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sincronización automática afiliado → sv_crm_personas + sv_crm_prospectos.
 *
 * Cuándo se llama:
 *   - Al registrar un afiliado nuevo (canal ASESOR en afiliado.controller.js)
 *   - Fire-and-forget: los errores se loguean pero NO bloquean la respuesta HTTP.
 *
 * Flujo:
 *   1. Upsert sv_crm_personas  (busca por teléfono → documento → crea)
 *   2. Si no existe prospecto activo en area_id=3 para esa persona → crea prospecto
 *      con valores fijos: area=3, grupo=3, estado=16, fuente=11, prioridad=5, activo=1
 *
 * Mapeo afiliados → sv_crm_personas:
 *   primerNombre + segundoNombre       → persona_nombre
 *   primerApellido + segundoApellido   → persona_apellido
 *   celular                            → persona_telefono_principal + persona_telefono_norm
 *   celular2                           → persona_telefono_alterno
 *   email, tipoDocumento, numeroDocumento, direccion, barrio, ciudad,
 *   fechaNacimiento, sexo (X→N)        → campos directos
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { SvPersona, SvProspecto } = require('../sv/models');
const { normalizar, esValido }    = require('../sv/utils/telefono');
const logger = require('../utils/logger');

const TAG = '[CrmSync]';

// ── Valores fijos del prospecto generado desde afiliación ─────────────────────
const PROSP_DEFAULTS = {
  prosp_area_id:    3,
  prosp_grupo_id:   3,
  prosp_estado_id:  16,
  prosp_fuente_id:  11,
  prosp_prioridad:  5,
  prosp_activo:     1
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye el payload de sv_crm_personas a partir de un afiliado.
 */
function buildPersonaPayload(afiliado) {
  const nombre = [afiliado.primerNombre, afiliado.segundoNombre]
    .filter(Boolean).join(' ').trim() || null;

  const apellido = [afiliado.primerApellido, afiliado.segundoApellido]
    .filter(Boolean).join(' ').trim() || null;

  const telefonoNorm = esValido(afiliado.celular)
    ? normalizar(afiliado.celular)
    : null;

  // sexo M/F → M/F;  X → 'N' (neutro en CRM)
  const genero = afiliado.sexo === 'X' ? 'N' : (afiliado.sexo || null);

  const payload = {
    persona_nombre:             nombre,
    persona_apellido:           apellido,
    persona_telefono_principal: afiliado.celular        || null,
    persona_telefono_norm:      telefonoNorm,
    persona_telefono_alterno:   afiliado.celular2       || null,
    persona_email:              afiliado.email          || null,
    persona_documento_tipo:     afiliado.tipoDocumento  || null,
    persona_documento_num:      afiliado.numeroDocumento || null,
    persona_direccion:          afiliado.direccion      || null,
    persona_barrio:             afiliado.barrio         || null,
    persona_ciudad:             afiliado.ciudad         || 'Cucuta',
    persona_fecha_nacimiento:   afiliado.fechaNacimiento || null,
    persona_genero:             genero
  };

  return { payload, telefonoNorm };
}

/**
 * Upsert en sv_crm_personas.
 * Retorna la instancia de Persona (creada o actualizada).
 */
async function upsertPersona(data) {
  const { payload, telefonoNorm } = buildPersonaPayload(data);

  if (!payload.persona_nombre) {
    logger.warn(`${TAG} Afiliado id=${data.id} sin nombre, se omite sync CRM.`);
    return null;
  }

  let persona = null;
  let accion  = 'crear';

  // 1. Buscar por teléfono normalizado (UNIQUE en la tabla)
  if (telefonoNorm) {
    persona = await SvPersona.findOne({ where: { persona_telefono_norm: telefonoNorm } });
    if (persona) accion = 'actualizar-telefono';
  }

  // 2. Buscar por documento
  if (!persona && data.tipoDocumento && data.numeroDocumento) {
    persona = await SvPersona.findOne({
      where: {
        persona_documento_tipo: data.tipoDocumento,
        persona_documento_num:  data.numeroDocumento
      }
    });
    if (persona) accion = 'actualizar-documento';
  }

  // 3. Actualizar o crear
  if (persona) {
    await persona.update(payload);
    logger.info(`${TAG} Persona id=${persona.persona_id} actualizada (${accion}) ← afiliado id=${data.id}`);
  } else {
    if (!telefonoNorm) {
      logger.warn(`${TAG} Afiliado id=${data.id} sin teléfono válido, no se puede crear persona CRM.`);
      return null;
    }
    persona = await SvPersona.create(payload);
    logger.info(`${TAG} Persona id=${persona.persona_id} creada en CRM ← afiliado id=${data.id}`);
  }

  return persona;
}

/**
 * Crea un prospecto en sv_crm_prospectos si la persona no tiene uno activo
 * en area_id = PROSP_DEFAULTS.prosp_area_id.
 */
async function crearProspectoSiNoExiste(persona, afiliado) {
  const personaId = persona.persona_id;

  // Verificar si ya existe un prospecto activo para esta persona en el área
  const existente = await SvProspecto.findOne({
    where: {
      prosp_persona_id: personaId,
      prosp_area_id:    PROSP_DEFAULTS.prosp_area_id,
      prosp_activo:     1
    }
  });

  if (existente) {
    logger.info(
      `${TAG} Persona id=${personaId} ya tiene prospecto activo id=${existente.prosp_id}` +
      ` en area=${PROSP_DEFAULTS.prosp_area_id}, se omite creación.`
    );
    return;
  }

  const nombreCompleto = [afiliado.primerNombre, afiliado.primerApellido]
    .filter(Boolean).join(' ');

  const prospecto = await SvProspecto.create({
    ...PROSP_DEFAULTS,
    prosp_persona_id:  personaId,
    prosp_nota_inicial: `Afiliado registrado desde Mantix — ${nombreCompleto} | Doc: ${afiliado.tipoDocumento || ''} ${afiliado.numeroDocumento || ''}`
  });

  logger.info(
    `${TAG} Prospecto id=${prospecto.prosp_id} creado` +
    ` (area=${PROSP_DEFAULTS.prosp_area_id}, persona=${personaId}) ← afiliado id=${afiliado.id}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Punto de entrada principal.
 * Sincroniza un afiliado recién creado: upsert persona → crear prospecto.
 * Siempre resuelve — nunca lanza excepción al caller.
 *
 * @param {Object} afiliado  Instancia Sequelize o plain object del afiliado
 */
async function sincronizarAfiliado(afiliado) {
  try {
    if (!afiliado) {
      logger.warn(`${TAG} sincronizarAfiliado llamado sin afiliado, se omite.`);
      return;
    }

    const data = typeof afiliado.toJSON === 'function' ? afiliado.toJSON() : afiliado;

    // 1. Upsert persona
    const persona = await upsertPersona(data);
    if (!persona) return; // sin persona no hay prospecto

    // 2. Crear prospecto si no existe uno activo
    await crearProspectoSiNoExiste(persona, data);

  } catch (err) {
    logger.error(`${TAG} Error sincronizando afiliado id=${afiliado?.id ?? '?'}: ${err.message}`);
  }
}

module.exports = { sincronizarAfiliado };
