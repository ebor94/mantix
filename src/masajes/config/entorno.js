// Variables del módulo Masajes. Nunca lanza: si algo falta, el router responde 503 y Mantix sigue arrancando.
const vacia = (v) => v === undefined || v === null || String(v).trim() === '';
const recortada = (v) => (vacia(v) ? undefined : String(v).trim());

const CONEXION = ['DB_HOST', 'DB_USER', 'DB_PASSWORD'];
const OTROS_SECRETOS = ['JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'TRK_JWT_SECRET', 'PORTERIA_JWT_SECRET'];
const FRANJAS_DEFECTO = '08:00,09:00,10:00,14:00,15:00,16:00';

function entero(env, nombre, porDefecto, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const v = recortada(env[nombre]);
  if (v === undefined) return { ok: true, valor: porDefecto };
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false, motivo: `${nombre} inválido: "${v}"` };
  return { ok: true, valor: n };
}

/** Solo la conexión (la usan también los scripts de migración e importación). */
function leerConexion(env = process.env) {
  const faltan = CONEXION.filter((n) => vacia(env[n]));
  if (faltan.length) return { ok: false, motivo: `Faltan variables: ${faltan.join(', ')}` };
  // Usuario de mínimo privilegio para el módulo (spec §17.8); si no está, se usa el de Mantix con advertencia.
  const propio = !vacia(env.MSJ_DB_USER) && !vacia(env.MSJ_DB_PASSWORD);
  return {
    ok: true,
    advertencia: propio ? null : 'Masajes usa DB_USER de Mantix: define MSJ_DB_USER/MSJ_DB_PASSWORD con mínimo privilegio',
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

  const secreto = recortada(env.MASAJES_JWT_SECRET);
  if (!secreto) return { ok: false, motivo: 'Falta MASAJES_JWT_SECRET' };
  if (secreto.length < 32) return { ok: false, motivo: 'MASAJES_JWT_SECRET debe tener al menos 32 caracteres' };
  if (OTROS_SECRETOS.some((k) => recortada(env[k]) === secreto)) {
    return { ok: false, motivo: `MASAJES_JWT_SECRET debe ser distinto de ${OTROS_SECRETOS.join(', ')}` };
  }
  const jwtExpires = recortada(env.MASAJES_JWT_EXPIRES) ?? '8h';
  if (!/^([1-9]\d*)(m|h)$/.test(jwtExpires)) return { ok: false, motivo: 'MASAJES_JWT_EXPIRES inválido (usa p. ej. 8h)' };

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
  };
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
      grupoAdminDn: grupoAdminDn.toLowerCase(),
      dominiosAutovinculo: (recortada(env.MSJ_DOMINIOS_AUTOVINCULO) ?? 'losolivos.co')
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      appUrl: recortada(env.MSJ_APP_URL) ?? 'https://mantix.losolivos.co/masajes',
      outboxMaxIntentos: 5,
      db: conexion.db,
    },
  };
}

/** Integraciones externas: las exige el worker del outbox, no el router (Tarea 13). */
function leerIntegraciones(env = process.env) {
  const req = ['MSJ_SPA_EMAIL', 'MSJ_GOOGLE_CALENDAR_ID', 'MSJ_GOOGLE_IMPERSONAR', 'MSJ_GOOGLE_SA_JSON', 'MSJ_HABLAME_URL', 'MSJ_HABLAME_API_KEY'];
  const faltan = req.filter((n) => vacia(env[n]));
  if (faltan.length) return { ok: false, motivo: `Faltan variables: ${faltan.join(', ')}` };
  if (!/^https:\/\//.test(env.MSJ_HABLAME_URL)) return { ok: false, motivo: 'MSJ_HABLAME_URL debe ser https' };
  return {
    ok: true,
    config: {
      spa: { nombre: recortada(env.MSJ_SPA_NOMBRE) ?? 'Spa', email: env.MSJ_SPA_EMAIL.trim(), direccion: recortada(env.MSJ_SPA_DIRECCION) ?? '', enEvento: env.MSJ_SPA_EN_EVENTO === 'true' },
      google: { calendarId: env.MSJ_GOOGLE_CALENDAR_ID.trim(), impersonar: env.MSJ_GOOGLE_IMPERSONAR.trim(), credencialesPath: env.MSJ_GOOGLE_SA_JSON.trim() },
      hablame: { url: env.MSJ_HABLAME_URL.trim(), cuenta: recortada(env.MSJ_HABLAME_CUENTA), apiKey: env.MSJ_HABLAME_API_KEY.trim(), token: recortada(env.MSJ_HABLAME_TOKEN) },
    },
  };
}

module.exports = { leerEntorno, leerConexion, leerIntegraciones };
