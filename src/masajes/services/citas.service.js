// Citas: agendar (Tarea 8), reprogramar y cancelar (Tarea 9), asistencia (Tarea 10).
const MasajesError = require('../utils/MasajesError');
const { E } = require('../utils/MasajesError');
const { enTransaccion, conReintentos } = require('../utils/transaccion');
const { limpiar } = require('../utils/texto');
const { crearFranjas } = require('../dominio/franjas');
const { crearReglas } = require('../dominio/reglas');
const citasRepo = require('../repositorios/citas');
const beneficiariosRepo = require('../repositorios/beneficiarios');
const notificacionesRepo = require('../repositorios/notificaciones');
const historial = require('../repositorios/historial');
const { paginar } = require('../utils/paginacion');
const { local } = require('../dominio/tiempo');

const MAX_MOTIVO = 255;

// Decide por el NOMBRE del índice (001_esquema.sql). Un duplicado de otro índice no se disfraza de SLOT_OCUPADO:
// se propaga y termina en 500. sqlMessage se lee para decidir, pero nunca se registra (trae datos).
function mapDuplicado(err) {
  if (!err || err.code !== 'ER_DUP_ENTRY') return err;
  const m = String(err.sqlMessage || '');
  if (m.includes('uq_msj_citas_cupo_key')) return E.CUPO_MES_USADO();
  if (m.includes('uq_msj_citas_slot_key')) return E.SLOT_OCUPADO();
  return err;
}

const comoFecha = (v) => (v instanceof Date ? new Date(v.getTime()) : new Date(Number.NaN));
const esId = (v) => Number.isInteger(v) && v > 0;
const exigirActor = (actor) => { if (typeof actor !== 'string' || actor.trim() === '') throw new Error('ACTOR_REQUERIDO'); };

/** Motivo de cancelación: obligatorio para el admin (spec §5.5), opcional para el empleado, máx. 255. */
function motivoDe(motivo, admin) {
  const m = motivo === undefined || motivo === null ? '' : limpiar(motivo);
  if (m.length > MAX_MOTIVO) throw E.VALIDACION([{ campo: 'motivo', motivo: 'MUY_LARGO' }]);
  if (admin && m === '') throw E.VALIDACION([{ campo: 'motivo', motivo: 'OBLIGATORIO_PARA_ADMIN' }]);
  return m || null;
}

