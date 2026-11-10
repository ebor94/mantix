// src/masajes/repositorios/beneficiarios.js
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

module.exports = {
  listarParaImportar, insertar, actualizarDatosListado,
  buscarPorUsuario, obtenerActivoPorUsuario, porCorreoParaVincular, vincular, estaActivoCompartido,
};
