// src/porteria/repositorios/vehiculosExternos.js
// Catálogo de vehículos de proveedor para autocompletar. Las placas se guardan normalizadas.
// Cada alta y cada cambio queda en por_auditoria en la misma transacción.
const PorteriaError = require('../utils/PorteriaError');
const { patronContiene } = require('../utils/texto');
const { conTransaccion } = require('../utils/transaccion');
const { registrarAuditoria } = require('./auditoria');

const COLUMNAS = 'id, placa, tipo, empresa, descripcion, activo';
const EDITABLES = ['tipo', 'empresa', 'descripcion', 'activo'];
const ENTIDAD = 'vehiculo_externo';
const publico = (v) => (v ? { ...v, activo: v.activo === 1 } : null);

function crearRepositorioVehiculosExternos(bd) {
  const ejecutor = (conn) => conn || bd.obtener();

  async function obtenerPorId(id, conn = null, { bloquear = false } = {}) {
    const [[fila]] = await ejecutor(conn).query(
      `SELECT ${COLUMNAS} FROM por_vehiculos_externos WHERE id = ?${bloquear ? ' FOR UPDATE' : ''}`, [id],
    );
    return publico(fila);
  }

  async function insertar(conn, { placa, tipo, empresa, descripcion = null, usuario }, ctx) {
    let id;
    try {
      const [r] = await conn.query(
        'INSERT INTO por_vehiculos_externos (placa, tipo, empresa, descripcion, created_by) VALUES (?, ?, ?, ?, ?)',
        [placa, tipo, empresa, descripcion, usuario],
      );
      id = r.insertId;
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') throw new PorteriaError(409, 'PLACA_DUPLICADA', 'La placa ya está en el catálogo');
      throw err;
    }
    await registrarAuditoria(conn, {
      usuario, apiCodigo: ctx.apiCodigo, entidad: ENTIDAD, entidadId: id, accion: 'CREAR', despues: await obtenerPorId(id, conn), ip: ctx.ip,
    });
    return id;
  }

  return {
    /** Activos para autocompletar; el admin pide también los inactivos para reactivarlos. */
    async buscar(q, { incluirInactivos = false } = {}) {
      const condiciones = [];
      const params = [];
      if (!incluirInactivos) condiciones.push('activo = 1');
      if (q) {
        const patron = patronContiene(q);
        condiciones.push('(placa LIKE ? OR empresa LIKE ?)');
        params.push(patron, patron);
      }
      const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
      const [filas] = await bd.obtener().query(
        `SELECT ${COLUMNAS} FROM por_vehiculos_externos ${where} ORDER BY empresa, placa LIMIT 30`, params,
      );
      return filas.map(publico);
    },

    /** Incluye inactivos: el registro reconoce la placa aunque ya no se ofrezca para autocompletar. */
    async obtenerPorPlaca(placa, conn) {
      const [[fila]] = await ejecutor(conn).query(`SELECT ${COLUMNAS} FROM por_vehiculos_externos WHERE placa = ?`, [placa]);
      return publico(fila);
    },

    obtenerPorId,

    /** Con `conn` escribe dentro de esa transacción (el registro de un evento); sin ella abre una propia. */
    async crear(datos, conn = null, ctx = {}) {
      if (conn) return insertar(conn, datos, ctx);
      return conTransaccion(bd, (c) => insertar(c, datos, ctx));
    },

    async actualizar(id, cambios, usuario, ctx = {}) {
      const columnas = Object.keys(cambios).filter((c) => EDITABLES.includes(c));
      return conTransaccion(bd, async (conn) => {
        const antes = await obtenerPorId(id, conn, { bloquear: true });
        if (!antes) return false;
        if (columnas.length === 0) return true;
        await conn.query(
          `UPDATE por_vehiculos_externos SET ${columnas.map((c) => `${c} = ?`).join(', ')}, updated_at = NOW(), updated_by = ?
            WHERE id = ?`,
          [...columnas.map((c) => cambios[c]), usuario, id],
        );
        await registrarAuditoria(conn, {
          usuario, apiCodigo: ctx.apiCodigo, entidad: ENTIDAD, entidadId: id, accion: 'CORREGIR',
          antes, despues: await obtenerPorId(id, conn), ip: ctx.ip,
        });
        return true;
      });
    },
  };
}

module.exports = { crearRepositorioVehiculosExternos };
