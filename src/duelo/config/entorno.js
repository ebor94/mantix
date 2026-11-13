// Lectura y validación de las variables del módulo Duelo. Nunca lanza: si algo falta, el router
// responde 503 y Mantix sigue arrancando. La conexión reutiliza las DB_* de Mantix (misma base).
const path = require('path');

const vacia = (v) => v === undefined || v === null || String(v).trim() === '';
const recortada = (v) => (vacia(v) ? undefined : String(v).trim());

const CONEXION = ['DB_HOST', 'DB_USER', 'DB_PASSWORD'];
const PROPIAS = ['DUELO_PANEL_USUARIO', 'DUELO_PANEL_CLAVE', 'DUELO_JWT_SECRET', 'DUELO_VERSION_POLITICA'];
const OTROS_SECRETOS = ['JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'TRK_JWT_SECRET', 'PORTERIA_JWT_SECRET'];
const CANALES = ['n8n', 'ninguno'];

const faltantesDe = (env, nombres) => nombres.filter((n) => vacia(env[n]));

// Raíz del backend calculada desde este archivo (no desde process.cwd(), que depende de cómo arranque PM2).
const RAIZ_BACKEND = path.resolve(__dirname, '../../..');
// Mantix sirve <raíz>/uploads como estático público (app.js): las fotos nunca pueden quedar ahí.
const UPLOADS = path.join(RAIZ_BACKEND, 'uploads');

/** Carpeta absoluta de fotos (res.sendFile exige ruta absoluta), o null si cae dentro de uploads/. */
function resolverFotosPath(valor) {
  const ruta = path.resolve(RAIZ_BACKEND, valor ?? path.join('datos', 'duelo', 'fotos'));
  const relativa = path.relative(UPLOADS, ruta);
  const dentroDeUploads = relativa === '' || (relativa !== '..' && !relativa.startsWith(`..${path.sep}`) && !path.isAbsolute(relativa));
  return dentroDeUploads ? null : ruta;
}

/** Solo la conexión (la usa también `npm run duelo:migrate`). */
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

  const secreto = env.DUELO_JWT_SECRET;
  if (OTROS_SECRETOS.some((n) => env[n] === secreto)) {
    return { ok: false, motivo: 'DUELO_JWT_SECRET debe ser distinto de los demás secretos JWT' };
  }

  const canal = recortada(env.DUELO_CORREO_CANAL) ?? 'ninguno';
  if (!CANALES.includes(canal)) return { ok: false, motivo: 'DUELO_CORREO_CANAL inválido (n8n | ninguno)' };
  const correo = { canal };
  if (canal === 'n8n') {
    if (vacia(env.DUELO_N8N_WEBHOOK_URL) || vacia(env.DUELO_N8N_SECRETO)) {
      return { ok: false, motivo: 'DUELO_CORREO_CANAL=n8n exige DUELO_N8N_WEBHOOK_URL y DUELO_N8N_SECRETO' };
    }
    correo.url = recortada(env.DUELO_N8N_WEBHOOK_URL);
    correo.secreto = recortada(env.DUELO_N8N_SECRETO);
  }

  const fotosPath = resolverFotosPath(recortada(env.DUELO_FOTOS_PATH));
  if (!fotosPath) return { ok: false, motivo: 'DUELO_FOTOS_PATH no puede estar dentro de uploads/ (es público)' };

  const limite = parseInt(env.DUELO_LIMITE_INSCRIPCIONES, 10);

  // Vacío = sin cupo. Cualquier otra cosa que no sea un entero positivo invalida la configuración:
  // un error de digitación nunca debe significar «sin límite».
  const cupoTexto = recortada(env.DUELO_CUPO_MAXIMO);
  if (cupoTexto !== undefined && !/^[1-9]\d*$/.test(cupoTexto)) {
    return { ok: false, motivo: 'DUELO_CUPO_MAXIMO debe ser un entero positivo (o quedar vacía para no limitar)' };
  }

  return {
    ok: true,
    config: {
      abiertas: recortada(env.DUELO_INSCRIPCIONES_ABIERTAS) !== 'false',
      versionPolitica: recortada(env.DUELO_VERSION_POLITICA),
      origenes: (recortada(env.DUELO_ORIGENES) ?? 'https://losolivoscucuta.com')
        .split(',').map((o) => o.trim()).filter(Boolean),
      fotosPath,
      contacto: recortada(env.DUELO_CONTACTO) ?? 'nuestro equipo de Los Olivos',
      panel: { usuario: recortada(env.DUELO_PANEL_USUARIO), clave: env.DUELO_PANEL_CLAVE },
      jwtSecret: secreto,
      jwtExpires: '2h',
      correo,
      cupoMaximo: cupoTexto === undefined ? null : parseInt(cupoTexto, 10),
      limiteInscripciones: limite > 0 ? limite : 30,
      turnstileSecret: recortada(env.DUELO_TURNSTILE_SECRET) ?? null,
      db: leerConexion(env).db,
    },
  };
}

module.exports = { leerEntorno, leerConexion };
