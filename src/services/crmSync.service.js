/**
 * src/services/crmSync.service.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sincronización automática afiliado → sv_crm_personas.
 *
 * Cuándo se llama:
 *   - Al registrar un afiliado nuevo (create / createPublico en afiliado.controller.js)
 *   - Fire-and-forget: los errores se loguean pero NO bloquean la respuesta HTTP.
 *
 * Lógica upsert (en orden de prioridad):
 *   1. Buscar por persona_telefono_norm  (celular normalizado — UNIQUE en la tabla)
 *   2. Si no existe, buscar por documento (tipo + número)
 *   3. Si existe cualquiera → actualizar los campos mapeados
 *   4. Si no existe ninguno → crear el registro nuevo
 *
 * Mapeo de campos  afiliados → sv_crm_personas:
 *   primerNombre + segundoNombre  → persona_nombre
 *   primerApellido + segundoApellido → persona_apellido
 *   celular                       → persona_telefono_principal + persona_telefono_norm
 *   celular2                      → persona_telefono_alterno
 *   email                         → persona_email
 *   tipoDocumento                 → persona_documento_tipo
 *   numeroDocumento               → persona_documento_num
 *   direccion                     → persona_direccion
 *   barrio                        → persona_barrio
 *   ciudad                        → persona_ciudad
 *   fechaNacimiento               → persona_fecha_nacimiento
 *   sexo (M/F/X)                  → persona_genero (M/F/N)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { SvPersona } = require('../sv/models');
const { normalizar, esValido } = require('../sv/utils/telefono');
const logger = require('../utils/logger');

const TAG = '[CrmSync]';

/**
 * Construye el payload de sv_crm_personas a partir de un afiliado (plain object o instancia).
 * @param {Object} afiliado
 * @returns {{ payload: Object, telefonoNorm: string|null }}
 */
function buildPayload(afiliado) {
  const nombre = [afiliado.primerNombre, afiliado.segundoNombre]
    .filter(Boolean).join(' ').trim() || null;

  const apellido = [afiliado.primerApellido, afiliado.segundoApellido]
    .filter(Boolean).join(' ').trim() || null;

  const telefonoNorm = esValido(afiliado.celular)
    ? normalizar(afiliado.celular)
    : null;

  // sexo M/F → M/F;  X (indefinido) → 'N' (neutro/no-binario en CRM)
  const genero = afiliado.sexo === 'X' ? 'N' : (afiliado.sexo || null);

  const payload = {
    persona_nombre:             nombre,
    persona_apellido:           apellido,
    persona_telefono_principal: afiliado.celular   || null,
    persona_telefono_norm:      telefonoNorm,
    persona_telefono_alterno:   afiliado.celular2  || null,
    persona_email:              afiliado.email     || null,
    persona_documento_tipo:     afiliado.tipoDocumento    || null,
    persona_documento_num:      afiliado.numeroDocumento  || null,
    persona_direccion:          afiliado.direccion || null,
    persona_barrio:             afiliado.barrio    || null,
    persona_ciudad:             afiliado.ciudad    || 'Cucuta',
    persona_fecha_nacimiento:   afiliado.fechaNacimiento || null,
    persona_genero:             genero
  };

  return { payload, telefonoNorm };
}

/**
 * Sincroniza un afiliado recién creado con sv_crm_personas.
 * Siempre resuelve — nunca lanza excepción al caller.
 *
 * @param {Object} afiliado  Objeto afiliado (Sequelize instance o plain object)
 * @returns {Promise<void>}
 */
async function sincronizarAfiliado(afiliado) {
  try {
    if (!afiliado) {
      logger.warn(`${TAG} sincronizarAfiliado llamado sin afiliado, se omite.`);
      return;
    }

    // Serializar si es instancia Sequelize
    const data = typeof afiliado.toJSON === 'function' ? afiliado.toJSON() : afiliado;

    const { payload, telefonoNorm } = buildPayload(data);

    if (!payload.persona_nombre) {
      logger.warn(`${TAG} Afiliado id=${data.id} sin nombre, se omite sync CRM.`);
      return;
    }

    let persona = null;
    let accion  = 'crear';

    // ── 1. Buscar por teléfono normalizado (más fiable) ──────────────────────
    if (telefonoNorm) {
      persona = await SvPersona.findOne({
        where: { persona_telefono_norm: telefonoNorm }
      });
      if (persona) accion = 'actualizar-telefono';
    }

    // ── 2. Si no hay match de teléfono, buscar por documento ────────────────
    if (!persona && data.tipoDocumento && data.numeroDocumento) {
      persona = await SvPersona.findOne({
        where: {
          persona_documento_tipo: data.tipoDocumento,
          persona_documento_num:  data.numeroDocumento
        }
      });
      if (persona) accion = 'actualizar-documento';
    }

    // ── 3. Actualizar o crear ────────────────────────────────────────────────
    if (persona) {
      await persona.update(payload);
      logger.info(
        `${TAG} Persona id=${persona.persona_id} actualizada` +
        ` (razón: ${accion}) ← afiliado id=${data.id}`
      );
    } else {
      if (!telefonoNorm) {
        logger.warn(
          `${TAG} Afiliado id=${data.id} sin teléfono válido, no se puede crear persona CRM.`
        );
        return;
      }
      const nueva = await SvPersona.create(payload);
      logger.info(
        `${TAG} Persona id=${nueva.persona_id} creada en CRM ← afiliado id=${data.id}`
      );
    }
  } catch (err) {
    // NUNCA relanzar — este servicio es fire-and-forget
    logger.error(`${TAG} Error sincronizando afiliado id=${afiliado?.id ?? '?'}: ${err.message}`);
  }
}

module.exports = { sincronizarAfiliado };
