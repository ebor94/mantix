const { QueryTypes } = require('sequelize');
const db = require('../../models');
const TrkError = require('../utils/TrkError');
const logger = require('../../utils/logger');
const { registrarAuditoria } = require('./auditoria.service');
const { emitir } = require('../sockets/bus');
const { ROL_JURADO, ESTADOS } = require('../config/constantes');
const { serializarParticipante } = require('../utils/serializar');
const { INCLUIR_CATEGORIA } = require('./participantes.service');

const vistaCategoriaCorta = (c) => (c ? { id: c.id, codigo: c.codigo, nombre: c.nombre } : null);

// Lo que ve la pantalla pública (sin login) y lo que usan todos como respaldo de polling.
async function estadoPublico() {
  const estado = await db.TrkEventoEstado.findByPk(1, {
    include: [
      { model: db.TrkParticipante, as: 'enPasarela', include: INCLUIR_CATEGORIA },
      { model: db.TrkCategoria, as: 'categoriaPantalla' }
    ]
  });
  let ranking = null;
  if (estado.modo_pantalla === 'RANKING' && estado.categoria_pantalla_id) {
    const { rankingPublicado } = require('./rankingDatos.service');
    try {
      ranking = await rankingPublicado(estado.categoria_pantalla_id);
    } catch (e) {
      // Solo "aún no publicado" es esperado; cualquier otro fallo se registra y la pantalla sigue sin ranking.
      if (!(e instanceof TrkError && e.motivo === 'RANKING_NO_PUBLICADO')) {
        logger.child({ modulo: 'trk' }).error('estadoPublico: fallo al cargar ranking publicado', { message: e.message, stack: e.stack });
      }
    }
  }
  return {
    modo_pantalla: estado.modo_pantalla,
    categoria_pantalla: vistaCategoriaCorta(estado.categoriaPantalla),
    en_pasarela: estado.enPasarela ? serializarParticipante(estado.enPasarela, 'PUBLICO') : null,
    ranking
  };
}

async function cambiarPantalla({ modo, categoria_id: categoriaId }, ctx) {
  let categoria = null;
  if (modo === 'RANKING') {
    categoria = await db.TrkCategoria.findByPk(categoriaId);
    if (!categoria) throw new TrkError(400, 'VALIDACION', 'Indica la categoría a mostrar');
    if (!categoria.ranking_publicado) throw new TrkError(409, 'RANKING_NO_PUBLICADO', 'Publica el ranking de la categoría antes de mostrarlo');
  }
  await db.sequelize.transaction(async (transaction) => {
    await db.TrkEventoEstado.update({ modo_pantalla: modo, categoria_pantalla_id: categoria ? categoria.id : null }, { where: { id: 1 }, transaction });
    await registrarAuditoria(ctx, { entidad: 'evento', entidadId: 1, accion: 'CAMBIAR_PANTALLA', despues: { modo, categoria_id: categoria ? categoria.id : null } }, { transaction });
  });
  const estado = await estadoPublico();
  emitir('pantalla:modo', estado);
  return estado;
}

async function tablero() {
  const categorias = await db.TrkCategoria.findAll({ order: [['orden', 'ASC']] });
  const conteos = await db.sequelize.query(
    'SELECT categoria_id, estado, COUNT(*) AS n FROM trk_participantes WHERE fusionado_en_id IS NULL GROUP BY categoria_id, estado',
    { type: QueryTypes.SELECT }
  );
  const vacios = () => Object.fromEntries(Object.values(ESTADOS).map((e) => [e, 0]));
  const porCategoria = categorias.map((c) => {
    const por_estado = vacios();
    for (const f of conteos.filter((x) => x.categoria_id === c.id)) por_estado[f.estado] = Number(f.n);
    return {
      id: c.id, codigo: c.codigo, nombre: c.nombre, abierta: Boolean(c.abierta), ranking_publicado: Boolean(c.ranking_publicado),
      total: Object.values(por_estado).reduce((s, n) => s + n, 0), por_estado
    };
  });

  const [{ calificables }] = await db.sequelize.query(
    "SELECT COUNT(*) AS calificables FROM trk_participantes WHERE fusionado_en_id IS NULL AND estado IN ('EN_PASARELA','PRESENTADO')",
    { type: QueryTypes.SELECT }
  );
  const jurados = await db.sequelize.query(
    `SELECT u.id, TRIM(CONCAT(u.nombre, ' ', u.apellido)) AS nombre, u.activo,
            (SELECT COUNT(*) FROM trk_calificaciones c JOIN trk_participantes p ON p.id = c.participante_id
              WHERE c.jurado_id = u.id AND p.fusionado_en_id IS NULL AND p.estado IN ('EN_PASARELA','PRESENTADO')) AS calificadas
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
      WHERE r.nombre = :rol
      ORDER BY u.nombre`,
    { type: QueryTypes.SELECT, replacements: { rol: ROL_JURADO } }
  );
  const total = Number(calificables);
  return {
    categorias: porCategoria,
    calificables: total,
    jurados: jurados.map((j) => ({ id: j.id, nombre: j.nombre, activo: Boolean(j.activo), calificadas: Number(j.calificadas), pendientes: total - Number(j.calificadas) }))
  };
}

module.exports = { estadoPublico, vistaCategoriaCorta, cambiarPantalla, tablero };
