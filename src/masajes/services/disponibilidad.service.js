// Disponibilidad de la agenda (Tarea 7): lectura para la grilla y validación de franja para agendar.
const semanasRepo = require('../repositorios/semanas');
const bloqueosRepo = require('../repositorios/bloqueos');
const citasRepo = require('../repositorios/citas');
const { crearFranjas } = require('../dominio/franjas');
const { festivosEntre } = require('../dominio/festivos');
const { armarDisponibilidad, validarRango } = require('../dominio/disponibilidad');
const { deLocal, local } = require('../dominio/tiempo');

function crearServicioDisponibilidad({ bd, obtenerConfig, reloj = () => new Date() }) {
  const herramientas = () => {
    const config = obtenerConfig();
    return { config, franjas: crearFranjas(config) };
  };

  /** Franjas entre `desde` y `hasta` (YYYY-MM-DD, máx. 31 días). `esAdmin` solo cuenta si es exactamente true. */
  async function consultar({ desde, hasta, esAdmin }) {
    validarRango(desde, hasta);
    const admin = esAdmin === true;
    const { config, franjas } = herramientas();
    const inicio = deLocal(`${desde}T00:00`).toDate();
    const fin = deLocal(`${hasta}T00:00`).add(1, 'day').toDate();
    const desdeLunes = franjas.lunesDe(deLocal(`${desde}T12:00`).toDate());
    const ejecutor = bd.obtener();

    const [semanas, bloqueos, citas] = await Promise.all([
      semanasRepo.listarEnRango(ejecutor, desdeLunes, hasta, { soloPublicadas: !admin }),
      bloqueosRepo.enRango(ejecutor, inicio, fin),
      citasRepo.activasEnRango(ejecutor, inicio, fin, { conBeneficiario: admin }),
    ]);
    return armarDisponibilidad({
      franjas, semanas, festivos: festivosEntre(desdeLunes, hasta), bloqueos, citas,
      ahora: reloj(), anticipacionH: config.anticipacionAgendarH, esAdmin: admin, desde, hasta,
    });
  }

  /**
   * Dentro de la transacción de agendar/reprogramar: { semanaId, capacidad } si `inicio` es una franja válida,
   * no festiva, de una semana publicada y sin bloqueo; si no, null. Deja la semana con bloqueo compartido.
   * No mira si hay cupo en la franja: eso lo decide el índice UNIQUE de slot_key al insertar.
   */
  async function esFranjaHabilitada(conn, inicio) {
    const { config, franjas } = herramientas();
    if (!franjas.esFranjaValida(inicio)) return null;
    const fecha = local(inicio).format('YYYY-MM-DD');
    if (festivosEntre(fecha, fecha).length) return null;

    const semana = await semanasRepo.publicadaPorLunesCompartida(conn, franjas.lunesDe(inicio));
    if (!semana) return null;
    const fin = new Date(inicio.getTime() + config.duracionMin * 60000);
    if (await bloqueosRepo.haySolapado(conn, semana.id, inicio, fin)) return null;
    return { semanaId: semana.id, capacidad: semana.capacidad };
  }

  return { consultar, esFranjaHabilitada };
}

module.exports = { crearServicioDisponibilidad };
