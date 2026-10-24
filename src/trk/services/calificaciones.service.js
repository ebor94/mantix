// ============================================
// Calificaciones (HU-8, HU-8b): R1 rango por criterio, R2 total = suma, R7 bloqueo, idempotencia.
// Los máximos se leen de trk_criterios; nunca de constantes.
// TRK-CAL-002 (una mascota) y TRK-CAL-006 (envío final por categoría) comparten registrarFinalEnTx:
// misma validación, mismo bloqueo y misma auditoría CREAR / REENVIAR.
// ============================================
const db = require('../../models');
const TrkError = require('../utils/TrkError');
const { registrarAuditoria } = require('./auditoria.service');
const { buscarModelo } = require('./participantes.service');
const { emitir } = require('../sockets/bus');
const { borradorVigente } = require('../utils/borrador');

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

// Núcleo compartido. El llamador ya bloqueó la fila del participante dentro de `transaction`.
async function registrarFinalEnTx(p, categoria, criterios, puntajes, ctx, transaction) {
  if (!CALIFICABLES.includes(p.estado)) throw new TrkError(409, 'ESTADO_INVALIDO', 'La mascota aún no ha salido a pasarela');
  if (!categoria.abierta) throw new TrkError(409, 'CATEGORIA_CERRADA', 'La categoría está cerrada; ya no se puede calificar');
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
}

const avisarRecibida = (cal) => emitir(
  'calificacion:recibida',
  { participante_id: cal.participante_id, jurado_id: cal.jurado_id, total: cal.total },
  { rooms: ['admin'] }
);

async function enviarCalificacion(participanteId, puntajes, ctx, intento = 0) {
  try {
    const { calificacion, repetida } = await db.sequelize.transaction(async (transaction) => {
      // El bloqueo de la fila del participante serializa envíos simultáneos (reintentos offline).
      const p = await buscarModelo(participanteId, { transaction, lock: true });
      const categoria = await db.TrkCategoria.findByPk(p.categoria_id, { transaction });
      const criterios = await criteriosDeRubrica(categoria.rubrica_id, transaction);
      return registrarFinalEnTx(p, categoria, criterios, puntajes, ctx, transaction);
    });
    if (!repetida) avisarRecibida(calificacion);
    return vistaCalificacion(calificacion);
  } catch (e) {
    if (e && e.name === 'SequelizeUniqueConstraintError' && intento === 0) return enviarCalificacion(participanteId, puntajes, ctx, 1);
    throw e;
  }
}

// HU-8b CA6: envío final de una categoría, todo o nada. Pendiente = fila de la matriz (EN_PASARELA/PRESENTADO,
// sin fusionar) sin calificación final bloqueada de este jurado. Puntajes = borradorVigente (misma regla que la matriz).
async function finalizarCategoria(categoriaId, ctx) {
  const resultados = await db.sequelize.transaction(async (transaction) => {
    // Orden de bloqueo del módulo: evento → participantes → categoría (como pasarela, desempates y fusión).
    await db.TrkEventoEstado.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
    const participantes = await db.TrkParticipante.findAll({
      where: { categoria_id: Number(categoriaId), fusionado_en_id: null, estado: CALIFICABLES },
      order: [['mascota_nombre', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const categoria = await db.TrkCategoria.findByPk(categoriaId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!categoria) throw new TrkError(404, 'NO_ENCONTRADO', 'Categoría no encontrada');
    if (!categoria.abierta) throw new TrkError(409, 'CATEGORIA_CERRADA', 'La categoría está cerrada; ya no se puede calificar');

    const ids = participantes.map((p) => p.id);
    const existentes = ids.length
      ? await db.TrkCalificacion.findAll({ where: { participante_id: ids, jurado_id: ctx.usuarioId }, ...conDetalles, transaction })
      : [];
    const bloqueadas = new Set(existentes.filter((c) => c.bloqueada).map((c) => c.participante_id));
    const pendientes = participantes.filter((p) => !bloqueadas.has(p.id));
    if (!pendientes.length) throw new TrkError(409, 'SIN_PENDIENTES', 'No hay calificaciones pendientes por enviar en esta categoría');

    const criterios = await criteriosDeRubrica(categoria.rubrica_id, transaction);
    const borradores = await db.TrkBorrador.findAll({
      where: { jurado_id: ctx.usuarioId, participante_id: pendientes.map((p) => p.id) }, transaction
    });
    const filas = pendientes.map((p) => {
      const cal = existentes.find((c) => c.participante_id === p.id);
      const valores = borradorVigente(
        criterios,
        new Map(borradores.filter((b) => b.participante_id === p.id).map((b) => [b.criterio_id, b.puntaje])),
        new Map(cal ? cal.detalles.map((d) => [d.criterio_id, d.puntaje]) : [])
      );
      return { p, valores, faltan: criterios.filter((c) => valores[c.id] === null) };
    });
    const incompletas = filas.filter((f) => f.faltan.length);
    if (incompletas.length) {
      throw new TrkError(
        422,
        'CALIFICACION_INCOMPLETA',
        `Faltan puntajes de: ${incompletas.map((f) => f.p.mascota_nombre).join(', ')}`,
        incompletas.map((f) => ({ campo: f.p.id, mensaje: `${f.p.mascota_nombre}: falta ${f.faltan.map((c) => c.nombre).join(', ')}` }))
      );
    }

    const salida = [];
    for (const f of filas) {
      const puntajes = criterios.map((c) => ({ criterio_id: c.id, puntaje: f.valores[c.id] }));
      salida.push(await registrarFinalEnTx(f.p, categoria, criterios, puntajes, ctx, transaction));
    }
    return salida;
  });
  for (const r of resultados) if (!r.repetida) avisarRecibida(r.calificacion);
  return { categoria_id: Number(categoriaId), calificaciones: resultados.map((r) => vistaCalificacion(r.calificacion)) };
}

async function rubricaDeCategoria(categoriaId) {
  const categoria = await db.TrkCategoria.findByPk(categoriaId, { include: [{ model: db.TrkRubrica, as: 'rubrica' }] });
  if (!categoria) throw new TrkError(404, 'NO_ENCONTRADO', 'Categoría no encontrada');
  const criterios = await criteriosDeRubrica(categoria.rubrica_id);
  return {
    categoria: { id: categoria.id, codigo: categoria.codigo, nombre: categoria.nombre, color: categoria.color ?? null, abierta: Boolean(categoria.abierta) },
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

module.exports = {
  CALIFICABLES, criteriosDeRubrica, validarPuntajes, registrarFinalEnTx, enviarCalificacion, finalizarCategoria,
  vistaCalificacion, conDetalles, rubricaDeCategoria, misCalificaciones, desbloquear
};
