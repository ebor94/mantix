// Lectura y validación de las variables del módulo Portería. Nunca lanza: si algo falta, el router
// responde 503 y Mantix sigue arrancando. La conexión reutiliza las DB_* de Mantix (misma base).

const vacia = (v) => v === undefined || v === null || String(v).trim() === '';

const CONEXION = ['DB_HOST', 'DB_USER', 'DB_PASSWORD'];
const PROPIAS = ['PORTERIA_JWT_SECRET', 'LDAP_GROUP_PORTERIA_GUARDA', 'LDAP_GROUP_PORTERIA_ADMIN'];
const OTROS_SECRETOS = ['JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'TRK_JWT_SECRET'];

const faltantesDe = (env, nombres) => nombres.filter((n) => vacia(env[n]));

/** Solo la conexión (la usa también `npm run porteria:migrate`). */
function leerConexion(env = process.env) {
  const faltantes = faltantesDe(env, CONEXION);
  if (faltantes.length > 0) return { ok: false, motivo: `Faltan variables: ${faltantes.join(', ')}` };
  return {
    ok: true,
    db: {
      host: env.DB_HOST,
      port: parseInt(env.DB_PORT, 10) || 3306,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: vacia(env.DB_NAME) ? 'serfuweb' : env.DB_NAME,
    },
  };
}

function leerEntorno(env = process.env) {
  const faltantes = faltantesDe(env, [...CONEXION, ...PROPIAS]);
  if (faltantes.length > 0) return { ok: false, motivo: `Faltan variables: ${faltantes.join(', ')}` };

  const secreto = env.PORTERIA_JWT_SECRET;
  if (OTROS_SECRETOS.some((n) => env[n] === secreto)) {
    return { ok: false, motivo: 'PORTERIA_JWT_SECRET debe ser distinto de JWT_SECRET, IDENTIDAD_JWT_SECRET y TRK_JWT_SECRET' };
  }

  return {
    ok: true,
    advertencia: secreto.length < 32 ? 'PORTERIA_JWT_SECRET tiene menos de 32 caracteres' : null,
    config: {
      jwtSecret: secreto,
      jwtExpires: vacia(env.PORTERIA_JWT_EXPIRES) ? '12h' : env.PORTERIA_JWT_EXPIRES,
      grupos: {
        guarda: env.LDAP_GROUP_PORTERIA_GUARDA,
        admin: env.LDAP_GROUP_PORTERIA_ADMIN,
        adminGeneral: vacia(env.LDAP_GROUP_ADMIN) ? null : env.LDAP_GROUP_ADMIN,
      },
      db: leerConexion(env).db,
    },
  };
}

module.exports = { leerEntorno, leerConexion };
