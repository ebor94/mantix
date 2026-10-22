// ============================================
// Matriz del jurado (HU-8b, v2.1): vista por categoría y borradores privados por jurado.
// Los borradores NO son calificaciones: ranking, tablero y exportación solo leen trk_calificaciones (CA9).
// ============================================
const db = require('../../models');
const TrkError = require('../utils/TrkError');
const { serializarParticipante } = require('../utils/serializar');
const { borradorVigente } = require('../utils/borrador');
const { buscarModelo, INCLUIR_CATEGORIA } = require('./participantes.service');
const { CALIFICABLES, criteriosDeRubrica, conDetalles } = require('./calificaciones.service');

const vistaCategoria = (c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, abierta: Boolean(c.abierta) });
const vistaCriterio = (c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, descripcion: c.descripcion, puntaje_max: c.puntaje_max, orden: c.orden });
const ORDEN_FILAS = [
  [db.sequelize.literal('`TrkParticipante`.`orden_pasarela` IS NULL'), 'ASC'],
  ['orden_pasarela', 'ASC'],
  ['llegada_at', 'ASC'],
  ['mascota_nombre', 'ASC']
];

// CA2: el jurado no recibe ningún dato del responsable, ni siquiera el primer nombre.
function participanteParaJurado(p) {
  const { responsable_primer_nombre: _omitido, ...publico } = serializarParticipante(p, 'PUBLICO');
  return publico;
}

async function categoriaPorDefecto(categorias) {
  const estado = await db.TrkEventoEstado.findByPk(1, { include: [{ model: db.TrkParticipante, as: 'enPasarela' }] });
  const enPasarela = estado && estado.enPasarela;
  return enPasarela ? categorias.find((c) => c.id === enPasarela.categoria_id) || null : null;
}

async function obtenerMatriz(categoriaId, ctx) {
  const categorias = await db.TrkCategoria.findAll({ order: [['orden', 'ASC']] });
  let categoria;
  if (categoriaId) {
    categoria = categorias.find((c) => c.id === Number(categoriaId));
    if (!categoria) throw new TrkError(404, 'NO_ENCONTRADO', 'Categoría no encontrada');
  } else {
    categoria = await categoriaPorDefecto(categorias);
  }
  const base = { categorias: categorias.map(vistaCategoria) };
  if (!categoria) return { ...base, categoria: null, criterios: [], puntaje_total_max: 0, filas: [] };

  const criterios = await criteriosDeRubrica(categoria.rubrica_id);
  const participantes = (await db.TrkParticipante.findAll({
    where: { categoria_id: categoria.id, fusionado_en_id: null, estado: CALIFICABLES },
    include: INCLUIR_CATEGORIA,
    order: ORDEN_FILAS
  })).sort((a, b) => Number(b.estado === 'EN_PASARELA') - Number(a.estado === 'EN_PASARELA'));
  const ids = participantes.map((p) => p.id);
  const [borradores, finales] = ids.length
    ? await Promise.all([
      db.TrkBorrador.findAll({ where: { jurado_id: ctx.usuarioId, participante_id: ids } }),
      db.TrkCalificacion.findAll({ where: { jurado_id: ctx.usuarioId, participante_id: ids }, ...conDetalles })
    ])
    : [[], []];

  const filas = participantes.map((p) => {
    const cal = finales.find((c) => c.participante_id === p.id) || null;
    const delFinal = new Map(cal ? cal.detalles.map((d) => [d.criterio_id, d.puntaje]) : []);
    const propios = new Map(borradores.filter((b) => b.participante_id === p.id).map((b) => [b.criterio_id, b.puntaje]));
    return {
      participante: participanteParaJurado(p),
      borrador: borradorVigente(criterios, propios, delFinal),
      final: {
        estado: cal ? (cal.bloqueada ? 'FINAL' : 'DESBLOQUEADA') : null,
        total: cal ? cal.total : null,
        puntajes: cal ? Object.fromEntries(criterios.map((c) => [c.id, delFinal.has(c.id) ? delFinal.get(c.id) : null])) : null
      }
    };
  });

  return {
    ...base,
    categoria: vistaCategoria(categoria),
    criterios: criterios.map(vistaCriterio),
    puntaje_total_max: criterios.reduce((s, c) => s + c.puntaje_max, 0),
    filas
  };
}

// Parcial: solo se validan los criterios enviados. null = casilla vacía.
function validarBorrador(criterios, puntajes) {
  const ids = puntajes.map((x) => Number(x.criterio_id));
  if (new Set(ids).size !== ids.length) throw new TrkError(400, 'VALIDACION', 'Hay criterios repetidos');
  const porId = new Map(criterios.map((c) => [c.id, c]));
  if (ids.some((id) => !porId.has(id))) throw new TrkError(400, 'VALIDACION', 'Hay criterios que no pertenecen a la rúbrica de la categoría');
  for (const x of puntajes) {
    if (x.puntaje === null) continue;
    const c = porId.get(Number(x.criterio_id));
    if (!Number.isInteger(x.puntaje) || x.puntaje < 0 || x.puntaje > c.puntaje_max) {
      throw new TrkError(422, 'PUNTAJE_FUERA_DE_RANGO', `${c.nombre} debe ser un entero entre 0 y ${c.puntaje_max}`);
    }
  }
}

async function guardarBorrador(participanteId, puntajes, ctx) {
  return db.sequelize.transaction(async (transaction) => {
    // Bloquear la fila del participante serializa con el envío final (TRK-CAL-006), que también la bloquea.
    const p = await buscarModelo(participanteId, { transaction, lock: true });
    if (!CALIFICABLES.includes(p.estado)) throw new TrkError(409, 'ESTADO_INVALIDO', 'La mascota aún no ha salido a pasarela');
    const categoria = await db.TrkCategoria.findByPk(p.categoria_id, { transaction });
    if (!categoria.abierta) throw new TrkError(409, 'CATEGORIA_CERRADA', 'La categoría está cerrada; ya no se puede calificar');
    const final = await db.TrkCalificacion.findOne({ where: { participante_id: p.id, jurado_id: ctx.usuarioId }, transaction });
    if (final && final.bloqueada) throw new TrkError(409, 'CALIFICACION_BLOQUEADA', 'La calificación ya fue enviada y está bloqueada');

    const criterios = await criteriosDeRubrica(categoria.rubrica_id, transaction);
    validarBorrador(criterios, puntajes);
    await db.TrkBorrador.bulkCreate(
      puntajes.map((x) => ({ participante_id: p.id, jurado_id: ctx.usuarioId, criterio_id: Number(x.criterio_id), puntaje: x.puntaje })),
      { updateOnDuplicate: ['puntaje', 'updated_at'], transaction }
    );
    const propios = await db.TrkBorrador.findAll({ where: { participante_id: p.id, jurado_id: ctx.usuarioId }, transaction });
    const delFinal = final ? new Map((await db.TrkCalificacionDetalle.findAll({ where: { calificacion_id: final.id }, transaction })).map((d) => [d.criterio_id, d.puntaje])) : new Map();
    return {
      participante_id: p.id,
      borrador: borradorVigente(criterios, new Map(propios.map((b) => [b.criterio_id, b.puntaje])), delFinal)
    };
  });
}

module.exports = { obtenerMatriz, guardarBorrador, validarBorrador };
