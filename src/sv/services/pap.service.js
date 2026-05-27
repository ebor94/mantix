/**
 * sv/services/pap.service.js
 * Lógica específica de PAP (puerta a puerta).
 *  - registroRapido: persona + prospecto + gestión inmutable en una sola transacción
 *  - zonas: agregado de visitas por prosp_zona_pap del asesor
 *  - mapa: coords de gestiones del día (lat/lng) para Leaflet
 */
const { Op, fn, col, literal } = require('sequelize');
const {
  sequelize, SvProspecto, SvPersona, SvGestion, SvEstado, SvResultado, SvUsuario
} = require('../models');
const personas = require('./personas.service');
const { rango, rangoDia } = require('../utils/fechas');

const AREA_PAP_ID  = 3; // sv_cfg_areas_negocio donde area_codigo='PREV-PAP'
const GRUPO_PAP_ID = 3; // sv_cfg_grupos_trabajo donde grupo_codigo='PAP'

// Mapa resultado_codigo → estado_codigo destino (pipeline PAP es inmediato)
const MAPEO_RESULTADO_ESTADO = {
  'AFILIADO_HOY':  'AFILIADO',
  'INTERESADO':    'INTERESADO',
  'VOLVER':        'VOLVER',
  'NO_INTERESADO': 'NO_INTERES',
  'SIN_RESPUESTA': 'VISITADO'
};

async function registroRapido(payload, asesorId) {
  // 1) Validaciones mínimas
  const nombre    = (payload.nombre || '').trim();
  const telefono  = (payload.telefono || '').trim();
  const direccion = (payload.direccion || '').trim();
  const zonaPap   = (payload.zona_pap || '').trim();
  const resultadoCodigo = (payload.resultado_codigo || '').trim();

  if (!nombre)    { const e = new Error('Nombre requerido'); e.code = 'VALIDATION_ERROR'; throw e; }
  if (!telefono)  { const e = new Error('Teléfono requerido'); e.code = 'VALIDATION_ERROR'; throw e; }
  if (!resultadoCodigo) { const e = new Error('Resultado requerido'); e.code = 'VALIDATION_ERROR'; throw e; }

  // 2) Resolver IDs de resultado y estado
  const resultado = await SvResultado.findOne({
    where: { resultado_grupo_id: GRUPO_PAP_ID, resultado_codigo: resultadoCodigo, resultado_activo: 1 }
  });
  if (!resultado) {
    const e = new Error(`Resultado PAP no válido: ${resultadoCodigo}`); e.code = 'VALIDATION_ERROR'; throw e;
  }

  const estadoCodigo = MAPEO_RESULTADO_ESTADO[resultadoCodigo] || 'VISITADO';
  const estado = await SvEstado.findOne({
    where: { estado_grupo_id: GRUPO_PAP_ID, estado_codigo: estadoCodigo, estado_activo: 1 }
  });
  if (!estado) {
    const e = new Error(`Estado PAP no encontrado: ${estadoCodigo}`); e.code = 'INTERNAL_ERROR'; throw e;
  }

  const t = await sequelize.transaction();
  try {
    // 3) Crear / reusar persona (anti-duplicados por teléfono normalizado)
    let persona;
    let personaReusada = false;
    try {
      persona = await personas.crear({
        persona_nombre:             nombre,
        persona_telefono_principal: telefono,
        persona_direccion:          direccion || null,
        persona_barrio:             zonaPap || null
      });
    } catch (e) {
      if (e.code === 'DUPLICATE_PHONE') {
        persona = e.persona;
        personaReusada = true;
      } else throw e;
    }

    // 4) Buscar prospecto activo de este asesor en PAP para esta persona; si no, crear
    let prospecto = await SvProspecto.findOne({
      where: {
        prosp_persona_id: persona.persona_id,
        prosp_asesor_id:  asesorId,
        prosp_grupo_id:   GRUPO_PAP_ID,
        prosp_activo: 1
      },
      transaction: t
    });

    if (!prospecto) {
      prospecto = await SvProspecto.create({
        prosp_area_id:   AREA_PAP_ID,
        prosp_grupo_id:  GRUPO_PAP_ID,
        prosp_persona_id: persona.persona_id,
        prosp_asesor_id: asesorId,
        prosp_estado_id: estado.estado_id,
        prosp_zona_pap:  zonaPap || null,
        prosp_nota_inicial: payload.nota || null
      }, { transaction: t });
    } else {
      // Actualizar estado y zona del prospecto existente
      await prospecto.update({
        prosp_estado_id: estado.estado_id,
        prosp_zona_pap:  zonaPap || prospecto.prosp_zona_pap,
        prosp_prox_gestion_fecha: resultadoCodigo === 'VOLVER' ? payload.prox_fecha || null : null,
        prosp_prox_gestion_hora:  resultadoCodigo === 'VOLVER' ? payload.prox_hora  || null : null
      }, { transaction: t });
    }

    // 5) Registrar gestión INMUTABLE
    const gestion = await SvGestion.create({
      gest_prosp_id:        prospecto.prosp_id,
      gest_asesor_id:       asesorId,
      gest_resultado_id:    resultado.resultado_id,
      gest_estado_nuevo_id: estado.estado_id,
      gest_canal:           'presencial',
      gest_comentario:      payload.comentario || null,
      gest_ubicacion_lat:   payload.lat || null,
      gest_ubicacion_lng:   payload.lng || null,
      gest_prox_fecha:      resultadoCodigo === 'VOLVER' ? payload.prox_fecha || null : null,
      gest_prox_hora:       resultadoCodigo === 'VOLVER' ? payload.prox_hora  || null : null,
      gest_fecha_hora:      new Date()
    }, { transaction: t });

    await t.commit();
    return {
      persona_id:    persona.persona_id,
      persona_reusada: personaReusada,
      prospecto_id:  prospecto.prosp_id,
      gestion_id:    gestion.gest_id,
      resultado:     resultado.resultado_nombre,
      estado:        estado.estado_nombre
    };
  } catch (e) {
    await t.rollback();
    throw e;
  }
}

