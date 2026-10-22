// ============================================
// Calificaciones (HU-8): R1 rango por criterio, R2 total = suma, R7 bloqueo, idempotencia.
// Los máximos se leen de trk_criterios; nunca de constantes.
// ============================================
const db = require('../../models');
const TrkError = require('../utils/TrkError');
const { registrarAuditoria } = require('./auditoria.service');
const { buscarModelo } = require('./participantes.service');
const { emitir } = require('../sockets/bus');

const CALIFICABLES = ['EN_PASARELA', 'PRESENTADO'];

function validarPuntajes(criterios, puntajes) {
  const porCriterio = new Map(puntajes.map((p) => [Number(p.criterio_id), p.puntaje]));
  if (porCriterio.size !== puntajes.length) throw new TrkError(400, 'VALIDACION', 'Hay criterios repetidos');
  const ajenos = [...porCriterio.keys()].filter((id) => !criterios.some((c) => c.id === id));
  if (ajenos.length) throw new TrkError(400, 'VALIDACION', 'Hay criterios que no pertenecen a la rúbrica de la categoría');
  const faltantes = criterios.filter((c) => !porCriterio.has(c.id));
  if (faltantes.length) throw new TrkError(422, 'CRITERIO_FALTANTE', `Falta calificar: ${faltantes.map((c) => c.nombre).join(', ')}`);
  let total = 0;
  for (const c of criterios) {
    const v = porCriterio.get(c.id);
    if (!Number.isInteger(v) || v < 0 || v > c.puntaje_max) {
      throw new TrkError(422, 'PUNTAJE_FUERA_DE_RANGO', `${c.nombre} debe ser un entero entre 0 y ${c.puntaje_max}`);
    }
    total += v;
  }
  return total;
}

function vistaCalificacion(cal) {
  return {
    id: cal.id,
    participante_id: cal.participante_id,
    jurado_id: cal.jurado_id,
    total: cal.total,
    bloqueada: Boolean(cal.bloqueada),
    enviada_at: cal.enviada_at,
    puntajes: (cal.detalles || []).map((d) => ({ criterio_id: d.criterio_id, puntaje: d.puntaje })).sort((a, b) => a.criterio_id - b.criterio_id)
  };
}

const conDetalles = { include: [{ model: db.TrkCalificacionDetalle, as: 'detalles' }] };
const mismos = (a, b) => Object.keys(b).length === Object.keys(a).length && Object.keys(b).every((k) => a[k] === b[k]);

const criteriosDeRubrica = (rubricaId, transaction) =>
  db.TrkCriterio.findAll({ where: { rubrica_id: rubricaId }, order: [['orden', 'ASC']], transaction });

