// Puesta en marcha: marca como dentro de una sede a los propios activos de H360 que aún no tienen estado.
// No crea eventos y nunca pisa un estado existente; cada fila sembrada queda auditada.
const PorteriaError = require('../utils/PorteriaError');
const { conTransaccion } = require('../utils/transaccion');
const repoEstado = require('../repositorios/estado');
const { registrarAuditoria } = require('../repositorios/auditoria');

function crearServicioSiembra({ bd, h360 }) {
  async function sembrarPropios({ sedeId, placas = null, usuario }) {
    const sede = await h360.obtenerSede(sedeId);
    if (!sede) throw new PorteriaError(404, 'SEDE_NO_ENCONTRADA', 'La sede no existe o está inactiva');

    const propios = await h360.listarVehiculosPropios();
    const porPlaca = new Map(propios.map((v) => [v.placa, v]));
    const omitidos = [];
    let objetivo = propios;
    if (placas) {
      objetivo = [];
      for (const placa of placas) {
        if (porPlaca.has(placa)) objetivo.push(porPlaca.get(placa));
        else omitidos.push({ placa, razon: 'no es un vehículo activo de la empresa' });
      }
    }

    const sembrados = [];
    for (const vehiculo of objetivo) {
      const creado = await conTransaccion(bd, async (conn) => {
        if (!(await repoEstado.sembrar(conn, { placa: vehiculo.placa, sedeId: sede.id }))) return false;
        await registrarAuditoria(conn, {
          usuario, entidad: 'vehiculo', entidadId: vehiculo.id, accion: 'SEMBRAR',
          despues: { placa: vehiculo.placa, sede_id: sede.id },
        });
        return true;
      });
      if (creado) sembrados.push(vehiculo.placa);
      else omitidos.push({ placa: vehiculo.placa, razon: 'ya tiene estado' });
    }
    return { sembrados, omitidos };
  }

  return { sembrarPropios };
}

module.exports = { crearServicioSiembra };
