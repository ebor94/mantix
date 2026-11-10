// Composición de los servicios del módulo: un solo lugar donde se arman sus dependencias.
// Las rutas y los jobs reciben esto; las pruebas pueden reemplazar cualquier pieza (p. ej. el outbox).
const { crearServicioBeneficiarios } = require('./beneficiarios.service');
const { crearServicioDisponibilidad } = require('./disponibilidad.service');
const { crearServicioCitas } = require('./citas.service');
const { crearOutbox } = require('./outbox.service');

function crearServicios({ bd, obtenerConfig, reloj = () => new Date(), ...reemplazos }) {
  const beneficiarios = reemplazos.beneficiarios || crearServicioBeneficiarios({ bd });
  const disponibilidad = reemplazos.disponibilidad || crearServicioDisponibilidad({ bd, obtenerConfig, reloj });
  const outbox = reemplazos.outbox || crearOutbox();
  const citas = reemplazos.citas || crearServicioCitas({ bd, obtenerConfig, disponibilidad, outbox, reloj });
  return { beneficiarios, disponibilidad, outbox, citas };
}

module.exports = { crearServicios };
