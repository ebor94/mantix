/**
 * sv/services/salas.service.js
 * Visitas de Prenecesidad en salas de velación (spec 2026-11-18).
 * Lee los homenajes en curso de Homenajes360 y vincula a su contratante con un
 * cliente de Prenecesidad.
 */
const { Op } = require('sequelize');
const {
  sequelize, SvArea, SvGrupo, SvFuente, SvEstado, SvResultado, SvProspecto, SvPersona,
  SvUsuario, SvGestion, SvSalaContratante
} = require('../models');
const { ROLES, AREAS } = require('../config/constants');
const { areaIdsAccesibles } = require('../utils/acceso');
const { primerTelefonoValido, formatearNombre } = require('../utils/contratante');
const repo = require('./homenajesSala.repo');
const personas = require('./personas.service');
const gestiones = require('./gestiones.service');
const SalaError = require('./salaError');
const logger = require('../../utils/logger');

const GRUPO_TELEMERCADEO = 'TELEMERCADEO';
const FUENTE_SALA = 'SALA_VELACION';

async function catalogos() {
  const area = await SvArea.findOne({ where: { area_codigo: AREAS.PRENEC } });
  const grupo = area && await SvGrupo.findOne({ where: { grupo_codigo: GRUPO_TELEMERCADEO, grupo_area_id: area.area_id } });
  const fuente = area && await SvFuente.findOne({ where: { fuente_codigo: FUENTE_SALA, fuente_area_id: area.area_id } });
  const estadoInicial = grupo && await SvEstado.findOne({
    where: { estado_grupo_id: grupo.grupo_id, estado_activo: 1 },
    order: [['estado_orden', 'ASC']]
  });
  if (!area || !grupo || !fuente || !estadoInicial) {
    throw new SalaError('CATALOGO_INCOMPLETO', 500,
      'Falta configurar Prenecesidad para salas de velación (¿se aplicó la migración 023?)');
  }
  return {
    areaId: area.area_id,
    grupoId: grupo.grupo_id,
    fuenteId: fuente.fuente_id,
    estadoInicialId: estadoInicial.estado_id
  };
}

function tieneAccesoPrenec(user, areaId) {
  const ids = areaIdsAccesibles(user);
  return ids === null || ids.includes(areaId);
}

function puedeAtender(user, areaId) {
  return user?.rol?.rol_codigo === ROLES.ASESOR && tieneAccesoPrenec(user, areaId);
}

function exigirAcceso(user, cat) {
  if (!tieneAccesoPrenec(user, cat.areaId)) throw new SalaError('FORBIDDEN', 403, 'Fuera de tu área');
}

function exigirAsesor(user, cat) {
  if (!puedeAtender(user, cat.areaId)) {
    throw new SalaError('FORBIDDEN', 403, 'Solo los asesores de Prenecesidad atienden contratantes');
  }
}

function nombreDe(usuario) {
  return usuario ? `${usuario.usr_nombre || ''} ${usuario.usr_apellido || ''}`.trim() : null;
}

function clienteDe(vinculo, user) {
  const p = vinculo?.prospecto;
  if (!p) return null;
  return {
    prosp_id: p.prosp_id,
    es_mio: p.prosp_asesor_id === user.usr_id,
    duenio_nombre: nombreDe(p.asesor),
    estado_nombre: p.estado?.estado_nombre || null
  };
}

async function armar(homenajes, user, cat) {
  if (!homenajes.length) return [];
  const ids = homenajes.map((h) => h.id);
  const [vinculos, visitas] = await Promise.all([
    SvSalaContratante.findAll({
      where: { sc_homenaje_sala_id: { [Op.in]: ids } },
      include: [{
        model: SvProspecto, as: 'prospecto',
        attributes: ['prosp_id', 'prosp_asesor_id'],
        include: [
          { model: SvUsuario, as: 'asesor', attributes: ['usr_nombre', 'usr_apellido'] },
          { model: SvEstado,  as: 'estado', attributes: ['estado_nombre'] }
        ]
      }]
    }),
    SvGestion.findAll({
      where: { gest_homenaje_sala_id: { [Op.in]: ids } },
      attributes: ['gest_homenaje_sala_id', 'gest_fecha_hora'],
      include: [{ model: SvUsuario, as: 'asesor', attributes: ['usr_nombre', 'usr_apellido'] }],
      order: [['gest_fecha_hora', 'DESC']]
    })
  ]);

  const vinculoPor = new Map(vinculos.map((v) => [v.sc_homenaje_sala_id, v]));
  const visitasPor = new Map();
  for (const g of visitas) {
    const lista = visitasPor.get(g.gest_homenaje_sala_id) || [];
    lista.push({ asesor_nombre: nombreDe(g.asesor), fecha_hora: g.gest_fecha_hora });
    visitasPor.set(g.gest_homenaje_sala_id, lista);
  }

  const puede = puedeAtender(user, cat.areaId);
  return homenajes.map((h) => ({
    ...h,
    cliente: clienteDe(vinculoPor.get(h.id), user),
    visitas: visitasPor.get(h.id) || [],
    puede_atender: puede
  }));
}