/**
 * Resuelve el filtro de asesores para PAP.
 *  - asesorId explícito (string o number) → solo ese asesor.
 *  - scope.asesorId (rol ASESOR / AGENTE_SVC) → solo el propio asesor.
 *  - SUPER_ADMIN, ADMIN_AREA, SUPERVISOR, GERENTE → null = SIN filtro por asesor
 *    (verán TODO el grupo PAP — el filtro `prospecto.prosp_grupo_id = GRUPO_PAP_ID`
 *    ya garantiza que solo se traen registros del módulo PAP). Esto cubre tanto
 *    al supervisor PAP como al admin.comercial multi-área y a auditorías históricas
 *    donde un usuario fuera del grupo (ej. Maria) hizo una gestión PAP.
 */
async function _asesoresVisibles({ asesorId = null, scope = null } = {}) {
  if (asesorId)        return [parseInt(asesorId)];
  if (!scope)          return null;
  if (scope.asesorId)  return [scope.asesorId];
  return null; // sin filtro: confiamos en el filtro de grupo del prospecto
}

/**
 * Agregado por zona: cuántas visitas, cuántas afiliadas hoy, etc.
 * Acepta asesorId explícito o scope amplio del supervisor.
 */
async function zonasDelAsesor(asesorId, fecha = null, scope = null) {
  const { start, end } = rangoDia(fecha);
  const ids = await _asesoresVisibles({ asesorId, scope });

  const whereProsp = {
    prosp_grupo_id:  GRUPO_PAP_ID,
    prosp_zona_pap:  { [Op.ne]: null }
  };
  if (ids) whereProsp.prosp_asesor_id = { [Op.in]: ids };

  const rows = await SvProspecto.findAll({
    where: whereProsp,
    attributes: [
      'prosp_zona_pap',
      [fn('COUNT', col('prosp_id')), 'total_prospectos']
    ],
    group: ['prosp_zona_pap'],
    raw: true
  });

  // Counts del día por zona desde gestiones
  const whereGest = {
    gest_fecha_hora: { [Op.gte]: start, [Op.lte]: end }
  };
  if (ids) whereGest.gest_asesor_id = { [Op.in]: ids };

  const visitasHoy = await SvGestion.findAll({
    where: whereGest,
    include: [{
      model: SvProspecto, as: 'prospecto', required: true, attributes: ['prosp_zona_pap'],
      where: { prosp_grupo_id: GRUPO_PAP_ID }
    }],
    attributes: [
      [col('prospecto.prosp_zona_pap'), 'zona'],
      [fn('COUNT', col('gest_id')), 'visitas']
    ],
    group: ['prospecto.prosp_zona_pap'],
    raw: true
  });
  const visitasMap = new Map(visitasHoy.map(v => [v.zona, parseInt(v.visitas)]));

  return rows.map(r => ({
    zona: r.prosp_zona_pap,
    total_prospectos: parseInt(r.total_prospectos),
    visitas_hoy: visitasMap.get(r.prosp_zona_pap) || 0
  }));
}

/**
 * Mapa: gestiones con lat/lng (para Leaflet).
 * Acepta:
 *  - fecha única (legacy)         → un solo día
 *  - desde / hasta (rango)        → cualquier período
 *  - asesorId puntual o scope amplio del supervisor/admin
 *
 * Si se pasan los tres, prevalece el rango (desde/hasta).
 */
