// src/porteria/services/conductores.service.js
// Conductores de vehículos propios: miembros de los grupos del AD que conducen (los mismos que usa H360).
// Caché en memoria; si el AD falla nunca se bloquea la portería (el front ofrece "otro" con nombre libre).
const DIEZ_MINUTOS = 10 * 60 * 1000;
const UN_MINUTO = 60 * 1000;

function crearConductores({ listarMiembrosGrupo, grupos, ttlMs = DIEZ_MINUTOS, ahora = Date.now, log = console, reintentoMs = UN_MINUTO }) {
  let cache = null; // { lista, vence }

  async function leerDelDirectorio() {
    const porUsuario = new Map();
    let completo = true;
    for (const grupo of grupos().filter(Boolean)) {
      try {
        for (const m of await listarMiembrosGrupo(grupo)) {
          // Si alguien está en dos grupos queda con el primero.
          if (!porUsuario.has(m.usuario)) porUsuario.set(m.usuario, { usuario: m.usuario, nombre: m.nombre });
        }
      } catch {
        completo = false;
        log.warn('porteria: no se pudo leer un grupo de conductores', { grupo });
      }
    }
    const lista = [...porUsuario.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { lista, completo };
  }

  // Una sola lectura en vuelo, y tras una incompleta no se vuelve a molestar al AD hasta `reintentoMs`:
  // con el AD caído cada petición esperaría el timeout completo.
  let enVuelo = null;
  let noReintentarHasta = 0;
  let ultima = null; // lo último que se obtuvo aunque fuera parcial

  async function refrescar() {
    const { lista, completo } = await leerDelDirectorio();
    if (completo) {
      cache = { lista, vence: ahora() + ttlMs };
      noReintentarHasta = 0;
    } else {
      noReintentarHasta = ahora() + reintentoMs;
    }
    // Una lectura parcial no pisa una buena anterior.
    ultima = completo || !cache ? lista : cache.lista;
    return ultima;
  }

  async function listar() {
    const t = ahora();
    let lista;
    if (cache && t < cache.vence) lista = cache.lista;
    else if (t < noReintentarHasta) lista = cache ? cache.lista : ultima;
    else {
      if (!enVuelo) enVuelo = refrescar().finally(() => { enVuelo = null; });
      lista = await enVuelo;
    }
    return lista.map((c) => ({ ...c }));
  }

  return {
    listar,
    async existe(usuario) {
      return (await listar()).some((c) => c.usuario === usuario);
    },
    /**
     * { conductor, listaCompleta }. listaCompleta es false si el AD nunca respondió del todo: quien llama
     * no debe tratar "no está" como definitivo (la portería no se bloquea por el AD).
     */
    async buscar(usuario) {
      const lista = await listar();
      return { conductor: lista.find((c) => c.usuario === usuario) || null, listaCompleta: cache !== null };
    },
  };
}

module.exports = { crearConductores };
