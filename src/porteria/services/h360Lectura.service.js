// src/porteria/services/h360Lectura.service.js
// Lecturas (solo SELECT) de las tablas de H360 (vehiculos, asistencias, exequias) y de Mantix (sedes).
// Es el único archivo del módulo que conoce esas tablas: si algún día Portería se separa, solo cambia este.
const { normalizarPlaca, placaSql } = require('../utils/placa');
const { patronContiene } = require('../utils/texto');

const LIMITE = 30;
const ESTADOS_ASISTENCIA = ['NUEVO', 'ASISTENCIA'];
const ESTADOS_EXEQUIA_TERMINALES = ['REALIZADA', 'CANCELADA'];

const COLUMNAS_SEDE = 'id, codigo, nombre, ciudad';
const COLUMNAS_VEHICULO = 'id, placa, marca, modelo, tipo';
const COLUMNAS_ASISTENCIA = 'id, codigo, nombre_ser_querido, contrato, estado, created_at';
// fecha y hora como texto: un DATE convertido a Date de JS cambia de día según la zona del proceso.
const SELECT_EXEQUIA = `
  SELECT e.id, e.tipo, DATE_FORMAT(e.fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(e.hora, '%H:%i') AS hora,
         e.lugar, e.estado, a.codigo AS asistencia_codigo, a.nombre_ser_querido, v.placa AS vehiculo_placa`;
const FROM_EXEQUIA = `
    FROM exequias e
    JOIN asistencias a ON a.id = e.asistencia_id
    LEFT JOIN vehiculos v ON v.id = e.vehiculo_id`;

const conPlacaNormalizada = (v) => (v ? { ...v, placa: normalizarPlaca(v.placa) } : null);
const exequiaPublica = ({ es_de_la_placa: deLaPlaca, ...e }) => ({
  ...e,
  vehiculo_placa: e.vehiculo_placa ? normalizarPlaca(e.vehiculo_placa) : null,
  ...(deLaPlaca === undefined ? {} : { es_de_la_placa: Number(deLaPlaca) === 1 }),
});

function crearH360Lectura(bd) {
  const consultar = async (sql, params = []) => {
    const [filas] = await bd.obtener().query(sql, params);
    return filas;
  };
  const primera = async (sql, params) => (await consultar(sql, params))[0] || null;

  return {
    listarSedes: () => consultar(`SELECT ${COLUMNAS_SEDE} FROM sedes WHERE activo = 1 ORDER BY nombre`),

    obtenerSede: (id) => primera(`SELECT ${COLUMNAS_SEDE} FROM sedes WHERE id = ? AND activo = 1`, [id]),

    async buscarVehiculosPropios(q) {
      const filtro = q ? `AND ${placaSql('placa')} LIKE ?` : '';
      const filas = await consultar(
        `SELECT ${COLUMNAS_VEHICULO} FROM vehiculos WHERE activo = 1 ${filtro} ORDER BY placa LIMIT ${LIMITE}`,
        q ? [patronContiene(normalizarPlaca(q))] : [],
      );
      return filas.map(conPlacaNormalizada);
    },

    async obtenerVehiculoPropioPorPlaca(placa) {
      return conPlacaNormalizada(await primera(
        `SELECT ${COLUMNAS_VEHICULO} FROM vehiculos WHERE activo = 1 AND ${placaSql('placa')} = ? LIMIT 1`,
        [normalizarPlaca(placa)],
      ));
    },

    buscarAsistencias(q) {
      const filtro = q ? 'AND (codigo LIKE ? OR nombre_ser_querido LIKE ? OR contrato LIKE ?)' : '';
      const patron = patronContiene(q ?? '');
      return consultar(
        `SELECT ${COLUMNAS_ASISTENCIA} FROM asistencias WHERE estado IN (?) ${filtro}
          ORDER BY created_at DESC, id DESC LIMIT ${LIMITE}`,
        q ? [ESTADOS_ASISTENCIA, patron, patron, patron] : [ESTADOS_ASISTENCIA],
      );
    },

    obtenerAsistenciaVigente: (id) => primera(
      `SELECT ${COLUMNAS_ASISTENCIA} FROM asistencias WHERE id = ? AND estado IN (?)`, [id, ESTADOS_ASISTENCIA],
    ),

    async buscarExequias({ q, placa } = {}) {
      const placaNormalizada = placa ? normalizarPlaca(placa) : null;
      const filtro = q ? 'AND (a.codigo LIKE ? OR a.nombre_ser_querido LIKE ?)' : '';
      const patron = patronContiene(q ?? '');
      const filas = await consultar(
        `${SELECT_EXEQUIA},
                COALESCE(? IS NOT NULL AND ${placaSql('v.placa')} = ?, 0) AS es_de_la_placa
         ${FROM_EXEQUIA}
          WHERE e.estado NOT IN (?)
            AND e.fecha BETWEEN CURDATE() - INTERVAL 1 DAY AND CURDATE() + INTERVAL 1 DAY
            ${filtro}
          ORDER BY es_de_la_placa DESC, e.fecha, e.hora, e.id
          LIMIT ${LIMITE}`,
        [placaNormalizada, placaNormalizada, ESTADOS_EXEQUIA_TERMINALES, ...(q ? [patron, patron] : [])],
      );
      return filas.map(exequiaPublica);
    },

    async obtenerExequiaVigente(id) {
      const fila = await primera(
        `${SELECT_EXEQUIA} ${FROM_EXEQUIA} WHERE e.id = ? AND e.estado NOT IN (?)`, [id, ESTADOS_EXEQUIA_TERMINALES],
      );
      return fila ? exequiaPublica(fila) : null;
    },
  };
}

module.exports = { crearH360Lectura, ESTADOS_ASISTENCIA, ESTADOS_EXEQUIA_TERMINALES };
