// src/porteria/services/estado.service.js
// Dónde está cada vehículo: sugerencia al escribir la placa, vehículos dentro de una sede y propios fuera.
const PorteriaError = require('../utils/PorteriaError');
const { normalizarPlaca } = require('../utils/placa');
const repoEstado = require('../repositorios/estado');
const repoEventos = require('../repositorios/eventos');

function crearServicioEstado({ bd, h360, vehiculosExternos }) {
  async function sugerir(placaCruda) {
    const placa = normalizarPlaca(typeof placaCruda === 'string' ? placaCruda : '');
    if (!placa) throw new PorteriaError(400, 'VALIDACION', 'Indica la placa');

    const [vehiculo, externo, estado] = await Promise.all([
      h360.obtenerVehiculoPropioPorPlaca(placa),
      vehiculosExternos.obtenerPorPlaca(placa),
      repoEstado.obtener(bd.obtener(), placa),
    ]);
    const tipo = vehiculo ? 'PROPIO' : externo ? externo.tipo : null;
    // Mismo criterio que al registrar: sin historial, un propio está dentro y un proveedor fuera.
    const tipoVehiculo = vehiculo ? 'PROPIO' : externo?.tipo ?? estado?.tipo_vehiculo ?? null;
    const dentro = estado ? estado.dentro === 1 : tipo === 'PROPIO';

    let propuesta = null;
    if (tipo === 'PROPIO' && estado && estado.salida_abierta_id) {
      const s = await repoEventos.obtener(bd.obtener(), estado.salida_abierta_id);
      if (s) {
        propuesta = {
          motivo: s.motivo, asistencia_id: s.asistencia_id, exequia_id: s.exequia_id, referencia_texto: s.referencia_texto,
          referencia: s.referencia, conductor_usuario: s.conductor_usuario, conductor_nombre: s.conductor_nombre, conductor_otro: s.conductor_otro,
        };
      }
    }

    if (tipoVehiculo && tipoVehiculo !== 'PROPIO' && estado && estado.dentro === 1 && estado.ultimo_evento_id) {
      const u = await repoEventos.obtener(bd.obtener(), estado.ultimo_evento_id);
      if (u) propuesta = { motivo: u.motivo, empresa: u.empresa, conductor_nombre: u.conductor_nombre, conductor_documento: u.conductor_documento };
    }

    return {
      placa,
      tipo_vehiculo: tipoVehiculo,
      vehiculo,
      vehiculo_externo: externo,
      estado: estado ? { dentro: estado.dentro === 1, sede_id: estado.sede_id, desde: estado.desde } : null,
      sentido_sugerido: dentro ? 'SALIDA' : 'INGRESO',
      propuesta,
    };
  }

  return {
    sugerir,
    dentro: (sedeId) => repoEstado.dentroDeSede(bd.obtener(), sedeId),
    fuera: (sedeId) => repoEstado.propiosFuera(bd.obtener(), sedeId),
  };
}

module.exports = { crearServicioEstado };
