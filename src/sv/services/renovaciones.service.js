/**
 * sv/services/renovaciones.service.js
 * Fase 8 — Renovaciones anuales de convenios B2B.
 *
 * Reglas:
 *  - Cuando un prospecto se cierra como CONVENIO firmado, se capturan fechas
 *    de inicio y vencimiento del convenio (típicamente +1 año).
 *  - 30 días antes del vencimiento, un job crea automáticamente un PROSPECTO
 *    NUEVO en estado EN_RENOVACION, asignado al mismo asesor, con fuente
 *    RENOVACION y prosp_origen_prosp_id apuntando al convenio anterior.
 *  - Si el convenio vence sin renovarse (no hay prospecto hijo con CONVENIO),
 *    el prospecto original se marca como VENCIDO (final, no ganado).
 *  - El convenio anterior queda intacto como histórico.
 */
const { Op, fn, col } = require('sequelize');
const {
  sequelize, SvProspecto, SvEmpresa, SvEstado, SvFuente, SvUsuario, SvPersona, SvGestion
} = require('../models');
const { aISO, hoyISO } = require('../utils/fechas');

const DIAS_ANTICIPACION = 30;
const GRUPO_EMPRESARIALES = 2;
const AREA_PREV_EMP = 2;

class RenovacionError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

/**
 * Marca el convenio como firmado con fechas de vigencia.
 * payload = { fecha_inicio, fecha_vencimiento? }
 * Si fecha_vencimiento no se pasa, se calcula como fecha_inicio + 1 año.
 */
async function marcarConvenioFirmado(prospId, { fecha_inicio, fecha_vencimiento = null }, actorId = null) {
  const p = await SvProspecto.findByPk(prospId, {
    include: [{ model: SvEstado, as: 'estado' }]
  });
  if (!p) throw new RenovacionError('NOT_FOUND', 'Prospecto no encontrado');
  if (p.prosp_grupo_id !== GRUPO_EMPRESARIALES) {
    throw new RenovacionError('VALIDATION_ERROR', 'Solo aplicable a prospectos B2B');
  }

  // Calcular vencimiento si no se pasa: +1 año
  let venc = fecha_vencimiento;
  if (!venc) {
    const d = new Date(fecha_inicio);
    d.setFullYear(d.getFullYear() + 1);
    venc = aISO(d);
  }

  // Buscar estado CONVENIO del grupo 2
  const estadoConv = await SvEstado.findOne({
    where: { estado_grupo_id: GRUPO_EMPRESARIALES, estado_codigo: 'CONVENIO', estado_activo: 1 }
  });
  if (!estadoConv) throw new RenovacionError('INTERNAL_ERROR', 'Estado CONVENIO no configurado');

  const t = await sequelize.transaction();
  try {
    await p.update({
      prosp_estado_id:                  estadoConv.estado_id,
      prosp_fecha_inicio_convenio:      aISO(fecha_inicio),
      prosp_fecha_vencimiento_convenio: venc
    }, { transaction: t });

    // Registrar gestión inmutable como traza
    if (actorId) {
      await SvGestion.create({
        gest_prosp_id:        prospId,
        gest_asesor_id:       actorId,
        gest_estado_nuevo_id: estadoConv.estado_id,
        gest_canal:           'sistema',
        gest_comentario:      `[Convenio firmado] Vigencia: ${aISO(fecha_inicio)} → ${venc}`
      }, { transaction: t });
    }
    await t.commit();
  } catch (e) { await t.rollback(); throw e; }

  return p.reload();
}

/**
 * Lista de empresas con convenio próximo a vencer (≤ N días).
 * Devuelve también el prospecto-convenio activo + el asesor.
 */
