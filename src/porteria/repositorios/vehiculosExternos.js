// src/porteria/repositorios/vehiculosExternos.js
// Catálogo de vehículos de proveedor para autocompletar. Las placas se guardan normalizadas.
const PorteriaError = require('../utils/PorteriaError');
const { patronContiene } = require('../utils/texto');

const COLUMNAS = 'id, placa, tipo, empresa, descripcion, activo';
const EDITABLES = ['tipo', 'empresa', 'descripcion', 'activo'];
const publico = (v) => (v ? { ...v, activo: v.activo === 1 } : null);

function crearRepositorioVehiculosExternos(bd) {
  const ejecutor = (conn) => conn || bd.obtener();

  async function obtenerPorId(id) {
    const [[fila]] = await bd.obtener().query(`SELECT ${COLUMNAS} FROM por_vehiculos_externos WHERE id = ?`, [id]);
    return publico(fila);
  }

  return {
    async buscar(q) {
      const filtro = q ? 'AND (placa LIKE ? OR empresa LIKE ?)' : '';
      const patron = patronContiene(q ?? '');
      const [filas] = await bd.obtener().query(
        `SELECT ${COLUMNAS} FROM por_vehiculos_externos WHERE activo = 1 ${filtro} ORDER BY empresa, placa LIMIT 30`,
        q ? [patron, patron] : [],
      );
      return filas.map(publico);
    },

    /** Incluye inactivos: el registro reconoce la placa aunque ya no se ofrezca para autocompletar. */
    async obtenerPorPlaca(placa, conn) {
      const [[fila]] = await ejecutor(conn).query(`SELECT ${COLUMNAS} FROM por_vehiculos_externos WHERE placa = ?`, [placa]);
      return publico(fila);
    },

    obtenerPorId,

    async crear({ placa, tipo, empresa, descripcion = null, usuario }, conn) {
      try {
        const [r] = await ejecutor(conn).query(
          'INSERT INTO por_vehiculos_externos (placa, tipo, empresa, descripcion, created_by) VALUES (?, ?, ?, ?, ?)',
          [placa, tipo, empresa, descripcion, usuario],
        );
        return r.insertId;
      } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') throw new PorteriaError(409, 'PLACA_DUPLICADA', 'La placa ya está en el catálogo');
        throw err;
      }
    },

    async actualizar(id, cambios, usuario) {
      const columnas = Object.keys(cambios).filter((c) => EDITABLES.includes(c));
      if (columnas.length === 0) return Boolean(await obtenerPorId(id));
      const [r] = await bd.obtener().query(
        `UPDATE por_vehiculos_externos SET ${columnas.map((c) => `${c} = ?`).join(', ')}, updated_at = NOW(), updated_by = ?
          WHERE id = ?`,
        [...columnas.map((c) => cambios[c]), usuario, id],
      );
      return r.affectedRows > 0;
    },
  };
}

module.exports = { crearRepositorioVehiculosExternos };
