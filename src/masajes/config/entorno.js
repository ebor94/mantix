// Variables del módulo Masajes. Nunca lanza: si algo falta, el router responde 503 y Mantix sigue arrancando.
const vacia = (v) => v === undefined || v === null || String(v).trim() === '';
const recortada = (v) => (vacia(v) ? undefined : String(v).trim());

const CONEXION = ['DB_HOST', 'DB_USER', 'DB_PASSWORD'];
const LDAP = ['LDAP_URL', 'LDAP_BASE_DN', 'LDAP_BIND_USER', 'LDAP_BIND_PASS'];
// Todos los secretos de firma del repositorio: si se repitiera uno, un token de Masajes (que tiene cualquier
// beneficiario) podría pasar el jwt.verify de otro módulo que no revise sus claims.
const OTROS_SECRETOS = ['JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'IDENTIDAD_JWT_REFRESH_SECRET', 'TRK_JWT_SECRET', 'PORTERIA_JWT_SECRET',
  'SV_JWT_SECRET', 'SV_JWT_REFRESH_SECRET', 'VOTACION_JWT_SECRET', 'HASH_SECRET'];
const FRANJAS_DEFECTO = '08:00,09:00,10:00,14:00,15:00,16:00';

function entero(env, nombre, porDefecto, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const v = recortada(env[nombre]);
  if (v === undefined) return { ok: true, valor: porDefecto };
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false, motivo: `${nombre} inválido: "${v}"` };
  return { ok: true, valor: n };
}

/**
 * Solo la conexión (la usan también los scripts de migración e importación).
 * `paraMigrar`: las migraciones crean y alteran tablas, así que van siempre con DB_USER; el usuario de
 * mínimo privilegio MSJ_DB_USER (spec §17.8) no tiene DDL.
 */
function leerConexion(env = process.env, { paraMigrar = false } = {}) {
  const faltan = CONEXION.filter((n) => vacia(env[n]));
  if (faltan.length) return { ok: false, motivo: `Faltan variables: ${faltan.join(', ')}` };
  // Usuario de mínimo privilegio para el módulo; si no está, se usa el de Mantix con advertencia.
  const propio = !paraMigrar && !vacia(env.MSJ_DB_USER) && !vacia(env.MSJ_DB_PASSWORD);
  return {
    ok: true,
    advertencia: propio || paraMigrar ? null : 'Masajes usa DB_USER de Mantix: define MSJ_DB_USER/MSJ_DB_PASSWORD con mínimo privilegio',
    db: {
      host: env.DB_HOST,
      port: parseInt(env.DB_PORT, 10) || 3306,
      user: propio ? env.MSJ_DB_USER : env.DB_USER,
      password: propio ? env.MSJ_DB_PASSWORD : env.DB_PASSWORD,
      database: vacia(env.DB_NAME) ? 'serfuweb' : env.DB_NAME,
    },
  };
}

