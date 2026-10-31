// src/porteria/services/reportes.service.js
// Datos del reporte de movimientos: la vista v_por_movimientos (vigentes, con duración y km del viaje)
// filtrada igual que GET /eventos. Con un tope de filas para no agotar la memoria del servidor.
const PorteriaError = require('../utils/PorteriaError');
const { condicionesListado } = require('../repositorios/eventos');

const LIMITE_FILAS = 50000;
const COLUMNAS = `v.id, DATE_FORMAT(v.registrado_at, '%Y-%m-%d %H:%i') AS fecha, v.sede_nombre, v.sentido, v.tipo_vehiculo,
  v.placa, v.vehiculo_marca, v.vehiculo_modelo, v.empresa, v.conductor_nombre, v.conductor_otro, v.motivo_nombre,
  v.referencia_codigo, v.referencia_texto, v.kilometraje, v.duracion_min, v.km_recorridos, v.inconsistente,
  v.inconsistencia_tipo, e.observaciones, v.registrado_por`;
const DESDE = 'FROM v_por_movimientos v JOIN por_eventos e ON e.id = v.id';

function crearServicioReportes({ bd, limite = LIMITE_FILAS }) {
  return {
    async movimientos(filtros) {
      const { where, params } = condicionesListado(filtros);
      const ejecutor = bd.obtener();
      const [[{ total }]] = await ejecutor.query(`SELECT COUNT(*) AS total ${DESDE} ${where}`, params);
      if (Number(total) > limite) {
        throw new PorteriaError(413, 'DEMASIADOS_REGISTROS', `El reporte supera ${limite} movimientos. Acota las fechas o los filtros.`);
      }
      const [filas] = await ejecutor.query(`SELECT ${COLUMNAS} ${DESDE} ${where} ORDER BY v.registrado_at, v.id`, params);
      return filas.map((f) => ({ ...f, conductor_otro: f.conductor_otro === 1, inconsistente: f.inconsistente === 1 }));
    },
  };
}

module.exports = { crearServicioReportes, LIMITE_FILAS };
