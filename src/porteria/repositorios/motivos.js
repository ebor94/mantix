// src/porteria/repositorios/motivos.js
// Lectura de por_motivos. Las columnas se eligen de un mapa cerrado: nunca se interpola texto del usuario.
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
};
