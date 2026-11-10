// Encolado de recordatorios (Tarea 14, spec §11). Idempotente: la clave del outbox incluye el inicio de la cita,
// así que correrlo dos veces no duplica y una cita reprogramada recibe recordatorios nuevos.
const citasRepo = require('../repositorios/citas');
const { enTransaccion } = require('../utils/transaccion');
const { local } = require('../dominio/tiempo');

const DOS_DIAS_MS = 48 * 3600000;

function crearServicioRecordatorios({ bd, outbox }) {
  const diaLocal = (ahora, desplazamiento) => {
    const d = local(ahora).startOf('day').add(desplazamiento, 'day');
    return [d.toDate(), d.add(1, 'day').toDate()];
  };

  async function encolar(citas, pares) {
    for (const c of citas) await enTransaccion(bd, (conn) => outbox.encolar(conn, c, pares));
    return { encoladas: citas.length };
  }

  /** Citas agendadas de pasado mañana (hora Colombia). Las creadas con menos de 2 días ya tuvieron su confirmación. */
  async function encolarRecordatorios2d(ahora) {
    const [desde, hasta] = diaLocal(ahora, 2);
    const citas = (await citasRepo.agendadasEntre(bd.obtener(), desde, hasta))
      .filter((c) => c.inicio.getTime() - new Date(c.created_at).getTime() >= DOS_DIAS_MS);
    return encolar(citas, [['recordatorio_2d', 'email'], ['recordatorio_2d', 'sms']]);
  }

  /** "¡Es hoy! ¡Es hoy!": citas agendadas de hoy (hora Colombia). */
  async function encolarEsHoy(ahora) {
    const [desde, hasta] = diaLocal(ahora, 0);
    return encolar(await citasRepo.agendadasEntre(bd.obtener(), desde, hasta), [['es_hoy', 'email']]);
  }

  return { encolarRecordatorios2d, encolarEsHoy };
}

module.exports = { crearServicioRecordatorios };
