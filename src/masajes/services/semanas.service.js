// Administración de semanas habilitadas y bloqueos (Tarea 10, spec §5.2). Solo admin (lo exige la ruta).
const { E } = require('../utils/MasajesError');
const { enTransaccion, conReintentos } = require('../utils/transaccion');
const { limpiar } = require('../utils/texto');
const { crearFranjas } = require('../dominio/franjas');
const { festivosEntre } = require('../dominio/festivos');
const { deLocal } = require('../dominio/tiempo');
const semanasRepo = require('../repositorios/semanas');
const bloqueosRepo = require('../repositorios/bloqueos');
const citasRepo = require('../repositorios/citas');

const MOTIVOS_BLOQUEO = Object.freeze(['festivo', 'spa', 'otro']);
const TRANSICIONES = Object.freeze({ publicar: ['borrador', 'publicada'], cerrar: ['publicada', 'cerrada'] });
const MAX_TEXTO = 255;

const invalido = (campo, motivo) => E.VALIDACION([{ campo, motivo }]);
const esId = (v) => Number.isInteger(v) && v > 0;
const comoFecha = (v) => (v instanceof Date ? new Date(v.getTime()) : new Date(Number.NaN));
const exigirActor = (actor) => { if (typeof actor !== 'string' || actor.trim() === '') throw new Error('ACTOR_REQUERIDO'); };

function textoOpcional(v, campo, motivo) {
  if (v === undefined || v === null) return null;
  const t = limpiar(v);
  if (t.length > MAX_TEXTO) throw invalido(campo, motivo);
  return t || null;
}

/** [lunes 00:00, sábado 00:00) en hora Colombia. */
function limitesDeSemana(fechaLunes) {
  const lunes = deLocal(`${fechaLunes}T00:00`);
  return { inicio: lunes.toDate(), fin: lunes.add(5, 'day').toDate() };
}

