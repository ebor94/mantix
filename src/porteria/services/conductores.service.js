// src/porteria/services/conductores.service.js
// Conductores de vehículos propios: miembros de los grupos del AD que conducen (los mismos que usa H360).
// Caché en memoria; si el AD falla nunca se bloquea la portería (el front ofrece "otro" con nombre libre).
const DIEZ_MINUTOS = 10 * 60 * 1000;

function crearConductores({ listarMiembrosGrupo, grupos, ttlMs = DIEZ_MINUTOS, ahora = Date.now, log }) {
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

  async function listar() {
    if (cache && ahora() < cache.vence) return cache.lista;
    const { lista, completo } = await leerDelDirectorio();
    if (completo) {
      cache = { lista, vence: ahora() + ttlMs };
      return lista;
    }
    return cache ? cache.lista : lista;
  }

  return {
    listar,
    async existe(usuario) {
      return (await listar()).some((c) => c.usuario === usuario);
    },
  };
}

module.exports = { crearConductores };
