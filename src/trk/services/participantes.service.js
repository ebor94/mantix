const { Op } = require('sequelize');
const db = require('../../models');
const TrkError = require('../utils/TrkError');
const { normalizarTexto, soloDigitos } = require('../utils/normalizar');
const { serializarParticipante } = require('../utils/serializar');
const { nivelDatos } = require('../utils/permisos');
const { ESTADOS_VISIBLES_PUBLICO } = require('../config/constantes');

const INCLUIR_CATEGORIA = [{ model: db.TrkCategoria, as: 'categoria' }];
const ORDEN_COLA = [
  [{ model: db.TrkCategoria, as: 'categoria' }, 'orden', 'ASC'],
  [db.sequelize.literal('`TrkParticipante`.`orden_pasarela` IS NULL'), 'ASC'],
  ['orden_pasarela', 'ASC'],
  ['llegada_at', 'ASC'],
  ['mascota_nombre', 'ASC']
];

function filtroBusqueda(q) {
  const texto = String(q || '').trim();
  if (!texto) return null;
  const condiciones = [
    { mascota_nombre_norm: { [Op.like]: `%${normalizarTexto(texto)}%` } },
    { responsable_nombre: { [Op.like]: `%${texto}%` } } // collation utf8mb4_unicode_ci: ignora tildes y mayúsculas
  ];
  const digitos = soloDigitos(texto);
  if (digitos.length >= 3 && digitos === texto.replace(/\s/g, '')) {
    condiciones.push({ responsable_documento: { [Op.like]: `%${digitos}` } });
  }
  return { [Op.or]: condiciones };
}

async function listar({ categoria, estado, q } = {}, usuario) {
  const nivel = nivelDatos(usuario);
  const where = { fusionado_en_id: null };
  if (categoria) where.categoria_id = Number(categoria);
  if (estado) where.estado = estado;
  if (nivel === 'PUBLICO') where.estado = estado && ESTADOS_VISIBLES_PUBLICO.includes(estado) ? estado : ESTADOS_VISIBLES_PUBLICO;
  const busqueda = filtroBusqueda(q);
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

module.exports = { listar, obtener, buscarModelo, INCLUIR_CATEGORIA };
