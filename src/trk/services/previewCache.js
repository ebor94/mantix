// Vista previa de importación en memoria del proceso (PM2 fork = una instancia). TTL 30 min.
const TTL_MS = 30 * 60 * 1000;
const cache = new Map();

function purgar(ahora = Date.now()) {
  for (const [token, entrada] of cache) if (entrada.expira <= ahora) cache.delete(token);
}

function guardar(analisis, meta) {
  purgar();
  cache.set(meta.sha256, { analisis, meta, expira: Date.now() + TTL_MS });
  return meta.sha256;
}

function obtener(token) {
  const entrada = cache.get(token);
  if (!entrada) return null;
  if (entrada.expira <= Date.now()) {
    cache.delete(token);
    return null;
  }
  return entrada;
}

const borrar = (token) => cache.delete(token);

module.exports = { guardar, obtener, borrar, TTL_MS };
