/**
 * sv/services/recuperacionAuto.service.js
 *
 * Cuando un prospecto de Previsión (PREV-EMP o PREV-PAP) pasa a estado_es_final
 * AND NOT estado_es_ganado (perdido, descartado, cancelado), automáticamente
 * crea un nuevo prospecto en SVC con:
 *   - subproceso = 'recuperacion'
 *   - asesor_id = null  (queda en cola del supervisor SVC)
 *   - fuente = CANCEL_PREV_EMP o CANCEL_PREV_PAP según área origen
 *   - estado = PARA_RECUPERAR
 *   - nota_inicial con trazabilidad
 *
 * Idempotente: si ya existe un prospecto SVC activo de esa persona en
 * subproceso='recuperacion', NO crea uno nuevo (evita duplicados).
 */
const { Op } = require('sequelize');
const { SvProspecto, SvEstado, SvFuente, SvArea, SvGrupo } = require('../models');
const logger = require('../../utils/logger');

const AREA_SVC_ID  = 4;
const GRUPO_SVC_ID = 4;
const GRUPOS_PREVISION = [2, 3];  // EMPRESARIALES + PAP

// Mapeo grupo origen → código fuente SVC
const FUENTE_POR_GRUPO_ORIGEN = {
  2: 'CANCEL_PREV_EMP',
  3: 'CANCEL_PREV_PAP'
};

/**
 * Evalúa si el cambio de estado debe disparar recuperación auto.
 * @param {object} prospecto - prospecto que cambió
 * @param {object} estadoNuevo - estado al que pasó (incluye es_final/es_ganado)
 * @returns {boolean}
 */
function debeDispararRecuperacion(prospecto, estadoNuevo) {
  if (!estadoNuevo) return false;
  if (!estadoNuevo.estado_es_final) return false;
  if (estadoNuevo.estado_es_ganado) return false;  // si ganó, no hay nada que recuperar
  if (!GRUPOS_PREVISION.includes(prospecto.prosp_grupo_id)) return false;  // solo Previsión
  return true;
}

/**
 * Crea el prospecto SVC de recuperación si corresponde.
 * @param {object} args - { prospectoOrigen, estadoNuevo, transaction }
 * @returns {Promise<object|null>} - prospecto SVC creado, o null si no aplicó
 */
async function intentarRecuperacion({ prospectoOrigen, estadoNuevo, transaction = null }) {
  if (!debeDispararRecuperacion(prospectoOrigen, estadoNuevo)) return null;

  const personaId = prospectoOrigen.prosp_persona_id;
  if (!personaId) return null;  // empresariales puros (sin persona) no aplican

  // Idempotencia: no duplicar si ya hay uno activo
  const yaExiste = await SvProspecto.findOne({
    where: {
      prosp_persona_id: personaId,
      prosp_area_id:    AREA_SVC_ID,
      prosp_grupo_id:   GRUPO_SVC_ID,
      prosp_subproceso: 'recuperacion',
      prosp_activo:     1
    },
    transaction
  });
  if (yaExiste) {
    logger.info(`[SVC-Recup] Persona ${personaId} ya tiene prospecto SVC activo (#${yaExiste.prosp_id}); no se duplica.`);
    return yaExiste;
  }

  // Resolver fuente según grupo origen
  const fuenteCodigo = FUENTE_POR_GRUPO_ORIGEN[prospectoOrigen.prosp_grupo_id];
  const fuente = await SvFuente.findOne({
    where: { fuente_area_id: AREA_SVC_ID, fuente_codigo: fuenteCodigo, fuente_activa: 1 },
    transaction
  });

  // Estado inicial SVC: PARA_RECUPERAR
  const estadoInicial = await SvEstado.findOne({
    where: { estado_grupo_id: GRUPO_SVC_ID, estado_codigo: 'PARA_RECUPERAR', estado_activo: 1 },
    transaction
  });
  if (!estadoInicial) {
    logger.error(`[SVC-Recup] No se encontró estado PARA_RECUPERAR en grupo SVC`);
    return null;
  }

  // Nombre del área origen para la nota
  const areaOrigen = await SvArea.findByPk(prospectoOrigen.prosp_area_id, { transaction });
  const nota = `[Auto] Cliente entró a recuperación tras quedar en estado "${estadoNuevo.estado_nombre}" en área ${areaOrigen?.area_nombre || ''} (prospecto origen #${prospectoOrigen.prosp_id}).`;

  const nuevo = await SvProspecto.create({
    prosp_area_id:    AREA_SVC_ID,
    prosp_grupo_id:   GRUPO_SVC_ID,
    prosp_persona_id: personaId,
    prosp_asesor_id:  null,                      // SIN ASIGNAR → cola supervisor SVC
    prosp_estado_id:  estadoInicial.estado_id,
    prosp_fuente_id:  fuente?.fuente_id || null,
    prosp_subproceso: 'recuperacion',
    prosp_prioridad:  3,
    prosp_nota_inicial: nota
  }, { transaction });

  logger.info(`[SVC-Recup] Creado prospecto SVC #${nuevo.prosp_id} para persona ${personaId} (origen #${prospectoOrigen.prosp_id})`);
  return nuevo;
}

module.exports = { intentarRecuperacion, debeDispararRecuperacion };