async function listar(user) {
  const cat = await catalogos();
  exigirAcceso(user, cat);
  return armar(await repo.listarEnCurso(), user, cat);
}

async function obtener(homenajeId, user) {
  const cat = await catalogos();
  exigirAcceso(user, cat);
  const h = await repo.obtener(homenajeId);
  if (!h) throw new SalaError('HOMENAJE_NO_ENCONTRADO', 404, 'Homenaje no encontrado');
  return (await armar([h], user, cat))[0];
}

async function homenajeEnCurso(homenajeId) {
  const h = await repo.obtener(homenajeId);
  if (!h) throw new SalaError('HOMENAJE_NO_ENCONTRADO', 404, 'Homenaje no encontrado');
  if (!repo.estaEnCurso(h)) throw new SalaError('HOMENAJE_CERRADO', 409, 'Este homenaje ya finalizó');
  return h;
}

async function respuestaVinculo(prospId, user, creado) {
  const p = await SvProspecto.findByPk(prospId, {
    include: [
      { model: SvPersona, as: 'persona', attributes: ['persona_nombre', 'persona_apellido', 'persona_telefono_principal'] },
      { model: SvUsuario, as: 'asesor',  attributes: ['usr_nombre', 'usr_apellido'] },
      { model: SvEstado,  as: 'estado',  attributes: ['estado_nombre'] }
    ]
  });
  const ultima = await SvGestion.findOne({
    where: { gest_prosp_id: prospId },
    order: [['gest_fecha_hora', 'DESC'], ['gest_id', 'DESC']],
    include: [{ model: SvResultado, as: 'resultado', attributes: ['resultado_nombre'] }]
  });
  return {
    prosp_id: p.prosp_id,
    prosp_area_id: p.prosp_area_id,
    prosp_grupo_id: p.prosp_grupo_id,
    es_mio: p.prosp_asesor_id === user.usr_id,
    creado,
    persona_nombre: [p.persona?.persona_nombre, p.persona?.persona_apellido].filter(Boolean).join(' '),
    persona_telefono: p.persona?.persona_telefono_principal || null,
    resumen: {
      duenio_nombre: nombreDe(p.asesor),
      estado_nombre: p.estado?.estado_nombre || null,
      prox_gestion_fecha: p.prosp_prox_gestion_fecha || null,
      ultima_gestion: ultima ? {
        fecha_hora: ultima.gest_fecha_hora,
        canal: ultima.gest_canal,
        resultado_nombre: ultima.resultado?.resultado_nombre || null
      } : null
    }
  };
}

// Persona fuera de la transacción: una persona sin prospecto es inofensiva.
async function personaPorTelefono(telefono, nombre) {
  const existente = await personas.buscarPorTelefono(telefono);
  if (existente) return existente;
  try {
    return await personas.crear({ persona_nombre: nombre, persona_telefono_principal: telefono });
  } catch (e) {
    if (e.code === 'DUPLICATE_PHONE' && e.persona) return e.persona;
    if (e.name === 'SequelizeUniqueConstraintError') {
      const otra = await personas.buscarPorTelefono(telefono);
      if (otra) return otra;
    }
    throw e;
  }
}

// Revierte sin tapar el error original: si la transacción ya terminó (p. ej. falló el
// COMMIT) no hay nada que revertir, y si el rollback falla solo se registra.
async function revertirSinTapar(t) {
  if (t.finished) return;
  try {
    await t.rollback();
  } catch (err) {
    logger.warn('[SALA_ATENDER] rollback falló: ' + err.message);
  }
}

