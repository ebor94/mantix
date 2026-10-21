// Lectura y validación de las variables BIGDAY_* (ver src/bigday/bigday.env.example).
const OBLIGATORIAS = ['BIGDAY_DB_HOST', 'BIGDAY_DB_USER', 'BIGDAY_DB_PASSWORD', 'BIGDAY_HASH_SALT'];

const vacia = (v) => v === undefined || String(v).trim() === '';

/**
 * Devuelve { ok: true, config } o { ok: false, faltantes }.
 * Nunca lanza: si falta algo, el módulo responde 503 y Mantix sigue arrancando.
 */
function leerEntorno(env = process.env) {
  const faltantes = OBLIGATORIAS.filter((nombre) => vacia(env[nombre]));
  if (faltantes.length > 0) return { ok: false, faltantes };
  return {
    ok: true,
    config: {
      hashSalt: env.BIGDAY_HASH_SALT,
      db: {
        host: env.BIGDAY_DB_HOST,
        port: parseInt(env.BIGDAY_DB_PORT, 10) || 3306,
        user: env.BIGDAY_DB_USER,
        password: env.BIGDAY_DB_PASSWORD,
        database: vacia(env.BIGDAY_DB_NAME) ? 'serfuweb' : env.BIGDAY_DB_NAME,
      },
    },
  };
}

module.exports = { leerEntorno, OBLIGATORIAS };