function crearServicioSemanas({ bd, obtenerConfig }) {
  const franjasDe = () => crearFranjas(obtenerConfig());

  async function crear({ fechaInicio, capacidad = 1, notas, actor }) {
    exigirActor(actor);
    const franjas = franjasDe();
    try {
      franjas.franjasDeSemana(fechaInicio, { festivos: [] });
    } catch {
      throw invalido('fechaInicio', 'LUNES_REQUERIDO');
    }
    if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > 20) throw invalido('capacidad', 'CAPACIDAD_INVALIDA');
    const n = textoOpcional(notas, 'notas', 'NOTAS_MUY_LARGAS');
    const { inicio, fin } = limitesDeSemana(fechaInicio);
    const viernes = deLocal(`${fechaInicio}T00:00`).add(4, 'day').format('YYYY-MM-DD');
    const festivos = festivosEntre(fechaInicio, viernes);

    try {
      return await enTransaccion(bd, async (conn) => {
        const id = await semanasRepo.insertar(conn, { fechaInicio, capacidad, notas: n, actor });
        // Los festivos quedan como bloqueos visibles para el admin (además, la disponibilidad los excluye siempre).
        for (const f of festivos) {
          const dia = deLocal(`${f}T00:00`);
          await bloqueosRepo.insertar(conn, { semanaId: id, inicio: dia.toDate(), fin: dia.add(1, 'day').toDate(), motivo: 'festivo', detalle: 'Festivo nacional', actor });
        }
        return { id, fecha_inicio: fechaInicio, estado: 'borrador', capacidad, notas: n, festivos, inicio, fin };
      });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY' && String(err.sqlMessage || '').includes('uq_msj_semanas_fecha_inicio')) throw E.SEMANA_DUPLICADA();
      throw err;
    }
  }

  async function transicion(accion, { semanaId, actor }) {
    exigirActor(actor);
    if (!esId(semanaId)) throw E.NO_ENCONTRADA();
    const [desde, hacia] = TRANSICIONES[accion];
    return enTransaccion(bd, async (conn) => {
      const semana = await semanasRepo.obtenerParaModificar(conn, semanaId);
      if (!semana) throw E.NO_ENCONTRADA();
      if (semana.estado !== desde || !(await semanasRepo.cambiarEstado(conn, semanaId, desde, hacia))) throw E.ESTADO_INVALIDO();
      return { ...semana, estado: hacia };
    });
  }

  /**
   * Bloquea un rango de la semana. Toma la semana FOR UPDATE: espera a que terminen las reservas en curso
   * (que la toman FOR SHARE) y después las ve; si hay una cita activa en el rango → SLOT_CON_CITA.
   */
  async function agregarBloqueo({ semanaId, inicio, fin, motivo, detalle, actor }) {
    exigirActor(actor);
    if (!esId(semanaId)) throw E.NO_ENCONTRADA();
    const ini = comoFecha(inicio);
    const f = comoFecha(fin);
    if (Number.isNaN(ini.getTime()) || Number.isNaN(f.getTime()) || f <= ini) throw invalido('rango', 'RANGO_INVALIDO');
    if (!MOTIVOS_BLOQUEO.includes(motivo)) throw invalido('motivo', 'MOTIVO_INVALIDO');
    const d = textoOpcional(detalle, 'detalle', 'DETALLE_MUY_LARGO');

    return conReintentos(() => enTransaccion(bd, async (conn) => {
      const semana = await semanasRepo.obtenerParaModificar(conn, semanaId);
      if (!semana) throw E.NO_ENCONTRADA();
      const lim = limitesDeSemana(semana.fecha_inicio);
      if (ini < lim.inicio || f > lim.fin) throw invalido('rango', 'FUERA_DE_LA_SEMANA');
      if (await citasRepo.hayActivaSolapada(conn, semanaId, ini, f)) throw E.SLOT_CON_CITA();
      const id = await bloqueosRepo.insertar(conn, { semanaId, inicio: ini, fin: f, motivo, detalle: d, actor });
      return { id, semana_id: semanaId, inicio: ini, fin: f, motivo, detalle: d };
    }));
  }

  async function eliminarBloqueo({ semanaId, bloqueoId, actor }) {
    exigirActor(actor);
    if (!esId(semanaId) || !esId(bloqueoId)) throw E.NO_ENCONTRADA();
    return enTransaccion(bd, async (conn) => {
      if (!(await semanasRepo.obtenerParaModificar(conn, semanaId))) throw E.NO_ENCONTRADA();
      if (!(await bloqueosRepo.eliminar(conn, bloqueoId, semanaId))) throw E.NO_ENCONTRADA();
      return { id: bloqueoId, eliminado: true };
    });
  }

  /** Ocupación de la semana: franjas sin festivos, cuántas bloqueadas, cupos totales, ocupados y libres. */
  async function resumen({ semanaId }) {
    if (!esId(semanaId)) throw E.NO_ENCONTRADA();
    const ejecutor = bd.obtener();
    const semana = await semanasRepo.obtener(ejecutor, semanaId);
    if (!semana) throw E.NO_ENCONTRADA();
    const lista = franjasDe().franjasDeSemana(semana.fecha_inicio, { festivos: festivosEntre(semana.fecha_inicio, limitesDeSemana(semana.fecha_inicio).fin.toISOString().slice(0, 10)) });
    const bloqueos = await bloqueosRepo.listarDeSemana(ejecutor, semanaId);
    const bloqueadas = lista.filter((x) => bloqueos.some((b) => b.inicio < x.fin && b.fin > x.inicio)).length;
    const ocupadas = await citasRepo.contarActivasDeSemana(ejecutor, semanaId);
    const capacidadTotal = (lista.length - bloqueadas) * semana.capacidad;
    return { franjas: lista.length, bloqueadas, capacidadTotal, ocupadas, libres: Math.max(0, capacidadTotal - ocupadas) };
  }

  return {
    crear, agregarBloqueo, eliminarBloqueo, resumen,
    publicar: (p) => transicion('publicar', p),
    cerrar: (p) => transicion('cerrar', p),
  };
}

module.exports = { crearServicioSemanas, MOTIVOS_BLOQUEO };