function crearServicioCitas({ bd, obtenerConfig, disponibilidad, outbox, reloj = () => new Date() }) {
  const herramientas = () => {
    const config = obtenerConfig();
    return { config, franjas: crearFranjas(config), reglas: crearReglas(config) };
  };

  /**
   * Ocupa la franja con el primer índice libre (#1..#capacidad). En InnoDB un ER_DUP_ENTRY solo deshace esa
   * sentencia, no la transacción: se prueba el siguiente índice sin consultar antes un "libre" que podría quedar
   * viejo. El cupo del mes (cupo_key) no se reintenta. `escribir(slotKey)` inserta o mueve la cita.
   */
  async function ocuparFranja(inicio, capacidad, franjas, escribir) {
    for (let n = 1; n <= capacidad; n++) {
      try {
        return await escribir(franjas.slotKey(inicio, n));
      } catch (err) {
        const e = mapDuplicado(err);
        if (e && e.motivo === 'SLOT_OCUPADO' && n < capacidad) continue;
        throw e;
      }
    }
    throw E.SLOT_OCUPADO();
  }

  /**
   * Agenda una cita (spec §5.4). El beneficiario lo decide quien llama: la ruta del empleado pasa SIEMPRE el
   * suyo, nunca uno del cuerpo de la petición. `ahora` sale del reloj del servicio, nunca de la petición.
   */
  async function agendar({ beneficiarioId, inicio, actor, esAdmin, auditoria = {} }) {
    exigirActor(actor);
    const { config, franjas, reglas } = herramientas();
    const admin = esAdmin === true;
    const ini = comoFecha(inicio);
    if (!franjas.esFranjaValida(ini)) throw E.FUERA_DE_VENTANA();
    if (!reglas.puedeAgendar({ ahora: reloj(), inicio: ini, esAdmin: admin })) throw E.ANTICIPACION_INSUFICIENTE(config.anticipacionAgendarH);
    if (!esId(beneficiarioId)) throw E.VALIDACION([{ campo: 'beneficiarioId', motivo: 'INVALIDO' }]);

    const periodo = franjas.periodoDe(ini);
    const fin = new Date(ini.getTime() + config.duracionMin * 60000);

    return conReintentos(() => enTransaccion(bd, async (conn) => {
      if (!(await beneficiariosRepo.estaActivoCompartido(conn, beneficiarioId))) {
        throw E.VALIDACION([{ campo: 'beneficiarioId', motivo: 'INACTIVO_O_INEXISTENTE' }]);
      }
      const hab = await disponibilidad.esFranjaHabilitada(conn, ini);
      if (!hab) throw E.FUERA_DE_VENTANA();
      const id = await ocuparFranja(ini, hab.capacidad, franjas, (slotKey) => citasRepo.insertarActiva(conn, {
        beneficiarioId, semanaId: hab.semanaId, inicio: ini, fin, periodo, slotKey, cupoKey: `${beneficiarioId}:${periodo}`, actor,
      }));
      await historial.registrar(conn, { beneficiarioId, citaId: id, accion: 'creada', inicioNuevo: ini, usuario: actor, esAdmin: admin, auditoria });
      const cita = { id, beneficiario_id: beneficiarioId, semana_id: hab.semanaId, inicio: ini, fin, periodo, estado: 'agendada' };
      await outbox.encolar(conn, cita, [['calendar_upsert', 'google'], ['spa_nueva', 'email'], ['empleado_confirmacion', 'email'], ['empleado_confirmacion', 'sms']]);
      return cita;
    }));
  }

  /**
   * Bloquea la cita para modificarla. Empleado: el filtro de propiedad va en el SQL y una cita ajena es
   * NO_ENCONTRADA (no se revela que existe). Sin beneficiario propio, el empleado no encuentra ninguna.
   */
  async function bloquearParaModificar(conn, { citaId, admin, beneficiarioIdActor, reglas, config }) {
    if (!admin && !esId(beneficiarioIdActor)) throw E.NO_ENCONTRADA();
    const cita = await citasRepo.obtenerParaModificar(conn, citaId, admin ? null : beneficiarioIdActor);
    if (!cita) throw E.NO_ENCONTRADA();
    if (cita.estado !== 'agendada') throw E.ESTADO_INVALIDO();
    if (!reglas.puedeModificar({ ahora: reloj(), cita, esAdmin: admin })) throw E.ANTICIPACION_INSUFICIENTE(config.anticipacionModificarH);
    // Cada cambio manda correos al spa e invitaciones: un empleado no puede hacer más de N al día (el admin sí).
    if (!admin) {
      const cambios = await historial.contarCambiosDelEmpleado(conn, cita.beneficiario_id);
      if (cambios >= config.cambiosDiarios) {
        throw new MasajesError(429, 'DEMASIADOS_CAMBIOS', `Ya hiciste ${config.cambiosDiarios} cambios en las últimas 24 horas. Intenta mañana o pide ayuda a Talento Humano.`);
      }
    }
    return cita;
  }

  /** Reprograma la misma cita a otra franja (spec §5.5). Aplica el cupo del periodo destino. */
  async function reprogramar({ citaId, inicio, actor, esAdmin, beneficiarioIdActor, auditoria = {} }) {
    if (!esId(citaId)) throw E.NO_ENCONTRADA();
    exigirActor(actor);
    const { config, franjas, reglas } = herramientas();
    const admin = esAdmin === true;
    const nuevo = comoFecha(inicio);
    if (!franjas.esFranjaValida(nuevo)) throw E.FUERA_DE_VENTANA();

    return conReintentos(() => enTransaccion(bd, async (conn) => {
      const cita = await bloquearParaModificar(conn, { citaId, admin, beneficiarioIdActor, reglas, config });
      if (cita.inicio.getTime() === nuevo.getTime()) throw E.VALIDACION([{ campo: 'inicio', motivo: 'MISMA_FRANJA' }]);
      if (!reglas.puedeAgendar({ ahora: reloj(), inicio: nuevo, esAdmin: admin })) throw E.ANTICIPACION_INSUFICIENTE(config.anticipacionAgendarH);
      const hab = await disponibilidad.esFranjaHabilitada(conn, nuevo);
      if (!hab) throw E.FUERA_DE_VENTANA();

      const periodo = franjas.periodoDe(nuevo);
      const fin = new Date(nuevo.getTime() + config.duracionMin * 60000);
      await ocuparFranja(nuevo, hab.capacidad, franjas, (slotKey) => citasRepo.mover(conn, cita.id, {
        semanaId: hab.semanaId, inicio: nuevo, fin, periodo, slotKey, cupoKey: `${cita.beneficiario_id}:${periodo}`, actor,
      }));
      await historial.registrar(conn, {
        beneficiarioId: cita.beneficiario_id, citaId: cita.id, accion: 'reprogramada',
        inicioAnterior: cita.inicio, inicioNuevo: nuevo, usuario: actor, esAdmin: admin, auditoria,
      });

      const spaSabia = await notificacionesRepo.huboEnvioAlSpa(conn, cita.id, reloj());
      await notificacionesRepo.descartarPendientes(conn, cita.id);
      const movida = { ...cita, semana_id: hab.semanaId, inicio: nuevo, fin, periodo };
      await outbox.encolar(conn, movida, [
        ['calendar_upsert', 'google'], [spaSabia ? 'spa_reprogramada' : 'spa_nueva', 'email'], ['empleado_confirmacion', 'email'], ['empleado_confirmacion', 'sms'],
      ]);
      return { id: cita.id, beneficiario_id: cita.beneficiario_id, semana_id: hab.semanaId, inicio: nuevo, fin, periodo, estado: 'agendada' };
    }));
  }

  /** Cancela: libera franja y cupo (spec §5.3). Admin: motivo obligatorio y sin restricción de anticipación. */
  async function cancelar({ citaId, motivo, actor, esAdmin, beneficiarioIdActor, auditoria = {} }) {
    if (!esId(citaId)) throw E.NO_ENCONTRADA();
    exigirActor(actor);
    const { config, reglas } = herramientas();
    const admin = esAdmin === true;
    const m = motivoDe(motivo, admin);

    return conReintentos(() => enTransaccion(bd, async (conn) => {
      const cita = await bloquearParaModificar(conn, { citaId, admin, beneficiarioIdActor, reglas, config });
      if (!(await citasRepo.marcarCancelada(conn, cita.id, m, actor))) throw E.ESTADO_INVALIDO();
      await historial.registrar(conn, {
        beneficiarioId: cita.beneficiario_id, citaId: cita.id, accion: 'cancelada',
        inicioAnterior: cita.inicio, motivo: m, usuario: actor, esAdmin: admin, auditoria,
      });

      const spaSabia = await notificacionesRepo.huboEnvioAlSpa(conn, cita.id, reloj());
      await notificacionesRepo.descartarPendientes(conn, cita.id);
      const pares = [['calendar_delete', 'google'], ['empleado_cancelacion', 'email']];
      if (spaSabia) pares.push(['spa_cancelada', 'email']); // el spa no recibe cancelaciones de citas que nunca conoció
      await outbox.encolar(conn, cita, pares);
      return { id: cita.id, beneficiario_id: cita.beneficiario_id, inicio: cita.inicio, estado: 'cancelada' };
    }));
  }

  /** Admin (lo exige la ruta): marca asistencia de una cita que ya empezó. El cupo sigue consumido. */
  async function marcarAsistencia({ citaId, asistio, actor, auditoria = {} }) {
    if (!esId(citaId)) throw E.NO_ENCONTRADA();
    exigirActor(actor);
    if (typeof asistio !== 'boolean') throw E.VALIDACION([{ campo: 'asistio', motivo: 'ASISTIO_INVALIDO' }]);
    const { reglas } = herramientas();
    const estado = asistio ? 'asistio' : 'no_asistio';

    return enTransaccion(bd, async (conn) => {
      const cita = await citasRepo.obtenerParaModificar(conn, citaId, null);
      if (!cita) throw E.NO_ENCONTRADA();
      if (cita.estado !== 'agendada') throw E.ESTADO_INVALIDO();
      if (!reglas.puedeMarcarAsistencia({ ahora: reloj(), cita })) throw E.VALIDACION([{ campo: 'citaId', motivo: 'AUN_NO_EMPIEZA' }]);
      if (!(await citasRepo.marcarAsistencia(conn, cita.id, estado, actor))) throw E.ESTADO_INVALIDO();
      await historial.registrar(conn, { beneficiarioId: cita.beneficiario_id, citaId: cita.id, accion: 'asistencia', motivo: estado, usuario: actor, esAdmin: true, auditoria });
      return { id: cita.id, beneficiario_id: cita.beneficiario_id, inicio: cita.inicio, estado };
    });
  }

  /**
   * GET /me: cupo del mes actual y del siguiente y las citas que importan al empleado. Por cada cita dice si
   * todavía puede reprogramarla o cancelarla y hasta cuándo (spec §12, botones deshabilitados con explicación).
   */
  async function resumenDelBeneficiario(beneficiarioId) {
    if (!esId(beneficiarioId)) throw E.NO_BENEFICIARIO();
    const { config, reglas } = herramientas();
    const ahora = reloj();
    const actual = local(ahora).format('YYYY-MM');
    const siguiente = local(ahora).startOf('month').add(1, 'month').format('YYYY-MM');
    const filas = await citasRepo.delBeneficiario(bd.obtener(), beneficiarioId, { periodos: [actual, siguiente], desde: ahora });
    const cupos = {};
    for (const p of [actual, siguiente]) {
      const c = filas.find((f) => f.periodo === p && f.estado !== 'cancelada');
      cupos[p] = c ? { usado: true, citaId: c.id, estado: c.estado } : { usado: false };
    }
    const citas = filas.filter((f) => f.estado === 'agendada').map((f) => ({
      id: f.id, inicio: f.inicio.toISOString(), fin: f.fin.toISOString(), periodo: f.periodo, estado: f.estado,
      puedeModificar: reglas.puedeModificar({ ahora, cita: f, esAdmin: false }),
      modificableHasta: new Date(f.inicio.getTime() - config.anticipacionModificarH * 3600000).toISOString(),
    }));
    return { cupos, citas };
  }

  async function listarAdmin({ periodo, estado, beneficiarioId, pagina, porPagina } = {}) {
    if (periodo !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(periodo))) throw E.VALIDACION([{ campo: 'periodo', motivo: 'PERIODO_INVALIDO' }]);
    if (estado !== undefined && !citasRepo.ESTADOS.includes(estado)) throw E.VALIDACION([{ campo: 'estado', motivo: 'ESTADO_INVALIDO' }]);
    if (beneficiarioId !== undefined && !esId(beneficiarioId)) throw E.VALIDACION([{ campo: 'beneficiarioId', motivo: 'INVALIDO' }]);
    const pg = paginar({ pagina, porPagina });
    const r = await citasRepo.listarAdmin(bd.obtener(), { periodo, estado, beneficiarioId, ...pg });
    return {
      total: r.total, pagina: pg.pagina, porPagina: pg.porPagina,
      items: r.items.map((c) => ({
        id: c.id, inicio: c.inicio.toISOString(), fin: c.fin.toISOString(), periodo: c.periodo, estado: c.estado,
        motivo_cancelacion: c.motivo_cancelacion, creado_por: c.creado_por, actualizado_por: c.actualizado_por,
        beneficiario: { id: c.beneficiario_id, nombre: c.beneficiario_nombre, cargo: c.beneficiario_cargo },
      })),
    };
  }

  return { agendar, reprogramar, cancelar, marcarAsistencia, resumenDelBeneficiario, listarAdmin };
}

module.exports = { crearServicioCitas, mapDuplicado };
