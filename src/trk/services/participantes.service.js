const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const db = require('../../models');
const TrkError = require('../utils/TrkError');
const { normalizarTexto, soloDigitos } = require('../utils/normalizar');
const { serializarParticipante } = require('../utils/serializar');
const { nivelDatos } = require('../utils/permisos');
const { ESTADOS_VISIBLES_PUBLICO } = require('../config/constantes');
const { tienePermiso } = require('../utils/permisos');
const { registrarAuditoria } = require('./auditoria.service');
const { emitir } = require('../sockets/bus');
const { procesarYGuardarFoto, dirFotos } = require('./fotos.service');

const INCLUIR_CATEGORIA = [{ model: db.TrkCategoria, as: 'categoria' }];
const ORDEN_COLA = [
  [{ model: db.TrkCategoria, as: 'categoria' }, 'orden', 'ASC'],
  [db.sequelize.literal('`TrkParticipante`.`orden_pasarela` IS NULL'), 'ASC'],
  ['orden_pasarela', 'ASC'],
  ['llegada_at', 'ASC'],
  ['mascota_nombre', 'ASC']
];

const escaparLike = (t) => String(t).replace(/[\\%_]/g, '\\$&');

// RNF-5: en nivel PUBLICO solo se busca por mascota; buscar por responsable/documento sería un oráculo de datos personales.
function filtroBusqueda(q, nivel) {
  const texto = String(q || '').trim();
  if (!texto) return null;
  const condiciones = [{ mascota_nombre_norm: { [Op.like]: `%${escaparLike(normalizarTexto(texto))}%` } }];
  if (nivel === 'COMPLETO') {
    condiciones.push({ responsable_nombre: { [Op.like]: `%${escaparLike(texto)}%` } }); // collation utf8mb4_unicode_ci: ignora tildes y mayúsculas
    const digitos = soloDigitos(texto);
    if (digitos.length >= 3 && digitos === texto.replace(/\s/g, '')) {
      condiciones.push({ responsable_documento: { [Op.like]: `%${digitos}` } });
    }
  }
  return { [Op.or]: condiciones };
}

async function listar({ categoria, estado, q } = {}, usuario) {
  const nivel = nivelDatos(usuario);
  const where = { fusionado_en_id: null };
  if (categoria) where.categoria_id = Number(categoria);
  if (estado) where.estado = estado;
  if (nivel === 'PUBLICO') {
    if (estado && !ESTADOS_VISIBLES_PUBLICO.includes(estado)) return [];
    where.estado = estado || ESTADOS_VISIBLES_PUBLICO;
  }
  const busqueda = filtroBusqueda(q, nivel);
  if (busqueda) Object.assign(where, busqueda);
  const filas = await db.TrkParticipante.findAll({ where, include: INCLUIR_CATEGORIA, order: ORDEN_COLA });
  return filas.map((p) => serializarParticipante(p, nivel));
}

