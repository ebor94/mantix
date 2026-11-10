// Citas: agendar (Tarea 8). Reprogramar, cancelar y asistencia: Tareas 9 y 10.
const { E } = require('../utils/MasajesError');
const { enTransaccion, conReintentos } = require('../utils/transaccion');
const { crearFranjas } = require('../dominio/franjas');
const { crearReglas } = require('../dominio/reglas');
const citasRepo = require('../repositorios/citas');
const beneficiariosRepo = require('../repositorios/beneficiarios');
const historial = require('../repositorios/historial');

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

function crearServicioCitas({ bd, obtenerConfig, disponibilidad, outbox, reloj = () => new Date() }) {
  const herramientas = () => {
    const config = obtenerConfig();
    return { config, franjas: crearFranjas(config), reglas: crearReglas(config) };
  };

  /**
   * Inserta con el primer índice libre de la franja (#1..#capacidad). En InnoDB un ER_DUP_ENTRY solo deshace
   * esa sentencia, no la transacción: se prueba el siguiente índice sin consultar antes un "libre" que podría
   * quedar viejo. El cupo del mes (cupo_key) no se reintenta.
   */
  async function insertarConIndice(conn, d, capacidad, franjas) {
    for (let n = 1; n <= capacidad; n++) {
      try {
        return await citasRepo.insertarActiva(conn, { ...d, slotKey: franjas.slotKey(d.inicio, n), cupoKey: `${d.beneficiarioId}:${d.periodo}` });
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
    if (typeof actor !== 'string' || actor.trim() === '') throw new Error('ACTOR_REQUERIDO');
    const { config, franjas, reglas } = herramientas();
    const admin = esAdmin === true;
    const ini = comoFecha(inicio);
    if (!franjas.esFranjaValida(ini)) throw E.FUERA_DE_VENTANA();
    if (!reglas.puedeAgendar({ ahora: reloj(), inicio: ini, esAdmin: admin })) throw E.ANTICIPACION_INSUFICIENTE(config.anticipacionAgendarH);
    if (!Number.isInteger(beneficiarioId) || beneficiarioId <= 0) throw E.VALIDACION([{ campo: 'beneficiarioId', motivo: 'INVALIDO' }]);

    const periodo = franjas.periodoDe(ini);
    const fin = new Date(ini.getTime() + config.duracionMin * 60000);

    return conReintentos(() => enTransaccion(bd, async (conn) => {
      if (!(await beneficiariosRepo.estaActivoCompartido(conn, beneficiarioId))) {
        throw E.VALIDACION([{ campo: 'beneficiarioId', motivo: 'INACTIVO_O_INEXISTENTE' }]);
      }
      const hab = await disponibilidad.esFranjaHabilitada(conn, ini);
      if (!hab) throw E.FUERA_DE_VENTANA();
      const id = await insertarConIndice(conn, { beneficiarioId, semanaId: hab.semanaId, inicio: ini, fin, periodo, actor }, hab.capacidad, franjas);
      await historial.registrar(conn, { beneficiarioId, citaId: id, accion: 'creada', inicioNuevo: ini, usuario: actor, esAdmin: admin, auditoria });
      const cita = { id, beneficiario_id: beneficiarioId, semana_id: hab.semanaId, inicio: ini, fin, periodo, estado: 'agendada' };
      await outbox.encolar(conn, cita, [['calendar_upsert', 'google'], ['spa_nueva', 'email'], ['empleado_confirmacion', 'email']]);
      return cita;
    }));
  }

  return { agendar };
}

module.exports = { crearServicioCitas, mapDuplicado };
