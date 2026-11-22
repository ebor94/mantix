// Variables del módulo Horno INCOL. Nunca lanza: si algo falta, el router responde 503 y Mantix arranca igual.
// La base es la del servidor central del horno (192.9.17.30), no la de Mantix: no hay respaldo en DB_*.
const vacia = (v) => v === undefined || v === null || String(v).trim() === '';
const recortada = (v) => (vacia(v) ? undefined : String(v).trim());

const OBLIGATORIAS = [
  'HORNO_DB_HOST', 'HORNO_DB_USER', 'HORNO_DB_PASSWORD', 'HORNO_JWT_SECRET',
  'LDAP_URL', 'LDAP_BASE_DN', 'LDAP_BIND_USER', 'LDAP_BIND_PASS',
];
// Un token de otro módulo no debe servir aquí (ni al revés): cada módulo firma con su propio secreto.
const OTROS_SECRETOS = [
  'JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'IDENTIDAD_JWT_REFRESH_SECRET', 'TRK_JWT_SECRET', 'PORTERIA_JWT_SECRET',
  'SV_JWT_SECRET', 'SV_JWT_REFRESH_SECRET', 'VOTACION_JWT_SECRET', 'HASH_SECRET', 'MSJ_JWT_SECRET',
];
const DURACION = /^([1-9]\d*)(s|m|h|d)?$/;

function leerEntorno(env = process.env) {
  const faltantes = OBLIGATORIAS.filter((n) => vacia(env[n]));
  if (faltantes.length > 0) return { ok: false, motivo: `Faltan variables: ${faltantes.join(', ')}` };

  const secreto = env.HORNO_JWT_SECRET;
  if (OTROS_SECRETOS.some((n) => env[n] === secreto)) {
    return { ok: false, motivo: 'HORNO_JWT_SECRET debe ser distinto de los secretos de los otros módulos' };
  }

  const expira = recortada(env.HORNO_JWT_EXPIRES) ?? '8h';
  if (!DURACION.test(expira)) return { ok: false, motivo: 'HORNO_JWT_EXPIRES inválido (usa p. ej. 8h)' };

  const puerto = vacia(env.HORNO_DB_PORT) ? 3306 : Number(env.HORNO_DB_PORT);
  if (!Number.isInteger(puerto) || puerto <= 0 || puerto > 65535) return { ok: false, motivo: 'HORNO_DB_PORT inválido' };

  return {
    ok: true,
    advertencia: secreto.length < 32 ? 'HORNO_JWT_SECRET tiene menos de 32 caracteres' : null,
    config: {
      jwtSecret: secreto,
      jwtExpires: /^\d+$/.test(expira) ? Number(expira) : expira, // un texto sin unidad lo leería jsonwebtoken como ms
      grupo: recortada(env.HORNO_GRUPO_AD) ?? 'INCOL_APP',
      db: {
        host: String(env.HORNO_DB_HOST).trim(),
        port: puerto,
        user: env.HORNO_DB_USER,
        password: env.HORNO_DB_PASSWORD,
        database: recortada(env.HORNO_DB_NAME) ?? 'horno',
      },
    },
  };
}

module.exports = { leerEntorno };
