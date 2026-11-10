/**
 * Disponibilidad de la agenda (spec §8 GET /disponibilidad). Puro: recibe lo que el servicio leyó de la BD.
 *
 * Estado de cada franja, en orden de prioridad:
 *   bloqueada (bloqueo que se solapa) > pasada > ocupada (citas activas >= capacidad) > libre
 *   - Empleado: "pasada" = ya no se puede agendar (menos de la anticipación). Solo ve semanas publicadas y solo
 *     { inicio, estado }: nunca de quién es una cita (spec §17.5).
 *   - Admin: "pasada" = ya empezó. Ve todas las semanas, la capacidad y las citas con su beneficiario.
 * Los festivos se excluyen aquí aunque también estén como bloqueos (defensa en profundidad).
 */
const { E } = require('../utils/MasajesError');
const { crearReglas } = require('./reglas');

const MAX_DIAS = 31;
const DIA_MS = 86400000;

function fechaValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10) === s;
}

const errorRango = (motivo) => E.VALIDACION([{ campo: 'rango', motivo }]);

/** `desde`/`hasta`: YYYY-MM-DD (hora Colombia), ambos incluidos, máximo 31 días. */
function validarRango(desde, hasta) {
  if (!fechaValida(desde) || !fechaValida(hasta)) throw errorRango('FECHA_INVALIDA');
  if (hasta < desde) throw errorRango('RANGO_INVERTIDO');
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS + 1;
  if (dias > MAX_DIAS) throw errorRango('RANGO_MUY_LARGO');
  return { desde, hasta };
}

const seSolapan = (a, b) => a.inicio.getTime() < b.fin.getTime() && a.fin.getTime() > b.inicio.getTime();

function armarDisponibilidad({ franjas, semanas, festivos, bloqueos, citas, ahora, anticipacionH, esAdmin, desde, hasta }) {
  const admin = esAdmin === true;
  const reglas = crearReglas({ anticipacionAgendarH: anticipacionH, anticipacionModificarH: anticipacionH });
  const visibles = admin ? semanas : semanas.filter((s) => s.estado === 'publicada');

  const salida = [];
  for (const semana of visibles) {
    const bloqueosSemana = bloqueos.filter((b) => b.semana_id === semana.id);
    for (const f of franjas.franjasDeSemana(semana.fecha_inicio, { festivos })) {
      const fecha = f.inicioLocal.slice(0, 10);
      if (fecha < desde || fecha > hasta) continue;

      const enFranja = citas.filter((c) => c.inicio.getTime() === f.inicio.getTime());
      let estado = 'libre';
      if (bloqueosSemana.some((b) => seSolapan(f, b))) estado = 'bloqueada';
      else if (!reglas.puedeAgendar({ ahora, inicio: f.inicio, esAdmin: admin })) estado = 'pasada';
      else if (enFranja.length >= semana.capacidad) estado = 'ocupada';

      if (!admin) {
        salida.push({ inicio: f.inicio.toISOString(), estado }); // lista blanca: nada más sale al empleado
      } else {
        salida.push({
          inicio: f.inicio.toISOString(),
          estado,
          semana: { id: semana.id, estado: semana.estado },
          capacidad: semana.capacidad,
          citas: enFranja.map((c) => ({ id: c.id, estado: c.estado, beneficiario: { id: c.beneficiario_id, nombre: c.beneficiario_nombre } })),
        });
      }
    }
  }
  salida.sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
  return { desde, hasta, franjas: salida };
}

module.exports = { armarDisponibilidad, validarRango, MAX_DIAS };