async function mapaDelDia({ asesorId = null, fecha = null, desde = null, hasta = null, scope = null }) {
  // Resolver rango
  let start, end;
  if (desde || hasta) {
    const r = rango(desde, hasta);
    start = r.start;
    end = r.end;
  } else {
    const r = rangoDia(fecha);
    start = r.start;
    end = r.end;
  }
  const ids = await _asesoresVisibles({ asesorId, scope });

  const include = [
    {
      model: SvProspecto, as: 'prospecto', required: true,
      attributes: ['prosp_id', 'prosp_zona_pap', 'prosp_persona_id'],
      where: { prosp_grupo_id: GRUPO_PAP_ID },
      include: [{ model: SvPersona, as: 'persona', attributes: ['persona_nombre','persona_apellido','persona_telefono_principal'] }]
    },
    { model: SvResultado, as: 'resultado' },
    { model: SvUsuario,   as: 'asesor', attributes: ['usr_id', 'usr_nombre', 'usr_apellido'] }
  ];
  const where = {
    gest_fecha_hora: { [Op.gte]: start, [Op.lte]: end },
    gest_ubicacion_lat: { [Op.ne]: null },
    gest_ubicacion_lng: { [Op.ne]: null }
  };
  if (ids) where.gest_asesor_id = { [Op.in]: ids };

  return SvGestion.findAll({
    where, include,
    attributes: [
      'gest_id', 'gest_fecha_hora', 'gest_ubicacion_lat', 'gest_ubicacion_lng',
      'gest_resultado_id', 'gest_asesor_id', 'gest_prosp_id'
    ],
    order: [['gest_fecha_hora', 'ASC']]
  });
}

/**
 * Métricas PAP del asesor en un período (para Mis Métricas PAP).
 * - Visitas totales del período
 * - Tasa de afiliación (% gestiones con resultado AFILIADO_HOY)
 * - Distancia recorrida aproximada (suma haversine cliente)
 * - Zonas trabajadas
 */
async function metricasAsesor(asesorId, { desde, hasta, scope = null } = {}) {
  const { start, end, desde: dStart, hasta: dEnd } = rango(desde, hasta);
  const ids = await _asesoresVisibles({ asesorId, scope });

  const whereGest = {
    gest_fecha_hora: { [Op.between]: [start, end] }
  };
  if (ids) whereGest.gest_asesor_id = { [Op.in]: ids };

  const gestiones = await SvGestion.findAll({
    where: whereGest,
    include: [
      { model: SvResultado, as: 'resultado' },
      { model: SvProspecto, as: 'prospecto', attributes: ['prosp_grupo_id','prosp_zona_pap'],
        where: { prosp_grupo_id: GRUPO_PAP_ID }, required: true }
    ],
    order: [['gest_fecha_hora', 'ASC']]
  });

  const total = gestiones.length;
  const afiliadas    = gestiones.filter(g => g.resultado?.resultado_codigo === 'AFILIADO_HOY').length;
  const interesadas  = gestiones.filter(g => g.resultado?.resultado_codigo === 'INTERESADO').length;
  const volver       = gestiones.filter(g => g.resultado?.resultado_codigo === 'VOLVER').length;
  const noInteres    = gestiones.filter(g => g.resultado?.resultado_codigo === 'NO_INTERESADO').length;
  const sinResp      = gestiones.filter(g => g.resultado?.resultado_codigo === 'SIN_RESPUESTA').length;
  const zonas = Array.from(new Set(gestiones.map(g => g.prospecto?.prosp_zona_pap).filter(Boolean)));

  const coords = gestiones
    .filter(g => g.gest_ubicacion_lat && g.gest_ubicacion_lng)
    .map(g => ({ lat: parseFloat(g.gest_ubicacion_lat), lng: parseFloat(g.gest_ubicacion_lng) }));

  return {
    desde: dStart, hasta: dEnd,
    total_visitas: total,
    afiliadas,
    interesadas,
    volver,
    no_interesados: noInteres,
    sin_respuesta: sinResp,
    tasa_afiliacion:  total > 0 ? Math.round((afiliadas    / total) * 100) : 0,
    tasa_conversion: total > 0 ? Math.round(((afiliadas + interesadas) / total) * 100) : 0,
    zonas_trabajadas: zonas,
    coords  // el frontend calcula km con haversine
  };
}

module.exports = { registroRapido, zonasDelAsesor, mapaDelDia, metricasAsesor, MAPEO_RESULTADO_ESTADO };