async function renovacionesProximas({ dias = DIAS_ANTICIPACION, scope = null } = {}) {
  const hoy = new Date();
  const limite = new Date(Date.now() + dias * 86400000);

  // Estados final-ganado del grupo 2 (típicamente solo CONVENIO)
  const estadosGanados = await SvEstado.findAll({
    where: { estado_grupo_id: GRUPO_EMPRESARIALES, estado_es_final: 1, estado_es_ganado: 1, estado_activo: 1 },
    attributes: ['estado_id']
  });
  const ganadosIds = estadosGanados.map(e => e.estado_id);
  if (!ganadosIds.length) return [];

  const where = {
    prosp_grupo_id: GRUPO_EMPRESARIALES,
    prosp_estado_id: { [Op.in]: ganadosIds },
    prosp_fecha_vencimiento_convenio: {
      [Op.gte]: aISO(hoy),
      [Op.lte]: aISO(limite)
    }
  };
  if (scope?.asesorId) where.prosp_asesor_id = scope.asesorId;

  const prospectos = await SvProspecto.findAll({
    where,
    include: [
      { model: SvEmpresa, as: 'empresa', attributes: ['empresa_id', 'empresa_razon_social', 'empresa_nit', 'empresa_sector'] },
      { model: SvUsuario, as: 'asesor',  attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] },
      { model: SvEstado,  as: 'estado',  attributes: ['estado_id', 'estado_nombre', 'estado_color_hex'] }
    ],
    order: [['prosp_fecha_vencimiento_convenio', 'ASC']]
  });

  // Verificar si ya hay prospecto de renovación creado para evitar doble alerta
  const prospIds = prospectos.map(p => p.prosp_id);
  let yaRenovados = new Set();
  if (prospIds.length) {
    const hijos = await SvProspecto.findAll({
      where: { prosp_origen_prosp_id: prospIds, prosp_activo: 1 },
      attributes: ['prosp_origen_prosp_id'],
      raw: true
    });
    yaRenovados = new Set(hijos.map(h => h.prosp_origen_prosp_id));
  }

  return prospectos.map(p => {
    const venc = new Date(p.prosp_fecha_vencimiento_convenio);
    const diasRest = Math.ceil((venc - hoy) / 86400000);
    return {
      ...p.toJSON(),
      dias_restantes: diasRest,
      renovacion_ya_creada: yaRenovados.has(p.prosp_id)
    };
  });
}

/**
 * Lista de empresas con convenio VENCIDO sin renovación — dashboard recuperación.
 * Estado: prospecto en VENCIDO (final, no ganado).
 */
