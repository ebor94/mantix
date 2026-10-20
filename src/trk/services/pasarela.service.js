const { Op } = require('sequelize');
const db = require('../../models');
const TrkError = require('../utils/TrkError');
const { serializarParticipante } = require('../utils/serializar');
const { nivelDatos } = require('../utils/permisos');
const { registrarAuditoria } = require('./auditoria.service');
const { buscarModelo, listar } = require('./participantes.service');
const { emitir } = require('../sockets/bus');

const PUEDEN_SALIR = ['PRESENTE', 'PRESENTADO', 'EN_PASARELA'];

async function llamarAPasarela(id, ctx) {
  const { actual, anteriores } = await db.sequelize.transaction(async (transaction) => {
    // Serializa llamadas concurrentes: todas bloquean la fila única de estado del evento.
    await db.TrkEventoEstado.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
    const p = await buscarModelo(id, { transaction, lock: true });
    if (!PUEDEN_SALIR.includes(p.estado)) {
      throw new TrkError(409, 'ESTADO_INVALIDO', 'Solo mascotas que pasaron por cabina pueden salir a pasarela');
    }
    const previas = await db.TrkParticipante.findAll({
      where: { estado: 'EN_PASARELA', id: { [Op.ne]: p.id } }, transaction, lock: transaction.LOCK.UPDATE
    });
    for (const previa of previas) await previa.update({ estado: 'PRESENTADO' }, { transaction });
    await p.update({ estado: 'EN_PASARELA' }, { transaction });
    await db.TrkEventoEstado.update({ participante_en_pasarela_id: p.id }, { where: { id: 1 }, transaction });
    await registrarAuditoria(ctx, {
      entidad: 'participante', entidadId: p.id, accion: 'LLAMAR_PASARELA',
      antes: { en_pasarela: previas.map((x) => x.id) }, despues: { en_pasarela: p.id }
    }, { transaction });
    return { actual: p, anteriores: previas.map((x) => x.id) };
  });
  emitir('pasarela:cambio', { participante: actual.get({ plain: true }), anteriores });
  return serializarParticipante(actual, nivelDatos(ctx.usuario));
}

async function reordenarCola({ categoria_id: categoriaId, orden }, ctx) {
  await db.sequelize.transaction(async (transaction) => {
    const filas = await db.TrkParticipante.findAll({ where: { id: orden, fusionado_en_id: null }, transaction, lock: transaction.LOCK.UPDATE });
    if (filas.length !== orden.length || filas.some((f) => f.categoria_id !== Number(categoriaId))) {
      throw new TrkError(400, 'VALIDACION', 'Todos los participantes deben existir y pertenecer a la categoría');
    }
    for (const [i, id] of orden.entries()) {
      await db.TrkParticipante.update({ orden_pasarela: i + 1 }, { where: { id }, transaction });
    }
    await registrarAuditoria(ctx, { entidad: 'categoria', entidadId: categoriaId, accion: 'REORDENAR_COLA', despues: { orden } }, { transaction });
  });
  emitir('participante:actualizado', { categoria_id: Number(categoriaId), orden }, { rooms: ['admin', 'cabina', 'comentarista'] });
  return listar({ categoria: categoriaId }, ctx.usuario);
}

module.exports = { llamarAPasarela, reordenarCola };
