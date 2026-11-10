// src/masajes/repositorios/beneficiarios.js
const { enteroSql } = require('../utils/paginacion');
// Acceso a msj_beneficiarios. Reciben la conexión de la transacción. Columnas fijas: nunca se interpola texto.

/** Todos los beneficiarios con los campos que compara la importación, bloqueados hasta el commit. */
async function listarParaImportar(conn) {
  const [filas] = await conn.execute('SELECT id, nombre, cargo, celular, correo FROM msj_beneficiarios FOR UPDATE');
  return filas;
}

async function insertar(conn, { nombre, cargo, celular, correo }, actor) {
  const [r] = await conn.execute(
    'INSERT INTO msj_beneficiarios (nombre, cargo, celular, correo, updated_by) VALUES (?, ?, ?, ?, ?)',
    [nombre, cargo, celular, correo, actor],
  );
  return r.insertId;
}

/** Solo los datos que trae el listado: nunca ad_usuario ni activo, que los decide el admin. */
async function actualizarDatosListado(conn, id, { nombre, cargo, correo }, actor) {
  await conn.execute(
    'UPDATE msj_beneficiarios SET nombre = ?, cargo = ?, correo = ?, updated_by = ? WHERE id = ?',
    [nombre, cargo, correo, actor, id],
  );
}

// ---- Identidad (login y cada petición) ----

/** Beneficiario vinculado a ese usuario AD, activo o no (el login decide qué hacer con un inactivo). */
async function buscarPorUsuario(ejecutor, usuario) {
  const [filas] = await ejecutor.execute('SELECT id, nombre, activo FROM msj_beneficiarios WHERE ad_usuario = ?', [usuario]);
  return filas[0] || null;
}

/** Solo activos: lo usa resolverBeneficiario en cada petición. */
async function obtenerActivoPorUsuario(ejecutor, usuario) {
  const [filas] = await ejecutor.execute('SELECT id, nombre FROM msj_beneficiarios WHERE ad_usuario = ? AND activo = 1', [usuario]);
  return filas[0] || null;
}

/**
 * TODOS los beneficiarios con ese correo (vinculados o no), bloqueados hasta el commit. Se cuentan todos a
 * propósito: en un buzón compartido donde uno ya está vinculado, el otro no debe quedar para cualquiera.
 */
async function porCorreoParaVincular(conn, correo) {
  const [filas] = await conn.execute('SELECT id, nombre, ad_usuario, activo FROM msj_beneficiarios WHERE correo = ? FOR UPDATE', [correo]);
  return filas;
}

/** Vincula solo si sigue sin vincular; devuelve si se aplicó. */
async function vincular(conn, id, usuario) {
  const [r] = await conn.execute(
    'UPDATE msj_beneficiarios SET ad_usuario = ?, updated_by = ? WHERE id = ? AND ad_usuario IS NULL',
    [usuario, usuario, id],
  );
  return r.affectedRows === 1;
}

/** Dentro de la transacción de agendar: ¿existe y está activo? Bloqueo compartido: no se desactiva a mitad. */
async function estaActivoCompartido(conn, id) {
  const [filas] = await conn.execute('SELECT activo FROM msj_beneficiarios WHERE id = ? FOR SHARE', [id]);
  return Boolean(filas[0] && filas[0].activo);
}

// ---- Administración ----

const COLUMNAS_ADMIN = 'id, nombre, cargo, celular, correo, ad_usuario, activo, updated_at, updated_by';
// LIKE con '!' como escape: el texto del usuario nunca actúa como comodín (% o _).
const escaparLike = (q) => `%${q.replace(/[!%_]/g, '!$&')}%`;

/** Filtros de una lista cerrada; los valores siempre van como parámetros. */
async function listarAdmin(ejecutor, { q, sinVincular, activo, limite, desplazamiento }) {
  const where = [];
  const params = [];
  if (q) { where.push("nombre LIKE ? ESCAPE '!'"); params.push(escaparLike(q)); }
  if (sinVincular === true) where.push('ad_usuario IS NULL');
  if (activo === true || activo === false) { where.push('activo = ?'); params.push(activo ? 1 : 0); }
  const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await ejecutor.execute(`SELECT COUNT(*) AS total FROM msj_beneficiarios ${filtro}`, params);
  // LIMIT/OFFSET ya validados como enteros por el servicio: van en el SQL porque execute() no los acepta como ?.
  const [items] = await ejecutor.execute(
    `SELECT ${COLUMNAS_ADMIN} FROM msj_beneficiarios ${filtro} ORDER BY nombre LIMIT ${enteroSql(limite)} OFFSET ${enteroSql(desplazamiento)}`,
    params,
  );
  return { total: Number(total), items };
}

async function obtenerAdmin(ejecutor, id) {
  const [filas] = await ejecutor.execute(`SELECT ${COLUMNAS_ADMIN} FROM msj_beneficiarios WHERE id = ?`, [id]);
  return filas[0] || null;
}

async function obtenerParaModificar(conn, id) {
  const [filas] = await conn.execute(`SELECT ${COLUMNAS_ADMIN} FROM msj_beneficiarios WHERE id = ? FOR UPDATE`, [id]);
  return filas[0] || null;
}

const EDITABLES = Object.freeze(['nombre', 'cargo', 'celular', 'correo', 'ad_usuario', 'activo']);

/** Solo columnas de la lista EDITABLES; el nombre de columna nunca viene del usuario. */
async function actualizarAdmin(conn, id, cambios, actor) {
  const cols = Object.keys(cambios).filter((c) => EDITABLES.includes(c));
  if (cols.length === 0) return;
  await conn.execute(
    `UPDATE msj_beneficiarios SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_by = ? WHERE id = ?`,
    [...cols.map((c) => cambios[c]), actor, id],
  );
}

async function contarActivos(ejecutor) {
  const [[f]] = await ejecutor.execute('SELECT COUNT(*) AS n FROM msj_beneficiarios WHERE activo = 1');
  return Number(f.n);
}

module.exports = {
  listarParaImportar, insertar, actualizarDatosListado,
  buscarPorUsuario, obtenerActivoPorUsuario, porCorreoParaVincular, vincular, estaActivoCompartido,
  listarAdmin, obtenerAdmin, obtenerParaModificar, actualizarAdmin, contarActivos, EDITABLES,
};
