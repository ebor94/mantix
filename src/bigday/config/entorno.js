// Lectura y validación de las variables del módulo (ver src/bigday/bigday.env.example).
// La conexión a la base reutiliza las DB_* de Mantix (misma base `serfuweb`); cada BIGDAY_DB_* explícita gana.

const vacia = (v) => v === undefined || String(v).trim() === '';

/** Primer valor no vacío entre las variables indicadas (en orden de prioridad). */
const primera = (env, ...nombres) => {
  const nombre = nombres.find((n) => !vacia(env[n]));
  return nombre === undefined ? undefined : env[nombre];
};

// Variables de conexión obligatorias: [propia, respaldo de Mantix].
const CONEXION = [
  ['BIGDAY_DB_HOST', 'DB_HOST'],
  ['BIGDAY_DB_USER', 'DB_USER'],
  ['BIGDAY_DB_PASSWORD', 'DB_PASSWORD'],
];
// La sal no tiene respaldo.
const OBLIGATORIAS = [...CONEXION, ['BIGDAY_HASH_SALT']];

const nombrar = (env, lista) => lista
  .filter((nombres) => primera(env, ...nombres) === undefined)
  .map((nombres) => nombres.join(' o '));

/**
 * Solo la conexión a la base (la usa también `npm run bigday:migrate`, que no necesita la sal).
 * Devuelve { ok: true, db } o { ok: false, faltantes }. Nunca lanza.
 */
function leerConexion(env = process.env) {
  const faltantes = nombrar(env, CONEXION);
  if (faltantes.length > 0) return { ok: false, faltantes };
  return {
    ok: true,
    db: {
      host: primera(env, 'BIGDAY_DB_HOST', 'DB_HOST'),
      port: parseInt(primera(env, 'BIGDAY_DB_PORT', 'DB_PORT'), 10) || 3306,
      user: primera(env, 'BIGDAY_DB_USER', 'DB_USER'),
      password: primera(env, 'BIGDAY_DB_PASSWORD', 'DB_PASSWORD'),
      database: primera(env, 'BIGDAY_DB_NAME', 'DB_NAME') ?? 'serfuweb',
    },
  };
}

/**
 * Devuelve { ok: true, config } o { ok: false, faltantes }.
 * `faltantes` nombra las dos opciones ("BIGDAY_DB_HOST o DB_HOST"); solo se usa en el log, nunca en el HTTP 503.
 * Nunca lanza: si falta algo, el módulo responde 503 y Mantix sigue arrancando.
 */
function leerEntorno(env = process.env) {
  const faltantes = nombrar(env, OBLIGATORIAS);
  if (faltantes.length > 0) return { ok: false, faltantes };
  return {
    ok: true,
    config: {
      hashSalt: env.BIGDAY_HASH_SALT,
      // Opcional: sin él solo las rutas de resultados responden 503 (el POST y el health siguen).
      resultsToken: vacia(env.BIGDAY_RESULTS_TOKEN) ? null : String(env.BIGDAY_RESULTS_TOKEN).trim(),
      db: leerConexion(env).db,
    },
  };
}

module.exports = { leerEntorno, leerConexion, OBLIGATORIAS };