async function vencidosSinRenovar({ scope = null } = {}) {
  const estadoVenc = await SvEstado.findOne({
    where: { estado_grupo_id: GRUPO_EMPRESARIALES, estado_codigo: 'VENCIDO', estado_activo: 1 },
    attributes: ['estado_id']
  });
  if (!estadoVenc) return [];

  const where = {
    prosp_grupo_id: GRUPO_EMPRESARIALES,
    prosp_estado_id: estadoVenc.estado_id
  };
  if (scope?.asesorId) where.prosp_asesor_id = scope.asesorId;

  const prospectos = await SvProspecto.findAll({
    where,
    include: [
      { model: SvEmpresa, as: 'empresa', attributes: ['empresa_id', 'empresa_razon_social', 'empresa_nit', 'empresa_sector'] },
      { model: SvUsuario, as: 'asesor',  attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
    ],
    order: [['prosp_fecha_vencimiento_convenio', 'DESC']]
  });

  const hoy = new Date();
  return prospectos.map(p => {
    const venc = p.prosp_fecha_vencimiento_convenio ? new Date(p.prosp_fecha_vencimiento_convenio) : null;
    const diasVenc = venc ? Math.floor((hoy - venc) / 86400000) : null;
    return {
      ...p.toJSON(),
      dias_vencido: diasVenc
    };
  });
}

/**
 * Job — crea prospectos de renovación para convenios que vencen en ≤30 días
 * y aún no tienen renovación activa.
 */
async function procesarRenovacionesPendientes() {
  const proximas = await renovacionesProximas({ dias: DIAS_ANTICIPACION });
  const pendientes = proximas.filter(p => !p.renovacion_ya_creada);

  if (!pendientes.length) return { creados: 0, total_revisados: proximas.length };

  // Buscar estado EN_RENOVACION y fuente RENOVACION
  const [estadoRenov, fuenteRenov] = await Promise.all([
    SvEstado.findOne({ where: { estado_grupo_id: GRUPO_EMPRESARIALES, estado_codigo: 'EN_RENOVACION', estado_activo: 1 } }),
    SvFuente.findOne({ where: { fuente_area_id: AREA_PREV_EMP, fuente_codigo: 'RENOVACION', fuente_activa: 1 } })
  ]);
  if (!estadoRenov || !fuenteRenov) {
    throw new RenovacionError('INTERNAL_ERROR', 'Estado EN_RENOVACION o fuente RENOVACION no configurados');
  }

  let creados = 0;
  for (const orig of pendientes) {
    try {
      const t = await sequelize.transaction();
      try {
        const nuevo = await SvProspecto.create({
          prosp_area_id:             AREA_PREV_EMP,
          prosp_grupo_id:            GRUPO_EMPRESARIALES,
          prosp_empresa_id:          orig.prosp_empresa_id,
          prosp_contacto_empresa_id: orig.prosp_contacto_empresa_id,
          prosp_asesor_id:           orig.prosp_asesor_id,   // mismo asesor que firmó
          prosp_estado_id:           estadoRenov.estado_id,
          prosp_fuente_id:           fuenteRenov.fuente_id,
          prosp_punto_id:            orig.prosp_punto_id,
          prosp_origen_prosp_id:     orig.prosp_id,
          prosp_prox_gestion_fecha:  aISO(new Date()),
          prosp_prioridad:           2,                      // alta
          prosp_nota_inicial:        `Renovación automática del convenio de ${orig.empresa?.empresa_razon_social || ''} (vence ${aISO(orig.prosp_fecha_vencimiento_convenio)}). Prospecto original: #${orig.prosp_id}.`
        }, { transaction: t });

        // Gestión inicial inmutable
        await SvGestion.create({
          gest_prosp_id:        nuevo.prosp_id,
          gest_asesor_id:       orig.prosp_asesor_id,
          gest_estado_nuevo_id: estadoRenov.estado_id,
          gest_canal:           'sistema',
          gest_comentario:      `[Renovación auto] Convenio anterior #${orig.prosp_id} vence ${orig.prosp_fecha_vencimiento_convenio} (en ${orig.dias_restantes} días). Asesor original mantenido.`
        }, { transaction: t });

        await t.commit();
        creados++;
      } catch (e) { await t.rollback(); throw e; }
    } catch (e) { /* log y continúa con el siguiente */ }
  }

  return { creados, total_revisados: proximas.length };
}

/**
 * Job — marca como VENCIDO los convenios cuya fecha de vencimiento ya pasó
 * y nunca tuvieron renovación firmada.
 */
async function procesarVencimientosSinRenovar() {
  const [estadoVenc, estadoRenov] = await Promise.all([
    SvEstado.findOne({ where: { estado_grupo_id: GRUPO_EMPRESARIALES, estado_codigo: 'VENCIDO', estado_activo: 1 } }),
    SvEstado.findOne({ where: { estado_grupo_id: GRUPO_EMPRESARIALES, estado_codigo: 'EN_RENOVACION', estado_activo: 1 } })
  ]);
  if (!estadoVenc) throw new RenovacionError('INTERNAL_ERROR', 'Estado VENCIDO no configurado');

  // Estados ganados (típicamente CONVENIO)
  const ganados = await SvEstado.findAll({
    where: { estado_grupo_id: GRUPO_EMPRESARIALES, estado_es_final: 1, estado_es_ganado: 1, estado_activo: 1 },
    attributes: ['estado_id']
  });
  const ganadosIds = ganados.map(g => g.estado_id);

  // Prospectos cuyo convenio venció ayer o antes
  const vencidos = await SvProspecto.findAll({
    where: {
      prosp_grupo_id: GRUPO_EMPRESARIALES,
      prosp_estado_id: { [Op.in]: ganadosIds },
      prosp_fecha_vencimiento_convenio: { [Op.lt]: hoyISO() }
    }
  });

  if (!vencidos.length) return { marcados: 0 };

  // Para cada uno, verificar si hay renovación que YA cerró (es decir, hay hijo en estado ganado)
  let marcados = 0;
  for (const p of vencidos) {
    const hijoGanado = await SvProspecto.findOne({
      where: {
        prosp_origen_prosp_id: p.prosp_id,
        prosp_estado_id: { [Op.in]: ganadosIds }
      }
    });
    if (hijoGanado) continue; // renovado correctamente, no marcar como vencido

    // Si hay hijo en EN_RENOVACION (renovación en curso), no marcar tampoco
    const hijoEnCurso = estadoRenov ? await SvProspecto.findOne({
      where: { prosp_origen_prosp_id: p.prosp_id, prosp_estado_id: estadoRenov.estado_id, prosp_activo: 1 }
    }) : null;
    if (hijoEnCurso) continue;

    const t = await sequelize.transaction();
    try {
      await p.update({ prosp_estado_id: estadoVenc.estado_id }, { transaction: t });
      await SvGestion.create({
        gest_prosp_id:        p.prosp_id,
        gest_asesor_id:       p.prosp_asesor_id,
        gest_estado_nuevo_id: estadoVenc.estado_id,
        gest_canal:           'sistema',
        gest_comentario:      `[Vencido sin renovar] Convenio venció ${p.prosp_fecha_vencimiento_convenio} sin renovación.`
      }, { transaction: t });
      await t.commit();
      marcados++;
    } catch (e) { await t.rollback(); }
  }
  return { marcados };
}

module.exports = {
  RenovacionError,
  DIAS_ANTICIPACION,
  marcarConvenioFirmado,
  renovacionesProximas,
  vencidosSinRenovar,
  procesarRenovacionesPendientes,
  procesarVencimientosSinRenovar
};
