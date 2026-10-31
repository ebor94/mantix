// src/porteria/repositorios/motivos.js
// Lectura de por_motivos. Las columnas se eligen de un mapa cerrado: nunca se interpola texto del usuario.
const PorteriaError = require('../utils/PorteriaError');

const COLUMNA_TIPO = {
  PROPIO: 'aplica_propio',
  PROVEEDOR_ASISTENCIA: 'aplica_proveedor_asistencia',
  PROVEEDOR: 'aplica_proveedor',
};
const COLUMNA_SENTIDO = { INGRESO: 'aplica_ingreso', SALIDA: 'aplica_salida' };

const BOOLEANAS = ['activo', 'referencia_obligatoria', 'aplica_propio', 'aplica_proveedor_asistencia', 'aplica_proveedor', 'aplica_ingreso', 'aplica_salida'];

/** ¿El motivo aplica a ese tipo de vehículo y sentido? (motivo tal como lo devuelve `obtener`). */
function aplica(motivo, tipoVehiculo, sentido) {
  return Boolean(motivo[COLUMNA_TIPO[tipoVehiculo]]) && Boolean(motivo[COLUMNA_SENTIDO[sentido]]);
}

// ---- Administración (reciben el ejecutor: pool o conexión de la transacción) ----

const EDITABLES_ADMIN = [
  'nombre', 'descripcion', 'aplica_propio', 'aplica_proveedor_asistencia', 'aplica_proveedor',
  'aplica_ingreso', 'aplica_salida', 'tipo_referencia', 'referencia_obligatoria', 'orden', 'activo',
];
const COLUMNAS_ADMIN = `m.id, m.codigo, m.nombre, m.descripcion, m.aplica_propio, m.aplica_proveedor_asistencia,
  m.aplica_proveedor, m.aplica_ingreso, m.aplica_salida, m.tipo_referencia, m.referencia_obligatoria, m.orden, m.activo,
  m.updated_at, m.updated_by, EXISTS (SELECT 1 FROM por_eventos e WHERE e.motivo_id = m.id) AS en_uso`;
const motivoAdmin = (f) => ({ ...f, ...Object.fromEntries([...BOOLEANAS, 'en_uso'].map((c) => [c, Number(f[c]) === 1])) });
const ER_ROW_IS_REFERENCED_2 = 1451;

async function listarParaAdmin(ejecutor) {
  const [filas] = await ejecutor.query(`SELECT ${COLUMNAS_ADMIN} FROM por_motivos m ORDER BY m.orden, m.nombre`);
  return filas.map(motivoAdmin);
}

async function obtenerParaAdmin(ejecutor, id, { bloquear = false } = {}) {
  const [[fila]] = await ejecutor.query(
    `SELECT ${COLUMNAS_ADMIN} FROM por_motivos m WHERE m.id = ?${bloquear ? ' FOR UPDATE OF m' : ''}`, [id],
  );
  return fila ? motivoAdmin(fila) : null;
}

async function insertarMotivo(conn, datos, usuario) {
  const columnas = ['codigo', ...EDITABLES_ADMIN];
  try {
    const [r] = await conn.query(
      `INSERT INTO por_motivos (${columnas.join(', ')}, updated_by) VALUES (?)`,
      [[...columnas.map((c) => datos[c]), usuario]],
    );
    return r.insertId;
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') throw new PorteriaError(409, 'CODIGO_DUPLICADO', 'Ya existe un motivo con ese código');
    throw err;
  }
}

async function actualizarMotivo(conn, id, cambios, usuario) {
  const columnas = Object.keys(cambios).filter((c) => EDITABLES_ADMIN.includes(c));
  if (columnas.length === 0) return;
  await conn.query(
    `UPDATE por_motivos SET ${columnas.map((c) => `${c} = ?`).join(', ')}, updated_by = ? WHERE id = ?`,
    [...columnas.map((c) => cambios[c]), usuario, id],
  );
}

async function eliminarMotivo(conn, id) {
  try {
    await conn.query('DELETE FROM por_motivos WHERE id = ?', [id]);
  } catch (err) {
    if (err && err.errno === ER_ROW_IS_REFERENCED_2) throw enUso();
    throw err;
  }
}

function enUso() {
  return new PorteriaError(409, 'MOTIVO_EN_USO', 'El motivo tiene registros: inactívalo en lugar de borrarlo');
}

function crearRepositorioMotivos(bd) {
  async function listarActivos({ tipoVehiculo, sentido } = {}) {
    const condiciones = ['activo = 1'];
    if (tipoVehiculo) {
      if (!COLUMNA_TIPO[tipoVehiculo]) throw new Error(`Tipo de vehículo inválido: ${tipoVehiculo}`);
      condiciones.push(`${COLUMNA_TIPO[tipoVehiculo]} = 1`);
    }
    if (sentido) {
      if (!COLUMNA_SENTIDO[sentido]) throw new Error(`Sentido inválido: ${sentido}`);
      condiciones.push(`${COLUMNA_SENTIDO[sentido]} = 1`);
    }
    const [filas] = await bd.obtener().query(
      `SELECT id, codigo, nombre, descripcion, tipo_referencia, referencia_obligatoria
         FROM por_motivos WHERE ${condiciones.join(' AND ')} ORDER BY orden, nombre`,
    );
    return filas.map((m) => ({ ...m, referencia_obligatoria: m.referencia_obligatoria === 1 }));
  }

  async function obtener(id) {
    const [[fila]] = await bd.obtener().query(
      `SELECT id, codigo, nombre, descripcion, tipo_referencia, referencia_obligatoria, activo,
              aplica_propio, aplica_proveedor_asistencia, aplica_proveedor, aplica_ingreso, aplica_salida
         FROM por_motivos WHERE id = ?`,
      [id],
    );
    if (!fila) return null;
    return { ...fila, ...Object.fromEntries(BOOLEANAS.map((c) => [c, fila[c] === 1])) };
  }

  return { listarActivos, obtener };
}

module.exports = {
  crearRepositorioMotivos,
  aplica,
  TIPOS_VEHICULO: Object.keys(COLUMNA_TIPO),
  SENTIDOS: Object.keys(COLUMNA_SENTIDO),
  listarParaAdmin,
  obtenerParaAdmin,
  insertarMotivo,
  actualizarMotivo,
  eliminarMotivo,
  enUso,
  TIPOS_REFERENCIA: ['NINGUNA', 'ASISTENCIA', 'EXEQUIA', 'TEXTO'],
};
