const db = require('../../models');
const TrkError = require('../utils/TrkError');
const { calcularRanking } = require('./ranking.service');
const { serializarParticipante } = require('../utils/serializar');
const { registrarAuditoria } = require('./auditoria.service');
const { INCLUIR_CATEGORIA } = require('./participantes.service');
const { vistaCategoria } = require('./categorias.service');
const { ROL_JURADO, ESTADOS_VISIBLES_PUBLICO } = require('../config/constantes');
const { nombreVisible } = require('./authPin.service');

async function buscarCategoria(categoriaId) {
  const categoria = await db.TrkCategoria.findByPk(categoriaId, { include: [{ model: db.TrkRubrica, as: 'rubrica' }] });
  if (!categoria) throw new TrkError(404, 'NO_ENCONTRADO', 'Categoría no encontrada');
  return categoria;
}

async function rankingEnVivo(categoriaId) {
  const categoria = await buscarCategoria(categoriaId);
  const criterios = await db.TrkCriterio.findAll({ where: { rubrica_id: categoria.rubrica_id }, order: [['orden', 'ASC']] });
  const participantes = await db.TrkParticipante.findAll({
    where: { categoria_id: categoria.id, fusionado_en_id: null, estado: ESTADOS_VISIBLES_PUBLICO },
    include: INCLUIR_CATEGORIA
  });
  const calificaciones = participantes.length ? await db.TrkCalificacion.findAll({
    where: { participante_id: participantes.map((p) => p.id) },
    include: [{ model: db.TrkCalificacionDetalle, as: 'detalles' }, { model: db.Usuario, as: 'jurado', attributes: ['id', 'nombre', 'apellido', 'activo'] }]
  }) : [];
  const jurados = await db.Usuario.findAll({
    where: { activo: true }, attributes: ['id'],
    include: [{ model: db.Rol, as: 'rol', where: { nombre: ROL_JURADO }, attributes: [] }]
  });

  const { filas, empates_sin_resolver } = calcularRanking({
    participantes: participantes.map((p) => ({ id: p.id, mascota_nombre: p.mascota_nombre, desempate_manual: p.desempate_manual })),
    criterios: criterios.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, peso_desempate: c.peso_desempate })),
    calificaciones: calificaciones.map((c) => ({
      participante_id: c.participante_id, jurado_id: c.jurado_id, total: c.total,
      puntajes: Object.fromEntries(c.detalles.map((d) => [d.criterio_id, d.puntaje]))
    })),
    juradosActivos: jurados.map((j) => j.id),
    puestosPremiados: categoria.puestos_premiados
  });

  const porId = new Map(participantes.map((p) => [p.id, serializarParticipante(p, 'PUBLICO')]));
  return {
    categoria: vistaCategoria(categoria),
    criterios: criterios.map((c) => ({ codigo: c.codigo, nombre: c.nombre })),
    filas: filas.map((f) => ({
      ...f,
      participante: porId.get(f.participante_id),
      calificaciones: calificaciones.filter((c) => c.participante_id === f.participante_id).map((c) => ({
        id: c.id, jurado_id: c.jurado_id, jurado_nombre: c.jurado ? nombreVisible(c.jurado) : null,
        jurado_activo: Boolean(c.jurado && c.jurado.activo), total: c.total, bloqueada: Boolean(c.bloqueada)
      }))
    })),
    empates_sin_resolver,
    generado_at: new Date().toISOString()
  };
}

// Lo que se congela al publicar: sin detalle por jurado (no es público).
const paraPublicar = (ranking) => ({ ...ranking, filas: ranking.filas.map(({ calificaciones: _omitidas, ...f }) => f) });

async function rankingPublicado(categoriaId) {
  const categoria = await db.TrkCategoria.findByPk(categoriaId);
  const snapshot = categoria && categoria.ranking_publicado
    ? await db.TrkRankingSnapshot.findOne({ where: { categoria_id: categoria.id }, order: [['publicado_at', 'DESC'], ['id', 'DESC']] })
    : null;
  if (!snapshot) throw new TrkError(404, 'RANKING_NO_PUBLICADO', 'El ranking de esta categoría aún no se ha publicado');
  return { ...snapshot.datos, publicado_at: snapshot.publicado_at };
}

async function fijarDesempate(categoriaId, orden, ctx) {
  await db.sequelize.transaction(async (transaction) => {
    // Orden de bloqueo del módulo: evento → participantes → categoría (evita deadlocks con la pasarela).
    await db.TrkEventoEstado.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
    const filas = await db.TrkParticipante.findAll({ where: { id: orden, categoria_id: categoriaId, fusionado_en_id: null }, transaction, lock: transaction.LOCK.UPDATE });
    if (filas.length !== orden.length) throw new TrkError(400, 'VALIDACION', 'Todos los participantes deben pertenecer a la categoría');
    const antes = Object.fromEntries(filas.map((f) => [f.id, f.desempate_manual]));
    for (const [i, id] of orden.entries()) await db.TrkParticipante.update({ desempate_manual: i + 1 }, { where: { id }, transaction });
    await registrarAuditoria(ctx, { entidad: 'categoria', entidadId: categoriaId, accion: 'FIJAR_DESEMPATE', antes, despues: Object.fromEntries(orden.map((id, i) => [id, i + 1])) }, { transaction });
  });
  return rankingEnVivo(categoriaId);
}

module.exports = { rankingEnVivo, rankingPublicado, fijarDesempate, paraPublicar };
