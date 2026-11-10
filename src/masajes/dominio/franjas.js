// Franjas de la agenda (spec §5.1). Puro: recibe la configuración, no lee variables de entorno.
const { local, deLocal } = require('./tiempo');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function crearFranjas({ franjas, duracionMin }) {
  /** Franjas L-V de la semana que empieza en `fechaLunes` (YYYY-MM-DD), sin los días de `festivos`. */
  function franjasDeSemana(fechaLunes, { festivos }) {
    const lunes = FECHA.test(String(fechaLunes)) ? deLocal(`${fechaLunes}T00:00`) : null;
    if (!lunes || !lunes.isValid() || lunes.format('YYYY-MM-DD') !== fechaLunes || lunes.day() !== 1) {
      throw new Error('LUNES_REQUERIDO');
    }
    const out = [];
    for (let i = 0; i < 5; i++) {
      const fecha = lunes.add(i, 'day').format('YYYY-MM-DD');
      if (festivos.includes(fecha)) continue;
      for (const hhmm of franjas) {
        const ini = deLocal(`${fecha}T${hhmm}`);
        out.push({ inicioLocal: ini.format('YYYY-MM-DDTHH:mm'), inicio: ini.toDate(), fin: ini.add(duracionMin, 'minute').toDate() });
      }
    }
    return out;
  }

  const slotKey = (inicio, n = 1) => `${local(inicio).format('YYYY-MM-DDTHH:mm')}#${n}`;
  const periodoDe = (inicio) => local(inicio).format('YYYY-MM');

  /** Solo un Date válido, en día hábil, exactamente en uno de los inicios configurados. */
  function esFranjaValida(inicio) {
    if (!(inicio instanceof Date) || Number.isNaN(inicio.getTime())) return false;
    const l = local(inicio);
    return l.day() >= 1 && l.day() <= 5 && l.second() === 0 && l.millisecond() === 0 && franjas.includes(l.format('HH:mm'));
  }

  /** Lunes (YYYY-MM-DD, hora Colombia) de la semana a la que pertenece `inicio`. */
  const lunesDe = (inicio) => {
    const l = local(inicio).startOf('day');
    return l.subtract((l.day() + 6) % 7, 'day').format('YYYY-MM-DD');
  };

  return { franjasDeSemana, slotKey, periodoDe, esFranjaValida, lunesDe };
}

module.exports = { crearFranjas };
