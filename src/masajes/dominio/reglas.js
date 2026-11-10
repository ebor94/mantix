// Reglas de negocio de la agenda (spec §5.3–§5.6). Puro: la anticipación se inyecta y `ahora` lo pasa el
// servicio desde su reloj (nunca la petición). Todo falla cerrado: un dato inválido nunca concede permiso.
const H = 3600000;

const ESTADOS_QUE_CONSUMEN_CUPO = Object.freeze(['agendada', 'asistio', 'no_asistio']);
// Única transición permitida: desde 'agendada'. Una cita cancelada o atendida es definitiva (spec §17.4).
const TRANSICIONES = Object.freeze({ agendada: Object.freeze(['cancelada', 'asistio', 'no_asistio']) });

const esFecha = (d) => d instanceof Date && !Number.isNaN(d.getTime());
const esHoras = (n) => Number.isInteger(n) && n >= 0;

const estadoConsumeCupo = (estado) => ESTADOS_QUE_CONSUMEN_CUPO.includes(estado);
const puedeTransicionar = (desde, hacia) => (TRANSICIONES[desde] || []).includes(hacia);

function crearReglas({ anticipacionAgendarH, anticipacionModificarH } = {}) {
  if (!esHoras(anticipacionAgendarH) || !esHoras(anticipacionModificarH)) throw new Error('CONFIG_REGLAS');

  /** Futuro estricto siempre; además, para el empleado, la anticipación mínima. Solo `true` es admin. */
  function aTiempo({ ahora, inicio, esAdmin, horas }) {
    if (!esFecha(ahora) || !esFecha(inicio)) return false;
    const falta = inicio.getTime() - ahora.getTime();
    if (falta <= 0) return false;
    return esAdmin === true || falta >= horas * H;
  }

  const puedeAgendar = ({ ahora, inicio, esAdmin }) => aTiempo({ ahora, inicio, esAdmin, horas: anticipacionAgendarH });

  function puedeModificar({ ahora, cita, esAdmin }) {
    if (!cita || cita.estado !== 'agendada') return false;
    return aTiempo({ ahora, inicio: cita.inicio, esAdmin, horas: anticipacionModificarH });
  }

  /** Asistencia: solo citas agendadas que ya empezaron (la marca el admin; el cupo sigue consumido). */
  function puedeMarcarAsistencia({ ahora, cita }) {
    if (!cita || cita.estado !== 'agendada' || !esFecha(ahora) || !esFecha(cita.inicio)) return false;
    return cita.inicio.getTime() <= ahora.getTime();
  }

  return { puedeAgendar, puedeModificar, puedeMarcarAsistencia };
}

module.exports = { crearReglas, estadoConsumeCupo, puedeTransicionar, ESTADOS_QUE_CONSUMEN_CUPO };
