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

module.exports = {
  listar, obtener, buscarModelo, INCLUIR_CATEGORIA, crearAltaRapida, editar, cambiarEstado, CAMPOS_CABINA, CAMPOS_ADMIN
};