async function enviarCalificacion(participanteId, puntajes, ctx, intento = 0) {
  try {
    const { calificacion, repetida } = await db.sequelize.transaction(async (transaction) => {
      // El bloqueo de la fila del participante serializa envíos simultáneos (reintentos offline).
      const p = await buscarModelo(participanteId, { transaction, lock: true });
      if (!CALIFICABLES.includes(p.estado)) throw new TrkError(409, 'ESTADO_INVALIDO', 'La mascota aún no ha salido a pasarela');
      const categoria = await db.TrkCategoria.findByPk(p.categoria_id, { transaction });
      if (!categoria.abierta) throw new TrkError(409, 'CATEGORIA_CERRADA', 'La categoría está cerrada; ya no se puede calificar');
      const criterios = await db.TrkCriterio.findAll({ where: { rubrica_id: categoria.rubrica_id }, order: [['orden', 'ASC']], transaction });
      const total = validarPuntajes(criterios, puntajes);
      const nuevos = Object.fromEntries(puntajes.map((x) => [Number(x.criterio_id), x.puntaje]));

      const existente = await db.TrkCalificacion.findOne({
        where: { participante_id: p.id, jurado_id: ctx.usuarioId }, ...conDetalles, transaction, lock: transaction.LOCK.UPDATE
      });
      if (existente) {
        const actuales = Object.fromEntries(existente.detalles.map((d) => [d.criterio_id, d.puntaje]));
        if (existente.bloqueada) {
          if (mismos(actuales, nuevos)) return { calificacion: existente, repetida: true };
          throw new TrkError(409, 'CALIFICACION_BLOQUEADA', 'La calificación ya fue enviada y está bloqueada');
        }
        const antes = { total: existente.total, puntajes: actuales };
        await db.TrkCalificacionDetalle.destroy({ where: { calificacion_id: existente.id }, transaction });
        await db.TrkCalificacionDetalle.bulkCreate(criterios.map((c) => ({ calificacion_id: existente.id, criterio_id: c.id, puntaje: nuevos[c.id] })), { transaction });
        await existente.update({ total, bloqueada: true, enviada_at: new Date() }, { transaction });
        await registrarAuditoria(ctx, { entidad: 'calificacion', entidadId: existente.id, accion: 'REENVIAR', antes, despues: { total, puntajes: nuevos } }, { transaction });
        return { calificacion: await existente.reload({ ...conDetalles, transaction }), repetida: false };
      }

      const cal = await db.TrkCalificacion.create({ participante_id: p.id, jurado_id: ctx.usuarioId, total, enviada_at: new Date(), bloqueada: true }, { transaction });
      await db.TrkCalificacionDetalle.bulkCreate(criterios.map((c) => ({ calificacion_id: cal.id, criterio_id: c.id, puntaje: nuevos[c.id] })), { transaction });
      await registrarAuditoria(ctx, { entidad: 'calificacion', entidadId: cal.id, accion: 'CREAR', despues: { participante_id: p.id, total, puntajes: nuevos } }, { transaction });
      return { calificacion: await cal.reload({ ...conDetalles, transaction }), repetida: false };
    });

    if (!repetida) {
      emitir('calificacion:recibida', { participante_id: calificacion.participante_id, jurado_id: calificacion.jurado_id, total: calificacion.total }, { rooms: ['admin'] });
    }
    return vistaCalificacion(calificacion);
  } catch (e) {
    if (e && e.name === 'SequelizeUniqueConstraintError' && intento === 0) return enviarCalificacion(participanteId, puntajes, ctx, 1);
    throw e;
  }
}

async function rubricaDeCategoria(categoriaId) {
  const categoria = await db.TrkCategoria.findByPk(categoriaId, { include: [{ model: db.TrkRubrica, as: 'rubrica' }] });
  if (!categoria) throw new TrkError(404, 'NO_ENCONTRADO', 'Categoría no encontrada');
  const criterios = await db.TrkCriterio.findAll({ where: { rubrica_id: categoria.rubrica_id }, order: [['orden', 'ASC']] });
  return {
    categoria: { id: categoria.id, codigo: categoria.codigo, nombre: categoria.nombre, abierta: Boolean(categoria.abierta) },
    rubrica: { codigo: categoria.rubrica.codigo, nombre: categoria.rubrica.nombre },
    criterios: criterios.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, descripcion: c.descripcion, puntaje_max: c.puntaje_max, orden: c.orden })),
    puntaje_total_max: criterios.reduce((s, c) => s + c.puntaje_max, 0)
  };
}

async function misCalificaciones(juradoId) {
  const filas = await db.TrkCalificacion.findAll({ where: { jurado_id: juradoId }, order: [['enviada_at', 'DESC']] });
  return filas.map((c) => ({ id: c.id, participante_id: c.participante_id, total: c.total, bloqueada: Boolean(c.bloqueada) }));
}

async function desbloquear(calificacionId, ctx) {
  const cal = await db.sequelize.transaction(async (transaction) => {
    const c = await db.TrkCalificacion.findByPk(calificacionId, { ...conDetalles, transaction, lock: transaction.LOCK.UPDATE });
    if (!c) throw new TrkError(404, 'NO_ENCONTRADO', 'Calificación no encontrada');
    if (!c.bloqueada) throw new TrkError(409, 'NO_BLOQUEADA', 'La calificación ya está desbloqueada');
    await c.update({ bloqueada: false, desbloqueada_at: new Date() }, { transaction });
    await registrarAuditoria(ctx, {
      entidad: 'calificacion', entidadId: c.id, accion: 'DESBLOQUEAR',
      antes: { bloqueada: true, total: c.total }, despues: { bloqueada: false }
    }, { transaction });
    return c;
  });
  return vistaCalificacion(cal);
}

module.exports = { CALIFICABLES, criteriosDeRubrica, validarPuntajes, enviarCalificacion, vistaCalificacion, conDetalles, rubricaDeCategoria, misCalificaciones, desbloquear };
