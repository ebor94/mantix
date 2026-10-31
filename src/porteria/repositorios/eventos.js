// src/porteria/repositorios/eventos.js
// por_eventos. Las escrituras reciben la conexión de la transacción; las columnas salen de listas cerradas.
const { patronContiene } = require('../utils/texto');

const COLUMNAS_EVENTO = `e.id, e.sede_id, e.sentido, e.tipo_vehiculo, e.placa, e.vehiculo_id, e.vehiculo_externo_id,
  e.conductor_usuario, e.conductor_nombre, e.conductor_documento, e.conductor_otro, e.empresa,
  e.motivo_id, m.codigo AS motivo_codigo, m.nombre AS motivo_nombre,
  e.asistencia_id, e.exequia_id, e.referencia_texto, e.referencia_snapshot, e.evento_par_id, e.kilometraje,
  e.observaciones, e.inconsistente, e.inconsistencia_tipo, e.registrado_at, e.registrado_por,
  e.corregido_at, e.corregido_por, e.anulado, e.anulado_por, e.anulado_at, e.anulado_motivo`;
const FROM_EVENTO = 'FROM por_eventos e JOIN por_motivos m ON m.id = e.motivo_id';

const EDITABLES = [
  'motivo_id', 'asistencia_id', 'exequia_id', 'referencia_texto', 'referencia_snapshot',
  'conductor_usuario', 'conductor_nombre', 'conductor_documento', 'conductor_otro', 'empresa',
  'kilometraje', 'observaciones',
];
const AL_REGISTRAR = [
  'sede_id', 'sentido', 'tipo_vehiculo', 'placa', 'vehiculo_id', 'vehiculo_externo_id', ...EDITABLES,
  'evento_par_id', 'inconsistente', 'inconsistencia_tipo', 'registrado_por', 'clave_cliente',
];

const valorDe = (columna, valor) => {
  if (columna === 'referencia_snapshot') return valor === null || valor === undefined ? null : JSON.stringify(valor);
  return valor === undefined ? null : valor;
};

function eventoPublico(fila) {
  const { motivo_codigo: codigo, motivo_nombre: nombre, referencia_snapshot: snapshot, ...e } = fila;
  return {
    ...e,
    conductor_otro: e.conductor_otro === 1,
    inconsistente: e.inconsistente === 1,
    anulado: e.anulado === 1,
    motivo: { id: e.motivo_id, codigo, nombre },
    referencia: typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot ?? null,
  };
}

async function insertar(conn, evento) {
  const [r] = await conn.query(
    `INSERT INTO por_eventos (${AL_REGISTRAR.join(', ')}) VALUES (?)`,
    [AL_REGISTRAR.map((c) => valorDe(c, evento[c]))],
  );
  return r.insertId;
}

// FOR UPDATE OF e: bloquea solo el evento, no la fila del motivo (que comparten muchos eventos).
async function obtener(ejecutor, id, { bloquear = false } = {}) {
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${FROM_EVENTO} WHERE e.id = ?${bloquear ? ' FOR UPDATE OF e' : ''}`, [id],
  );
  return filas[0] ? eventoPublico(filas[0]) : null;
}

async function obtenerPorClave(ejecutor, usuario, clave) {
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${FROM_EVENTO} WHERE e.registrado_por = ? AND e.clave_cliente = ?`, [usuario, clave],
  );
  return filas[0] ? eventoPublico(filas[0]) : null;
}

/** Ingresos que cierran el viaje del evento `id`, bloqueados: al anularlo pierden el par. */
async function pareadosCon(conn, id) {
  const [filas] = await conn.query(`SELECT ${COLUMNAS_EVENTO} ${FROM_EVENTO} WHERE e.evento_par_id = ? FOR UPDATE OF e`, [id]);
  return filas.map(eventoPublico);
}

async function antiguedadSegundos(ejecutor, id) {
  const [[fila]] = await ejecutor.query(
    'SELECT TIMESTAMPDIFF(SECOND, registrado_at, NOW()) AS segundos FROM por_eventos WHERE id = ?', [id],
  );
  return fila ? Number(fila.segundos) : null;
}

// Llamar solo después de estado.bloquear en la misma transacción: las escrituras de una placa están
// serializadas por ese bloqueo, así que el id más alto es el más reciente.
async function ultimoVigente(ejecutor, placa) {
  const [[fila]] = await ejecutor.query(
    `SELECT id, sede_id, sentido, tipo_vehiculo, registrado_at FROM por_eventos
      WHERE placa = ? AND anulado = 0 ORDER BY id DESC LIMIT 1`,
    [placa],
  );
  return fila || null;
}

async function actualizar(conn, id, cambios, usuario) {
  const columnas = Object.keys(cambios).filter((c) => EDITABLES.includes(c));
  if (columnas.length === 0) return;
  await conn.query(
    `UPDATE por_eventos SET ${columnas.map((c) => `${c} = ?`).join(', ')}, corregido_at = NOW(), corregido_por = ?
      WHERE id = ?`,
    [...columnas.map((c) => valorDe(c, cambios[c])), usuario, id],
  );
}

async function anular(conn, id, { usuario, motivo }) {
  await conn.query(
    `UPDATE por_eventos SET anulado = 1, anulado_por = ?, anulado_at = NOW(), anulado_motivo = ?, evento_par_id = NULL
      WHERE id = ?`,
    [usuario, motivo, id],
  );
  await conn.query('UPDATE por_eventos SET evento_par_id = NULL WHERE evento_par_id = ?', [id]);
}

/** WHERE de la consulta de eventos (alias `e`). La comparten el listado y el reporte. */
function condicionesListado(filtros = {}) {
  const condiciones = [];
  const params = [];
  const agregar = (sql, valor) => { condiciones.push(sql); params.push(valor); };
  if (filtros.sedeId) agregar('e.sede_id = ?', filtros.sedeId);
  if (filtros.desde) agregar('e.registrado_at >= ?', `${filtros.desde} 00:00:00`);
  if (filtros.hasta) agregar('e.registrado_at < ? + INTERVAL 1 DAY', filtros.hasta);
  if (filtros.placa) agregar('e.placa LIKE ?', patronContiene(filtros.placa));
  if (filtros.tipoVehiculo) agregar('e.tipo_vehiculo = ?', filtros.tipoVehiculo);
  if (filtros.motivoId) agregar('e.motivo_id = ?', filtros.motivoId);
  if (filtros.inconsistente !== undefined) agregar('e.inconsistente = ?', filtros.inconsistente ? 1 : 0);
  return { where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', params };
}

async function listar(ejecutor, filtros = {}, { pagina = 1, porPagina = 50 } = {}) {
  const { where, params } = condicionesListado(filtros);

  const [[{ total }]] = await ejecutor.query(`SELECT COUNT(*) AS total FROM por_eventos e ${where}`, params);
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${FROM_EVENTO} ${where} ORDER BY e.registrado_at DESC, e.id DESC LIMIT ? OFFSET ?`,
    [...params, porPagina, (pagina - 1) * porPagina],
  );
  return { items: filas.map(eventoPublico), total: Number(total), pagina, por_pagina: porPagina };
}

module.exports = {
  COLUMNAS_EVENTO, FROM_EVENTO, eventoPublico,
  insertar, obtener, obtenerPorClave, pareadosCon, antiguedadSegundos, ultimoVigente, actualizar, anular, listar, condicionesListado,
};
