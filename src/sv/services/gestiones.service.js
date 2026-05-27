/**
 * sv/services/gestiones.service.js
 * Crear gestión INMUTABLE + actualizar prospecto en una transacción atómica.
 * Historial con paginación (lazy load).
 */
const { Op, fn, col, literal } = require('sequelize');
const {
  sequelize, SvGestion, SvProspecto, SvResultado, SvEstado, SvUsuario
} = require('../models');
const { rangoDia } = require('../utils/fechas');
const recuperacionAuto = require('./recuperacionAuto.service');
const logger = require('../../utils/logger');

async function crear(payload, asesorId) {
  const t = await sequelize.transaction();
  try {
    const gest = await SvGestion.create({
      gest_prosp_id:        payload.gest_prosp_id,
      gest_asesor_id:       payload.gest_asesor_id || asesorId,
      gest_resultado_id:    payload.gest_resultado_id || null,
      gest_estado_nuevo_id: payload.gest_estado_nuevo_id || null,
      gest_canal:           payload.gest_canal || 'llamada',
      gest_comentario:      payload.gest_comentario || null,
      gest_duracion_seg:    payload.gest_duracion_seg || null,
      gest_prox_fecha:      payload.gest_prox_fecha || null,
      gest_prox_hora:       payload.gest_prox_hora  || null,
      gest_ubicacion_lat:   payload.gest_ubicacion_lat || null,
      gest_ubicacion_lng:   payload.gest_ubicacion_lng || null,
      gest_fecha_hora:      payload.gest_fecha_hora || new Date()
    }, { transaction: t });

    // Actualizar prospecto si hay nuevo estado o nueva fecha
    const prospUpdate = {};
    if (payload.gest_estado_nuevo_id) prospUpdate.prosp_estado_id = payload.gest_estado_nuevo_id;
    if (payload.gest_prox_fecha)      prospUpdate.prosp_prox_gestion_fecha = payload.gest_prox_fecha;
    if (payload.gest_prox_hora)       prospUpdate.prosp_prox_gestion_hora  = payload.gest_prox_hora;

    // Si el cambio es a un estado FINAL (firmado/cerrado/perdido), ajustar la próxima gestión
    // para que no aparezca colgada en el calendario / urgentes futuros.
    //   - Si había una fecha agendada en el FUTURO → reemplazar por la fecha de firma (hoy)
    //   - La hora se elimina (ya no aplica como pendiente)
    let estadoNuevoAdvance = null;
    if (payload.gest_estado_nuevo_id) {
      estadoNuevoAdvance = await SvEstado.findByPk(payload.gest_estado_nuevo_id, { transaction: t });
      if (estadoNuevoAdvance?.estado_es_final) {
        const prospActual = await SvProspecto.findByPk(payload.gest_prosp_id, { transaction: t });
        const fechaFirma = require('../utils/fechas').aISO(payload.gest_fecha_hora || new Date());
        const proxActual = require('../utils/fechas').aISO(prospActual?.prosp_prox_gestion_fecha);
        if (proxActual && proxActual > fechaFirma) {
          prospUpdate.prosp_prox_gestion_fecha = fechaFirma;
          prospUpdate.prosp_prox_gestion_hora  = null;
        }
      }
    }

    if (Object.keys(prospUpdate).length) {
      await SvProspecto.update(prospUpdate, { where: { prosp_id: payload.gest_prosp_id }, transaction: t });
    }

    // Hook cross-área: si pasó a estado final NO ganado en Previsión, disparar recuperación SVC
    let recuperacionGenerada = null;
    if (payload.gest_estado_nuevo_id) {
      const [prospecto, estadoNuevo] = await Promise.all([
        SvProspecto.findByPk(payload.gest_prosp_id, { transaction: t }),
        Promise.resolve(estadoNuevoAdvance) // reusar el ya cargado
      ]);
      try {
        recuperacionGenerada = await recuperacionAuto.intentarRecuperacion({
          prospectoOrigen: prospecto,
          estadoNuevo,
          transaction: t
        });
      } catch (e) {
        // No bloquear el flujo principal si la recuperación auto falla
        logger.error(`[Gestiones] Falló recuperación auto: ${e.message}`);
      }
    }

    await t.commit();

    // Devolver con relaciones cargadas + info de recuperación generada (si aplica)
    const result = await SvGestion.findByPk(gest.gest_id, {
      include: [
        { model: SvResultado, as: 'resultado' },
        { model: SvEstado,    as: 'estadoNuevo' },
        { model: SvUsuario,   as: 'asesor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
      ]
    });
    if (recuperacionGenerada) {
      result.dataValues.recuperacion_svc = {
        prosp_id: recuperacionGenerada.prosp_id,
        mensaje: 'Se generó un prospecto SVC para recuperación de este cliente.'
      };
    }
    return result;
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

async function historial(prospId, { page = 1, limit = 20 } = {}) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { rows, count } = await SvGestion.findAndCountAll({
    where: { gest_prosp_id: prospId },
    include: [
      { model: SvResultado, as: 'resultado' },
      { model: SvEstado,    as: 'estadoNuevo' },
      { model: SvUsuario,   as: 'asesor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
    ],
    order: [['gest_fecha_hora', 'DESC']],
    limit: parseInt(limit),
    offset
  });
  return { items: rows, total: count, page: parseInt(page), limit: parseInt(limit), hasMore: offset + rows.length < count };
}

async function resumenDia(asesorId, fecha) {
  const { start, end } = rangoDia(fecha);
  const rows = await SvGestion.findAll({
    where: {
      gest_asesor_id: asesorId,
      gest_fecha_hora: { [Op.gte]: start, [Op.lte]: end }
    },
    attributes: [
      [fn('COUNT', col('gest_id')), 'total'],
      [fn('SUM', literal('CASE WHEN resultado.resultado_es_positivo = 1 THEN 1 ELSE 0 END')), 'positivas'],
      [fn('SUM', literal('CASE WHEN gest_canal = \'llamada\'    THEN 1 ELSE 0 END')), 'llamadas'],
      [fn('SUM', literal('CASE WHEN gest_canal = \'presencial\' THEN 1 ELSE 0 END')), 'presenciales']
    ],
    include: [{ model: SvResultado, as: 'resultado', attributes: [] }],
    raw: true
  });
  return rows[0] || { total: 0, positivas: 0, llamadas: 0, presenciales: 0 };
}

module.exports = { crear, historial, resumenDia };
