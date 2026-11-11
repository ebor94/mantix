// Outbox (spec §6.2): la transacción de la cita escribe también sus efectos externos pendientes.
// Así un fallo de Google, del correo o de Háblame nunca bloquea ni revierte una reserva. Worker: Tarea 13.
const repo = require('../repositorios/notificaciones');

// Pares tipo → canal permitidos (lista cerrada, igual a los ENUM de msj_notificaciones).
const CANALES = Object.freeze({
  calendar_upsert: ['google'],
  calendar_delete: ['google'],
  spa_nueva: ['email'],
  spa_reprogramada: ['email'],
  spa_cancelada: ['email'],
  empleado_confirmacion: ['email', 'sms'],
  empleado_cancelacion: ['email'],
  recordatorio_2d: ['email', 'sms'],
  es_hoy: ['email'],
});

/** Idempotencia: la clave incluye el inicio, así una reprogramación genera tareas nuevas. */
const claveDe = (cita, tipo, canal) => `${cita.id}:${tipo}:${canal}:${new Date(cita.inicio).toISOString()}`;

function crearOutbox() {
  async function encolar(conn, cita, pares) {
    for (const [tipo, canal] of pares) {
      if (!(CANALES[tipo] || []).includes(canal)) throw new Error(`OUTBOX_PAR_INVALIDO ${tipo}/${canal}`);
      await repo.encolar(conn, { citaId: cita.id, tipo, canal, clave: claveDe(cita, tipo, canal) });
    }
  }
  return { encolar };
}

module.exports = { crearOutbox, claveDe, CANALES };