function leerEntorno(env = process.env) {
  const conexion = leerConexion(env);
  if (!conexion.ok) return conexion;

  // El login valida contra el AD (ldap.service de H360). Sin estas variables, ldapjs lanza en cada intento:
  // mejor dejar el módulo en 503 desde el arranque, con el motivo en el log.
  const faltanLdap = LDAP.filter((n) => vacia(env[n]));
  if (faltanLdap.length) return { ok: false, motivo: `Faltan variables del directorio activo: ${faltanLdap.join(', ')}` };
  if (!/^ldaps?:\/\//i.test(String(env.LDAP_URL).trim())) return { ok: false, motivo: 'LDAP_URL debe empezar por ldap:// o ldaps://' };

  const secreto = recortada(env.MASAJES_JWT_SECRET);
  if (!secreto) return { ok: false, motivo: 'Falta MASAJES_JWT_SECRET' };
  if (secreto.length < 32) return { ok: false, motivo: 'MASAJES_JWT_SECRET debe tener al menos 32 caracteres' };
  if (OTROS_SECRETOS.some((k) => recortada(env[k]) === secreto)) {
    return { ok: false, motivo: `MASAJES_JWT_SECRET debe ser distinto de ${OTROS_SECRETOS.join(', ')}` };
  }
  const jwtExpires = recortada(env.MASAJES_JWT_EXPIRES) ?? '8h';
  if (!/^([1-9]\d*)(m|h)$/.test(jwtExpires)) return { ok: false, motivo: 'MASAJES_JWT_EXPIRES inválido (usa p. ej. 8h)' };
  // El rol admin sale del AD solo al iniciar sesión: con una vigencia corta, quitar a alguien del grupo surte efecto antes.
  const jwtExpiresAdmin = recortada(env.MASAJES_JWT_EXPIRES_ADMIN) ?? '2h';
  if (!/^([1-9]\d*)(m|h)$/.test(jwtExpiresAdmin)) return { ok: false, motivo: 'MASAJES_JWT_EXPIRES_ADMIN inválido (usa p. ej. 2h)' };

  // DN completo; se compara exacto y case-insensitive, nunca por CN ni por subcadena (spec §9.2).
  const grupoAdminDn = recortada(env.MSJ_GRUPO_ADMIN_DN);
  if (!grupoAdminDn || !/^cn=[^,]+,(ou|cn|dc)=/i.test(grupoAdminDn)) {
    return { ok: false, motivo: 'MSJ_GRUPO_ADMIN_DN debe ser un DN completo (CN=…,OU=…,DC=…)' };
  }

  const franjas = (recortada(env.MSJ_FRANJAS) ?? FRANJAS_DEFECTO).split(',').map((s) => s.trim());
  if (!franjas.every((f) => /^([01]\d|2[0-3]):00$/.test(f))) return { ok: false, motivo: 'MSJ_FRANJAS inválido (usa HH:00 separados por coma)' };

  const nums = {
    duracionMin: entero(env, 'MSJ_DURACION_MIN', 60, { min: 15, max: 240 }),
    anticipacionAgendarH: entero(env, 'MSJ_ANTICIPACION_AGENDAR_H', 24, { max: 720 }),
    anticipacionModificarH: entero(env, 'MSJ_ANTICIPACION_MODIFICAR_H', 24, { max: 720 }),
    smsTopeDiario: entero(env, 'MSJ_SMS_TOPE_DIARIO', 100, { min: 1, max: 10000 }),
    cambiosDiarios: entero(env, 'MSJ_CAMBIOS_DIARIOS', 4, { min: 1, max: 50 }),
  };
  const appUrl = recortada(env.MSJ_APP_URL) ?? 'https://mantix.losolivos.co/masajes';
  if (!/^https:\/\/[^\s"'<>]+$/.test(appUrl)) return { ok: false, motivo: 'MSJ_APP_URL debe ser una URL https' };

  const malo = Object.values(nums).find((r) => !r.ok);
  if (malo) return { ok: false, motivo: malo.motivo };
  const valores = Object.fromEntries(Object.entries(nums).map(([k, r]) => [k, r.valor]));

  return {
    ok: true,
    advertencia: conexion.advertencia,
    config: {
      tz: 'America/Bogota',
      franjas,
      ...valores,
      jwtSecret: secreto,
      jwtExpires,
      jwtExpiresAdmin,
      grupoAdminDn: grupoAdminDn.toLowerCase(),
      dominiosAutovinculo: (recortada(env.MSJ_DOMINIOS_AUTOVINCULO) ?? 'losolivos.co')
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      appUrl,
      outboxMaxIntentos: 5,
      db: conexion.db,
    },
  };
}

/** Integraciones externas: las exige el worker del outbox, no el router (Tarea 13).
 * Correo y calendario van por n8n si MSJ_N8N_WEBHOOK_URL está definida; si no, directo (SMTP de Mantix + Google). */
const UN_CORREO = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
function leerIntegraciones(env = process.env) {
  const conN8n = !vacia(env.MSJ_N8N_WEBHOOK_URL);
  const req = ['MSJ_SPA_EMAIL', 'MSJ_HABLAME_URL', 'MSJ_HABLAME_API_KEY',
    ...(conN8n ? ['MSJ_N8N_SECRETO'] : ['MSJ_GOOGLE_CALENDAR_ID', 'MSJ_GOOGLE_IMPERSONAR', 'MSJ_GOOGLE_SA_JSON'])];
  const faltan = req.filter((n) => vacia(env[n]));
  if (faltan.length) return { ok: false, motivo: `Faltan variables: ${faltan.join(', ')}` };
  if (!/^https:\/\//.test(env.MSJ_HABLAME_URL)) return { ok: false, motivo: 'MSJ_HABLAME_URL debe ser https' };
  if (!UN_CORREO.test(env.MSJ_SPA_EMAIL.trim())) return { ok: false, motivo: 'MSJ_SPA_EMAIL debe ser un solo correo válido' };
  if (conN8n) {
    if (!/^https?:\/\/[^\s]+$/.test(env.MSJ_N8N_WEBHOOK_URL.trim())) return { ok: false, motivo: 'MSJ_N8N_WEBHOOK_URL debe ser una URL http(s)' };
    if (env.MSJ_N8N_SECRETO.trim().length < 32) return { ok: false, motivo: 'MSJ_N8N_SECRETO debe tener al menos 32 caracteres' };
  }
  return {
    ok: true,
    config: {
      spa: { nombre: recortada(env.MSJ_SPA_NOMBRE) ?? 'Spa', email: env.MSJ_SPA_EMAIL.trim(), direccion: recortada(env.MSJ_SPA_DIRECCION) ?? '', enEvento: env.MSJ_SPA_EN_EVENTO === 'true' },
      n8n: conN8n ? { url: env.MSJ_N8N_WEBHOOK_URL.trim(), secreto: env.MSJ_N8N_SECRETO.trim() } : null,
      google: conN8n ? null : { calendarId: env.MSJ_GOOGLE_CALENDAR_ID.trim(), impersonar: env.MSJ_GOOGLE_IMPERSONAR.trim(), credencialesPath: env.MSJ_GOOGLE_SA_JSON.trim() },
      hablame: { url: env.MSJ_HABLAME_URL.trim(), cuenta: recortada(env.MSJ_HABLAME_CUENTA), apiKey: env.MSJ_HABLAME_API_KEY.trim(), token: recortada(env.MSJ_HABLAME_TOKEN) },
    },
  };
}

module.exports = { leerEntorno, leerConexion, leerIntegraciones };
