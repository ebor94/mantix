// «¿Hay inscripciones abiertas ahora?»: una sola regla para /estado y para el corte previo a la subida.
// Es una respuesta aproximada (el conteo se guarda 5 s): la verificación autoritativa está en repo.crear.
const { MENSAJE_CUPO } = require('../dominio/evento');
const { MENSAJE_CERRADAS } = require('./inscribir.service');

const VIGENCIA_MS = 5000;

function crearDisponibilidad({ repo, obtenerConfig, ahora = Date.now }) {
  let cache = null; // { total, hasta }

  async function contar() {
    const t = ahora();
    if (cache && t < cache.hasta) return cache.total;
    const total = await repo.contar();
    cache = { total, hasta: t + VIGENCIA_MS };
    return total;
  }

  async function estado() {
    const config = obtenerConfig();
    if (!config.abiertas) return { abiertas: false, mensaje: MENSAJE_CERRADAS };
    if (config.cupoMaximo == null) return { abiertas: true, mensaje: null };
    try {
      if ((await contar()) >= config.cupoMaximo) return { abiertas: false, mensaje: MENSAJE_CUPO };
    } catch (err) {
      // Sin base no se puede contar: se cae a config.abiertas (true aquí); el insert sigue siendo la autoridad.
    }
    return { abiertas: true, mensaje: null };
  }

  return { estado };
}

module.exports = { crearDisponibilidad };