async function buscarModelo(id, { transaction, lock } = {}) {
  const p = await db.TrkParticipante.findByPk(id, {
    include: INCLUIR_CATEGORIA,
    transaction,
    lock: lock && transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (!p || p.fusionado_en_id) throw new TrkError(404, 'NO_ENCONTRADO', 'Participante no encontrado');
  return p;
}

async function obtener(id, usuario) {
  const nivel = nivelDatos(usuario);
  const p = await buscarModelo(id);
  if (nivel === 'PUBLICO' && !ESTADOS_VISIBLES_PUBLICO.includes(p.estado)) {
    throw new TrkError(404, 'NO_ENCONTRADO', 'Participante no encontrado');
  }
  return serializarParticipante(p, nivel);
}

const CAMPOS_CABINA = ['mascota_nombre', 'disfraz_nombre', 'raza', 'edad_texto', 'sexo', 'especie', 'categoria_id', 'responsable_telefono', 'responsable_correo'];
const CAMPOS_ADMIN = [...CAMPOS_CABINA, 'responsable_nombre', 'responsable_documento', 'autoriza_datos', 'autoriza_reglamento', 'foto_inscripcion_url'];

function aDuplicado(e) {
  if (e && e.name === 'SequelizeUniqueConstraintError') {
    return new TrkError(409, 'DUPLICADO', 'Ya existe un participante con ese documento y nombre de mascota');
  }
  return e;
}

async function recargarCompleto(p, transaction) {
  await p.reload({ include: INCLUIR_CATEGORIA, transaction });
  return serializarParticipante(p, 'COMPLETO');
}

async function crearAltaRapida(datos, ctx) {
  try {
    const creado = await db.sequelize.transaction(async (transaction) => {
      const p = await db.TrkParticipante.create({
        ...datos,
        responsable_documento: datos.responsable_documento || null,
        mascota_nombre_norm: normalizarTexto(datos.mascota_nombre),
        estado: 'INSCRITO',
        origen: 'CABINA'
      }, { transaction });
      await registrarAuditoria(ctx, { entidad: 'participante', entidadId: p.id, accion: 'CREAR', despues: datos }, { transaction });
      return p;
    });
    await creado.reload({ include: INCLUIR_CATEGORIA });
    emitir('participante:actualizado', { participante: creado.get({ plain: true }) }, { rooms: ['admin', 'cabina'] });
    return serializarParticipante(creado, 'COMPLETO');
  } catch (e) {
    throw aDuplicado(e);
  }
}

async function editar(id, cambios, ctx) {
  const permitidos = tienePermiso(ctx.usuario, 'editar') ? CAMPOS_ADMIN : CAMPOS_CABINA;
  const prohibidos = Object.keys(cambios).filter((c) => !permitidos.includes(c));
  if (prohibidos.length) throw new TrkError(403, 'SIN_PERMISO', `No puedes editar: ${prohibidos.join(', ')}`);

  try {
    const resultado = await db.sequelize.transaction(async (transaction) => {
      const p = await buscarModelo(id, { transaction, lock: true });
      const antes = p.get({ plain: true });
      const { categoria_id: nuevaCategoria, ...resto } = cambios;
      let requiereConfirmacion = false;

      if (resto.mascota_nombre !== undefined) resto.mascota_nombre_norm = normalizarTexto(resto.mascota_nombre);
      Object.assign(p, resto);

      if (nuevaCategoria !== undefined && nuevaCategoria !== p.categoria_id) {
        const categoria = await db.TrkCategoria.findByPk(nuevaCategoria, { transaction });
        if (!categoria) throw new TrkError(400, 'VALIDACION', 'Categoría inexistente');
        const calificaciones = await db.TrkCalificacion.count({ where: { participante_id: p.id }, transaction });
        if (calificaciones > 0) {
          p.categoria_propuesta_id = nuevaCategoria;
          requiereConfirmacion = true;
          await registrarAuditoria(ctx, { entidad: 'participante', entidadId: p.id, accion: 'PROPONER_CATEGORIA', antes: { categoria_id: antes.categoria_id }, despues: { categoria_propuesta_id: nuevaCategoria } }, { transaction });
        } else {
          p.categoria_id = nuevaCategoria;
          p.categoria_propuesta_id = null;
          await registrarAuditoria(ctx, { entidad: 'participante', entidadId: p.id, accion: 'CAMBIAR_CATEGORIA', antes: { categoria_id: antes.categoria_id }, despues: { categoria_id: nuevaCategoria } }, { transaction });
        }
      } else if (nuevaCategoria !== undefined) {
        p.categoria_propuesta_id = null;
      }

      await p.save({ transaction });
      const cambiados = Object.keys(resto);
      if (cambiados.length) {
        await registrarAuditoria(ctx, {
          entidad: 'participante', entidadId: p.id, accion: 'EDITAR',
          antes: Object.fromEntries(cambiados.map((c) => [c, antes[c]])),
          despues: Object.fromEntries(cambiados.map((c) => [c, p[c]]))
        }, { transaction });
      }
      return { p, requiereConfirmacion };
    });
    const participante = await recargarCompleto(resultado.p);
    emitir('participante:actualizado', { participante: resultado.p.get({ plain: true }) });
    return { participante, requiere_confirmacion: resultado.requiereConfirmacion };
  } catch (e) {
    throw aDuplicado(e);
  }
}

const TRANSICIONES_AUSENCIA = { INSCRITO: 'AUSENTE', AUSENTE: 'INSCRITO' };

async function cambiarEstado(id, estado, ctx) {
  const p = await db.sequelize.transaction(async (transaction) => {
    const participante = await buscarModelo(id, { transaction, lock: true });
    if (TRANSICIONES_AUSENCIA[participante.estado] !== estado) {
      throw new TrkError(409, 'ESTADO_INVALIDO', `No se puede pasar de ${participante.estado} a ${estado}`);
    }
    const antes = participante.estado;
    await participante.update({ estado }, { transaction });
    await registrarAuditoria(ctx, { entidad: 'participante', entidadId: participante.id, accion: 'CAMBIAR_ESTADO', antes: { estado: antes }, despues: { estado } }, { transaction });
    return participante;
  });
  emitir('participante:actualizado', { participante: p.get({ plain: true }) });
  return recargarCompleto(p);
}

async function guardarFotoOficial(id, buffer, ctx) {
  await buscarModelo(id); // 404 antes de gastar CPU o tocar disco
  const nombre = await procesarYGuardarFoto(buffer);
  let p;
  try {
    p = await db.sequelize.transaction(async (transaction) => {
      const participante = await buscarModelo(id, { transaction, lock: true });
      const previo = { foto_oficial_path: participante.foto_oficial_path, estado: participante.estado };
      const cambios = { foto_oficial_path: nombre, foto_oficial_at: new Date() };
      if (['INSCRITO', 'AUSENTE'].includes(participante.estado)) {
        cambios.estado = 'PRESENTE';
        if (!participante.llegada_at) cambios.llegada_at = new Date();
        if (participante.orden_pasarela == null) {
          // Serializa el cálculo de MAX+1 entre participantes de la misma categoría.
          await db.TrkCategoria.findByPk(participante.categoria_id, { transaction, lock: transaction.LOCK.UPDATE });
          const maximo = await db.TrkParticipante.max('orden_pasarela', { where: { categoria_id: participante.categoria_id }, transaction });
          cambios.orden_pasarela = (maximo || 0) + 1;
        }
      }
      await participante.update(cambios, { transaction });
      await registrarAuditoria(ctx, { entidad: 'participante', entidadId: participante.id, accion: 'FOTO_OFICIAL', antes: previo, despues: { foto_oficial_path: nombre, estado: participante.estado } }, { transaction });
      return participante;
    });
  } catch (e) {
    await fs.promises.unlink(path.join(dirFotos(), nombre)).catch((err) => { if (err.code !== 'ENOENT') throw err; });
    throw e;
  }
  const plano = p.get({ plain: true });
  emitir('foto:nueva', { participante: plano });
  emitir('participante:actualizado', { participante: plano });
  return recargarCompleto(p);
}

// Orden de avance para decidir el estado del destino tras fusionar.
const AVANCE = ['AUSENTE', 'INSCRITO', 'PRESENTE', 'PRESENTADO', 'EN_PASARELA'];

async function fusionar(origenId, destinoId, ctx) {
  if (origenId === destinoId) throw new TrkError(400, 'VALIDACION', 'No se puede fusionar un registro consigo mismo');
  const { dest, origen, repuntada } = await db.sequelize.transaction(async (transaction) => {
    // Convención de locks: trk_evento_estado primero, luego participantes.
    await db.TrkEventoEstado.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
    const o = await buscarModelo(origenId, { transaction, lock: true });
    const d = await buscarModelo(destinoId, { transaction, lock: true });
    const calsOrigen = await db.TrkCalificacion.findAll({ where: { participante_id: o.id }, transaction, lock: transaction.LOCK.UPDATE });
    const calsDestino = await db.TrkCalificacion.findAll({ where: { participante_id: d.id }, transaction });
    const choques = calsOrigen.filter((c) => calsDestino.some((x) => x.jurado_id === c.jurado_id));
    if (choques.length) {
      throw new TrkError(409, 'FUSION_CON_CHOQUE', 'Un mismo jurado calificó ambos registros; desbloquea o elimina una de las calificaciones antes de fusionar',
        choques.map((c) => ({ campo: 'jurado_id', mensaje: `Jurado ${c.jurado_id} calificó ambos` })));
    }
    if (calsOrigen.length && o.categoria_id !== d.categoria_id) {
      throw new TrkError(409, 'CATEGORIAS_DISTINTAS', 'El origen tiene calificaciones de otra categoría; cambia primero su categoría o la del destino');
    }

    const antesOrigen = { estado: o.estado, orden_pasarela: o.orden_pasarela, categoria_id: o.categoria_id };
    const antesDestino = d.get({ plain: true });
    const movidas = calsOrigen.map((c) => ({ id: c.id, jurado_id: c.jurado_id }));
    for (const c of calsOrigen) await c.update({ participante_id: d.id }, { transaction });

    const cambios = {};
    if (o.foto_oficial_at && (!d.foto_oficial_at || o.foto_oficial_at > d.foto_oficial_at)) {
      cambios.foto_oficial_path = o.foto_oficial_path;
      cambios.foto_oficial_at = o.foto_oficial_at;
    }
    if (AVANCE.indexOf(o.estado) > AVANCE.indexOf(d.estado)) cambios.estado = o.estado;
    if (!d.llegada_at && o.llegada_at) cambios.llegada_at = o.llegada_at;
    if (d.orden_pasarela == null && o.orden_pasarela != null) cambios.orden_pasarela = o.orden_pasarela;
    if (Object.keys(cambios).length) await d.update(cambios, { transaction });

    let apuntada = false;
    if (o.estado === 'EN_PASARELA') {
      const [filas] = await db.TrkEventoEstado.update({ participante_en_pasarela_id: d.id }, { where: { id: 1, participante_en_pasarela_id: o.id }, transaction });
      apuntada = filas > 0;
    }
    const estadoOrigen = o.estado === 'EN_PASARELA' ? 'PRESENTADO' : o.estado;
    await o.update({ fusionado_en_id: d.id, estado: estadoOrigen }, { transaction });

    await registrarAuditoria(ctx, {
      entidad: 'participante', entidadId: o.id, accion: 'FUSIONAR',
      antes: antesOrigen, despues: { fusionado_en_id: d.id, estado: estadoOrigen }
    }, { transaction });
    const despuesDestino = { origen_id: o.id, calificaciones_movidas: movidas, ...cambios };
    if (apuntada) despuesDestino.en_pasarela = { antes: o.id, despues: d.id };
    await registrarAuditoria(ctx, {
      entidad: 'participante', entidadId: d.id, accion: 'FUSIONAR',
      antes: Object.fromEntries(Object.keys(cambios).map((k) => [k, antesDestino[k]])),
      despues: despuesDestino
    }, { transaction });
    return { dest: d, origen: o, repuntada: apuntada };
  });
  const planoDestino = dest.get({ plain: true });
  if (repuntada) emitir('pasarela:cambio', { participante: planoDestino, anteriores: [origen.id] });
  emitir('participante:actualizado', { participante: origen.get({ plain: true }) });
  emitir('participante:actualizado', { participante: planoDestino });
  return recargarCompleto(dest);
}

async function confirmarCategoria(id, { confirmar }, ctx) {
  const p = await db.sequelize.transaction(async (transaction) => {
    // Orden de bloqueo del módulo: evento → participantes → categoría. Sin el evento primero, esta transacción
    // (participante → categoría destino) podía interbloquearse con el envío final del jurado (TRK-CAL-006).
    await db.TrkEventoEstado.findByPk(1, { transaction, lock: transaction.LOCK.UPDATE });
    const participante = await buscarModelo(id, { transaction, lock: true });
    if (!participante.categoria_propuesta_id) throw new TrkError(400, 'VALIDACION', 'No hay un cambio de categoría propuesto');
    const calificaciones = await db.TrkCalificacion.findAll({ where: { participante_id: participante.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (calificaciones.length && confirmar !== true) {
      throw new TrkError(409, 'CONFIRMACION_REQUERIDA', `Confirmar borrará ${calificaciones.length} calificación(es) porque la rúbrica cambia`);
    }
    const antes = {
      categoria_id: participante.categoria_id,
      calificaciones: calificaciones.map((c) => ({ id: c.id, jurado_id: c.jurado_id, total: c.total }))
    };
    await db.TrkCalificacion.destroy({ where: { participante_id: participante.id }, transaction });
    const nueva = participante.categoria_propuesta_id;
    // Serializa el cálculo de MAX+1 entre participantes de la misma categoría.
    await db.TrkCategoria.findByPk(nueva, { transaction, lock: transaction.LOCK.UPDATE });
    const maximo = await db.TrkParticipante.max('orden_pasarela', { where: { categoria_id: nueva }, transaction });
    await participante.update({
      categoria_id: nueva, categoria_propuesta_id: null, desempate_manual: null,
      orden_pasarela: participante.orden_pasarela == null ? null : (maximo || 0) + 1
    }, { transaction });
    await registrarAuditoria(ctx, {
      entidad: 'participante', entidadId: participante.id, accion: 'CAMBIAR_CATEGORIA',
      antes, despues: { categoria_id: nueva, calificaciones_borradas: calificaciones.length }
    }, { transaction });
    return participante;
  });
  emitir('participante:actualizado', { participante: p.get({ plain: true }) });
  return recargarCompleto(p);
}

module.exports = {
  fusionar, confirmarCategoria, guardarFotoOficial, listar, obtener, buscarModelo, INCLUIR_CATEGORIA, crearAltaRapida, editar, cambiarEstado, CAMPOS_CABINA, CAMPOS_ADMIN
};
