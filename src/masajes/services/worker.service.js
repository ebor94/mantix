// Worker del outbox (Tarea 13, spec §6.2 y §11): toma tareas pendientes, revalida la cita y llama al adaptador.
// Entrega "al menos una vez": si el proceso muere justo después de enviar, la reserva vence y se reintenta.
const notificacionesRepo = require('../repositorios/notificaciones');
const citasRepo = require('../repositorios/citas');
const historial = require('../repositorios/historial');
const { enTransaccion } = require('../utils/transaccion');
const { redactar } = require('../utils/redactar');
const { errorParaLog } = require('../utils/errorSeguro');
const { CORREOS, recordatorioSms } = require('../plantillas');
const { local } = require('../dominio/tiempo');

const RESERVA_MS = 5 * 60000;
const LOTE = 50;
const REQUIERE_AGENDADA = new Set(['calendar_upsert', 'spa_nueva', 'spa_reprogramada', 'empleado_confirmacion', 'recordatorio_2d', 'es_hoy']);
const REQUIERE_CANCELADA = new Set(['calendar_delete', 'spa_cancelada', 'empleado_cancelacion']);
const AL_SPA = new Set(['spa_nueva', 'spa_reprogramada', 'spa_cancelada']);

class Descartar extends Error {}
class FalloDefinitivo extends Error {}

const inicioDeClave = (clave) => String(clave).split(':').slice(3).join(':');

function crearWorkerOutbox({ bd, obtenerConfig, obtenerIntegraciones, adaptadores, reloj = () => new Date(), log }) {
  let avisado = false;

  /** Revalida contra el estado ACTUAL de la cita: lo encolado pudo quedar viejo (reprogramación, cancelación). */
  function revalidar(n, cita) {
    if (!cita) throw new Descartar('CITA_NO_EXISTE');
    if (inicioDeClave(n.clave) !== cita.inicio.toISOString()) throw new Descartar('INICIO_CAMBIO');
    if (REQUIERE_AGENDADA.has(n.tipo) && cita.estado !== 'agendada') throw new Descartar(`CITA_${cita.estado.toUpperCase()}`);
    if (REQUIERE_CANCELADA.has(n.tipo) && cita.estado !== 'cancelada') throw new Descartar(`CITA_${cita.estado.toUpperCase()}`);
  }

  async function ejecutar(n, cita, integ, config, ejecutor) {
    const beneficiario = { nombre: cita.b_nombre, cargo: cita.b_cargo, celular: cita.b_celular, correo: cita.b_correo };
    const datos = { cita, beneficiario, spa: integ.spa, appUrl: config.appUrl };

    if (n.tipo === 'calendar_upsert') {
      const id = await adaptadores.calendario.upsert({ ...datos, googleEventId: cita.google_event_id });
      await citasRepo.guardarEventoGoogle(ejecutor, cita.id, id);
      return;
    }
    if (n.tipo === 'calendar_delete') {
      await adaptadores.calendario.eliminar(cita.google_event_id);
      await citasRepo.guardarEventoGoogle(ejecutor, cita.id, null);
      return;
    }
    if (n.canal === 'sms') {
      if (!beneficiario.celular) throw new FalloDefinitivo('SIN_CELULAR');
      await adaptadores.sms.enviar(beneficiario.celular, recordatorioSms(datos));
      return;
    }
    const para = AL_SPA.has(n.tipo) ? integ.spa.email : beneficiario.correo;
    if (!para) throw new Descartar('SIN_CORREO');
    const antes = n.tipo === 'spa_reprogramada' ? await historial.inicioAnteriorDe(ejecutor, cita.id, cita.inicio) : null;
    await adaptadores.correo.enviar(para, CORREOS[n.tipo]({ ...datos, antes }));
  }

  /** SMS del día en hora Colombia; con el tope alcanzado, la tarea espera hasta la medianoche local. */
  async function topeSmsAlcanzado(ejecutor, tope, ahora) {
    const dia = local(ahora).startOf('day');
    const n = await notificacionesRepo.contarSmsEnviadosEntre(ejecutor, dia.toDate(), dia.add(1, 'day').toDate());
    return n >= tope ? dia.add(1, 'day').toDate() : null;
  }

  async function procesarPendientes({ limite = LOTE } = {}) {
    const integraciones = obtenerIntegraciones();
    if (!integraciones.ok) {
      if (!avisado) { avisado = true; log.warn(`masajes outbox detenido: ${integraciones.motivo}`); }
      return { procesadas: 0, motivo: 'SIN_INTEGRACIONES' };
    }
    avisado = false;
    const integ = integraciones.config;
    const config = obtenerConfig();
    const tope = integ.smsTopeDiario ?? config.smsTopeDiario;
    const ahora = reloj();

    const lote = await enTransaccion(bd, (conn) => notificacionesRepo.reclamarLote(conn, { ahora, hasta: new Date(ahora.getTime() + RESERVA_MS), limite }));
    const ejecutor = bd.obtener();
    const r = { procesadas: lote.length, enviadas: 0, fallidas: 0, descartadas: 0, pospuestas: 0 };

    for (const n of lote) {
      try {
        const cita = await citasRepo.obtenerParaNotificar(ejecutor, n.cita_id);
        revalidar(n, cita);
        if (n.canal === 'sms') {
          const manana = await topeSmsAlcanzado(ejecutor, tope, ahora);
          if (manana) {
            await notificacionesRepo.posponer(ejecutor, n.id, manana);
            log.warn('masajes: tope diario de SMS alcanzado; los demás salen mañana', { tope });
            r.pospuestas += 1;
            continue;
          }
        }
        await ejecutar(n, cita, integ, config, ejecutor);
        await notificacionesRepo.marcarEnviada(ejecutor, n.id, reloj());
        r.enviadas += 1;
      } catch (err) {
        if (err instanceof Descartar) {
          await notificacionesRepo.marcarDescartada(ejecutor, n.id, err.message);
          r.descartadas += 1;
          continue;
        }
        const intentos = n.intentos + 1;
        const definitivo = err instanceof FalloDefinitivo || err.reintentable === false || intentos >= config.outboxMaxIntentos;
        await notificacionesRepo.registrarFallo(ejecutor, n.id, {
          intentos,
          estado: definitivo ? 'fallido' : 'pendiente',
          proximo: new Date(ahora.getTime() + 2 ** intentos * 60000),
          error: err instanceof FalloDefinitivo ? err.message : redactar(err),
        });
        if (definitivo) log.error('masajes: notificación fallida', { id: n.id, tipo: n.tipo, canal: n.canal, ...errorParaLog(err) });
        r.fallidas += 1;
      }
    }
    return r;
  }

  return { procesarPendientes };
}

module.exports = { crearWorkerOutbox, RESERVA_MS };
