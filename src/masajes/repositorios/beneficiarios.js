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

module.exports = { listarParaImportar, insertar, actualizarDatosListado };