async function atender(homenajeId, user, body = {}) {
  const cat = await catalogos();
  exigirAsesor(user, cat);
  const h = await homenajeEnCurso(homenajeId);

  const existente = await SvSalaContratante.findOne({ where: { sc_homenaje_sala_id: homenajeId } });
  if (existente) return respuestaVinculo(existente.sc_prosp_id, user, false);

  const telefono = primerTelefonoValido(h.contratante_telefono) || primerTelefonoValido(body.telefono);
  if (!telefono) throw new SalaError('TELEFONO_REQUERIDO', 422, 'Escribe un teléfono válido del contratante');
  const nombre = formatearNombre(h.contratante_nombre) || formatearNombre(body.nombre);
  if (!nombre) throw new SalaError('NOMBRE_REQUERIDO', 422, 'Escribe el nombre del contratante');

  const persona = await personaPorTelefono(telefono, nombre);

  const t = await sequelize.transaction();
  let prospId;
  let creado = false;
  try {
    const activo = await SvProspecto.findOne({
      where: { prosp_persona_id: persona.persona_id, prosp_area_id: cat.areaId, prosp_activo: 1 },
      order: [['prosp_created_at', 'DESC']],
      transaction: t
    });
    if (activo) {
      prospId = activo.prosp_id;
    } else {
      const nuevo = await SvProspecto.create({
        prosp_area_id: cat.areaId,
        prosp_grupo_id: cat.grupoId,
        prosp_persona_id: persona.persona_id,
        prosp_asesor_id: user.usr_id,
        prosp_estado_id: cat.estadoInicialId,
        prosp_fuente_id: cat.fuenteId
      }, { transaction: t });
      prospId = nuevo.prosp_id;
      creado = true;
    }
    await SvSalaContratante.create(
      { sc_homenaje_sala_id: homenajeId, sc_prosp_id: prospId, sc_usr_id: user.usr_id },
      { transaction: t }
    );
    await t.commit();
  } catch (e) {
    await revertirSinTapar(t);
    if (e.name === 'SequelizeUniqueConstraintError') {
      const ganador = await SvSalaContratante.findOne({ where: { sc_homenaje_sala_id: homenajeId } });
      if (ganador) return respuestaVinculo(ganador.sc_prosp_id, user, false);
    }
    throw e;
  }

  logger.info(`[SALA_ATENDER] homenaje_sala_id=${homenajeId} prosp_id=${prospId} usr_id=${user.usr_id} creado=${creado}`);
  return respuestaVinculo(prospId, user, creado);
}

async function registrarVisita(homenajeId, user, body = {}) {
  const cat = await catalogos();
  exigirAsesor(user, cat);
  await homenajeEnCurso(homenajeId);

  const vinculo = await SvSalaContratante.findOne({ where: { sc_homenaje_sala_id: homenajeId } });
  if (!vinculo) throw new SalaError('SIN_ATENDER', 409, 'Primero atiende al contratante de este homenaje');

  const p = await SvProspecto.findByPk(vinculo.sc_prosp_id);
  if (!p || !p.prosp_activo) {
    throw new SalaError('CLIENTE_INACTIVO', 409, 'El cliente está inactivo; pide al supervisor reactivarlo');
  }

  const resultado = await SvResultado.findOne({
    where: { resultado_id: body.gest_resultado_id, resultado_grupo_id: cat.grupoId, resultado_activo: 1 }
  });
  if (!resultado) throw new SalaError('RESULTADO_INVALIDO', 422, 'El resultado no es de telemercadeo');

  if (body.gest_estado_nuevo_id) {
    const estado = await SvEstado.findOne({
      where: { estado_id: body.gest_estado_nuevo_id, estado_grupo_id: cat.grupoId, estado_activo: 1 }
    });
    if (!estado) throw new SalaError('ESTADO_INVALIDO', 422, 'El estado no es de telemercadeo');
  }

  if (resultado.resultado_requiere_fecha && !body.gest_prox_fecha) {
    throw new SalaError('PROX_FECHA_REQUERIDA', 422, 'Este resultado requiere agendar la próxima gestión');
  }

  const g = await gestiones.crear({
    gest_prosp_id: p.prosp_id,
    gest_canal: 'visita_sala',
    gest_homenaje_sala_id: homenajeId,
    gest_resultado_id: resultado.resultado_id,
    gest_estado_nuevo_id: body.gest_estado_nuevo_id || null,
    gest_comentario: body.gest_comentario || null,
    gest_prox_fecha: body.gest_prox_fecha || null,
    gest_prox_hora: body.gest_prox_hora || null
  }, user.usr_id);

  logger.info(`[SALA_VISITA] homenaje_sala_id=${homenajeId} prosp_id=${p.prosp_id} usr_id=${user.usr_id}`);
  return g;
}

module.exports = { listar, obtener, atender, registrarVisita, SalaError };
