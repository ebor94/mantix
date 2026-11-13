// Datos del evento que viajan en el correo de confirmación.
const EVENTO = Object.freeze({
  titulo: 'II Taller de Duelo Animal "Tu huella sigue conmigo"',
  fecha: 'Sábado 21 de noviembre de 2026',
  hora: '09:00 a. m.',
  lugar: 'Auditorio Carlos Corredor, Sede 4, Universidad Simón Bolívar, Cúcuta',
});

// Mensaje cuando se llena el cupo. Viaja con el motivo 'CERRADAS' a propósito: el frontend ya cambia a su
// pantalla de cerrado con ese motivo.
const MENSAJE_CUPO = 'Se completaron los cupos para este encuentro. Gracias por tu interés 🐾';

module.exports = { EVENTO, MENSAJE_CUPO };
