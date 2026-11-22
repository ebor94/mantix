# Horno INCOL — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo `/api/horno/v1` en mantix-backend (login AD + grupo INCOL_APP, lecturas, serie, Excel) y app `incol-frontend` (Vue 3 + Pinia) para monitorear, graficar y descargar las lecturas del horno.

**Architecture:** El backend copia el patrón del módulo Portería: router con guardián 503, configuración que nunca lanza, pool mysql2 perezoso hacia el MySQL central `192.9.17.30/horno`, JWT propio (`scope:'horno'`) y errores `{success:false,error,motivo,message}`. El frontend es una SPA con Vite publicada en `/incol/` que consume esa API con Bearer.

**Tech Stack:** Node/Express 4, mysql2, ldapjs (vía `src/h360/services/ldap.service.js`), jsonwebtoken, express-rate-limit 7, exceljs, Jest + supertest · Vue 3.5, Pinia 3, vue-router 5, Vite 7, Tailwind 3.4, chart.js 4 + vue-chartjs 5, dayjs, axios, @heroicons/vue, Vitest.

Spec: `docs/superpowers/specs/2026-11-22-horno-incol-design.md`.

## Global Constraints

- Todo el código, mensajes y commits en español; commits estilo `feat(horno): …` y terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend: 2 espacios, comillas simples, punto y coma, CommonJS. Rama `feat/horno` (ya creada).
- Rutas del backend bajo `/api/horno/v1`; códigos de API `HOR-XXX-NNN`; cabecera `X-HOR-API`.
- Variables: `HORNO_DB_HOST`, `HORNO_DB_PORT` (3306), `HORNO_DB_USER`, `HORNO_DB_PASSWORD`, `HORNO_DB_NAME` (`horno`), `HORNO_JWT_SECRET`, `HORNO_JWT_EXPIRES` (`8h`), `HORNO_GRUPO_AD` (`INCOL_APP`), más `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_USER`, `LDAP_BIND_PASS`. Sin respaldo en `DB_*`.
- Equipo fijo `HORNO-INCOL`; columna de tiempo `registrado_en` (DATETIME, hora de Colombia, sin conversión).
- Límites: rango ≤ 366 días; `tamano` ≤ 500 (por defecto 50); Excel ≤ 100 000 filas (413 `DEMASIADOS_REGISTROS`).
- Agrupación automática: `crudo` si el rango ≤ 2 días, `hora` si ≤ 31 días, si no `dia`.
- Frontend: repo `/Users/bortega/Shared/Files From c.localized/apps/mantix/incol-frontend`, base `/incol/`, web history, verde `#00875c`/`#005a3d`, fondo `#f9fafb`, barra lateral `#004730`, Comfortaa (títulos) y Raleway (texto).
- API de producción: `https://mantix-api.losolivoscucuta.com:8444/api/horno/v1`.

Rutas cortas: `BE` = `/Users/bortega/Shared/Files From c.localized/apps/mantix/mantix-backend`, `FE` = `/Users/bortega/Shared/Files From c.localized/apps/mantix/incol-frontend`.

---

### Task 1: Configuración, errores y conexión del módulo

**Files:**
- Create: `BE/src/horno/config/entorno.js`
- Create: `BE/src/horno/utils/HornoError.js`, `BE/src/horno/utils/aw.js`
- Create: `BE/src/horno/db.js`, `BE/src/horno/horno.env.example`
- Test: `BE/src/horno/__tests__/entorno.test.js`
- Modify: `BE/package.json` (script `test:horno`)

**Interfaces:**
- Produces: `leerEntorno(env) → {ok:false, motivo} | {ok:true, advertencia, config:{jwtSecret, jwtExpires, grupo, db:{host,port,user,password,database}}}`; `HornoError(statusCode, motivo, message, errors?)`; `aw(fn)`; `crearBdPerezosa(cfgFn) → {obtener(), ping(), cerrar()}`.

- [ ] **Step 1: Escribir la prueba que falla** — `BE/src/horno/__tests__/entorno.test.js`

```js
const { leerEntorno } = require('../config/entorno');

const base = () => ({
  HORNO_DB_HOST: '192.9.17.30', HORNO_DB_USER: 'incol_api', HORNO_DB_PASSWORD: 'x',
  HORNO_JWT_SECRET: 'h'.repeat(40),
  LDAP_URL: 'ldap://ad', LDAP_BASE_DN: 'DC=olivos,DC=local', LDAP_BIND_USER: 'svc', LDAP_BIND_PASS: 'p',
});

test('con lo mínimo aplica los valores por defecto', () => {
  const e = leerEntorno(base());
  expect(e.ok).toBe(true);
  expect(e.advertencia).toBeNull();
  expect(e.config).toEqual({
    jwtSecret: 'h'.repeat(40), jwtExpires: '8h', grupo: 'INCOL_APP',
    db: { host: '192.9.17.30', port: 3306, user: 'incol_api', password: 'x', database: 'horno' },
  });
});

test('lista las variables que faltan, sin valores', () => {
  const env = base();
  delete env.HORNO_DB_PASSWORD;
  env.LDAP_URL = '  ';
  expect(leerEntorno(env)).toEqual({ ok: false, motivo: 'Faltan variables: HORNO_DB_PASSWORD, LDAP_URL' });
});

test('no usa las DB_* de Mantix como respaldo', () => {
  const env = base();
  delete env.HORNO_DB_HOST;
  env.DB_HOST = 'localhost';
  expect(leerEntorno(env).ok).toBe(false);
});

test('rechaza un secreto igual al de otro módulo', () => {
  const env = { ...base(), JWT_SECRET: 'h'.repeat(40) };
  const e = leerEntorno(env);
  expect(e.ok).toBe(false);
  expect(e.motivo).toMatch(/distinto/);
});

test('rechaza HORNO_JWT_EXPIRES y HORNO_DB_PORT inválidos', () => {
  expect(leerEntorno({ ...base(), HORNO_JWT_EXPIRES: '8 horas' }).ok).toBe(false);
  expect(leerEntorno({ ...base(), HORNO_DB_PORT: 'abc' }).ok).toBe(false);
});

test('acepta grupo, puerto, base y expiración propios', () => {
  const e = leerEntorno({
    ...base(), HORNO_GRUPO_AD: ' INCOL_APP_TEST ', HORNO_DB_PORT: '3307', HORNO_DB_NAME: 'horno_test', HORNO_JWT_EXPIRES: '2h',
  });
  expect(e.config.grupo).toBe('INCOL_APP_TEST');
  expect(e.config.db.port).toBe(3307);
  expect(e.config.db.database).toBe('horno_test');
  expect(e.config.jwtExpires).toBe('2h');
});

test('advierte si el secreto es corto', () => {
  expect(leerEntorno({ ...base(), HORNO_JWT_SECRET: 'corto' }).advertencia).toMatch(/32/);
});
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `cd "BE" && npx jest src/horno/__tests__/entorno.test.js`
Expected: FAIL `Cannot find module '../config/entorno'`

- [ ] **Step 3: Implementar**

`BE/src/horno/config/entorno.js`:

```js
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
```

`BE/src/horno/utils/HornoError.js`:

```js
const AppError = require('../../utils/AppError');

// Error operativo del módulo Horno: status HTTP + motivo estable + mensaje para el usuario.
class HornoError extends AppError {
  constructor(statusCode, motivo, message, errors) {
    super(message, statusCode);
    this.motivo = motivo;
    if (errors) this.errors = errors;
  }
}

module.exports = HornoError;
```

`BE/src/horno/utils/aw.js`:

```js
/** Envuelve un handler async: cualquier rechazo va a next (Express 4 no lo hace solo). */
const aw = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);

module.exports = aw;
```

`BE/src/horno/db.js`:

```js
// Mismo pool perezoso de Portería (mysql2, zona -05:00), apuntando al MySQL central del horno.
module.exports = require('../porteria/db');
```

`BE/src/horno/horno.env.example`:

```bash
# Módulo Horno INCOL (/api/horno/v1) — lecturas del horno en el MySQL central
HORNO_DB_HOST=192.9.17.30
HORNO_DB_PORT=3306
HORNO_DB_NAME=horno
HORNO_DB_USER=incol_api
HORNO_DB_PASSWORD=
# >= 32 caracteres, distinto de los demás secretos (openssl rand -hex 32)
HORNO_JWT_SECRET=
HORNO_JWT_EXPIRES=8h
# Grupo del AD (CN o DN completo). Solo cuenta la membresía directa.
HORNO_GRUPO_AD=INCOL_APP
# Reutiliza LDAP_URL, LDAP_BASE_DN, LDAP_BIND_USER, LDAP_BIND_PASS de Mantix.
# Agregar el origen del frontend a CORS_ORIGIN: http://192.9.17.11
```

En `BE/package.json`, dentro de `"scripts"`, después de `"duelo:migrate"` agregar (con la coma en la línea anterior):

```json
    "test:horno": "jest src/horno"
```

- [ ] **Step 4: Correr y ver pasar**

Run: `cd "BE" && npx jest src/horno/__tests__/entorno.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
cd "BE" && git add src/horno package.json && git commit -m "feat(horno): configuración, errores y conexión del módulo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Login contra el AD con el grupo INCOL_APP

**Files:**
- Create: `BE/src/horno/services/auth.service.js`
- Create: `BE/src/horno/middleware/apiCodigo.js`, `BE/src/horno/middleware/errorHandler.js`, `BE/src/horno/middleware/autenticacion.js`
- Create: `BE/src/horno/routes/auth.routes.js`, `BE/src/horno/routes/index.js`
- Create: `BE/src/horno/testing/appPrueba.js`
- Test: `BE/src/horno/__tests__/auth.test.js`

**Interfaces:**
- Consumes: `leerEntorno`, `HornoError`, `aw`, `crearBdPerezosa` (Task 1); `require('../../h360/services/ldap.service')` exporta `validarCredenciales(usuario, password) → {usuario, nombre, email, memberOf:string[]}` (errores con `err.codigo` `'CREDENCIALES_INVALIDAS'` | `'AD_NO_DISPONIBLE'`) y `esDelGrupo(dn, grupo) → boolean`.
- Produces: `firmarToken({usuario,nombre,email}, {jwtSecret,jwtExpires}) → string`; `verificarToken(token, secret) → {usuario,nombre,email,exp}`; `crearAutenticacion(obtenerConfig)` deja `req.hornoUsuario`; `apiCodigo(codigo)` deja `req.hornoLog`; `hornoErrorHandler`; `crearRouterHorno({bd, obtenerConfig, directorio})`; `crearAppPrueba(deps) → {app, deps}`, `tokenDe({usuario,nombre,email})`, `CONFIG`.

- [ ] **Step 1: Escribir la prueba que falla** — `BE/src/horno/__tests__/auth.test.js`

```js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe, CONFIG } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const DN = 'CN=INCOL_APP,OU=Grupos,DC=olivos,DC=local';
const datosAd = (memberOf = [DN]) => ({ usuario: 'jperez', nombre: 'Juan Pérez', email: 'jperez@olivos.local', memberOf });
const errorAd = (codigo) => Object.assign(new Error(codigo), { codigo });
const login = async (app, cuerpo) => request(await servir(app)).post('/api/horno/v1/auth/login').send(cuerpo);
const me = async (app, token) => {
  const r = request(await servir(app)).get('/api/horno/v1/auth/me');
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};

test('login correcto con el grupo devuelve un token del módulo', async () => {
  const { app, deps } = crearAppPrueba();
  deps.directorio.validarCredenciales.mockResolvedValue(datosAd());
  const r = await login(app, { usuario: 'jperez', password: 'clave' });
  expect(r.status).toBe(200);
  expect(r.headers['x-hor-api']).toBe('HOR-AUT-001');
  expect(r.body.data.user).toEqual({ usuario: 'jperez', nombre: 'Juan Pérez', email: 'jperez@olivos.local' });
  expect(jwt.verify(r.body.data.token, CONFIG.jwtSecret)).toMatchObject({ scope: 'horno', sub: 'jperez' });
  expect(deps.directorio.validarCredenciales).toHaveBeenCalledWith('jperez', 'clave');
});

test('sin usuario o clave responde 400 sin consultar el AD', async () => {
  const { app, deps } = crearAppPrueba();
  const r = await login(app, { usuario: 'jperez' });
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ success: false, error: 'HOR-AUT-001', motivo: 'VALIDACION' });
  expect(deps.directorio.validarCredenciales).not.toHaveBeenCalled();
});

test('credenciales inválidas responde 401', async () => {
  const { app, deps } = crearAppPrueba();
  deps.directorio.validarCredenciales.mockRejectedValue(errorAd('CREDENCIALES_INVALIDAS'));
  const r = await login(app, { usuario: 'jperez', password: 'mala' });
  expect(r.status).toBe(401);
  expect(r.body).toMatchObject({ motivo: 'CREDENCIALES_INVALIDAS', message: 'Usuario o contraseña incorrectos' });
});

test('fuera del grupo INCOL_APP responde 403 aunque el nombre se parezca', async () => {
  const { app, deps } = crearAppPrueba();
  deps.directorio.validarCredenciales.mockResolvedValue(datosAd(['CN=INCOL_APP_OTROS,OU=Grupos,DC=olivos,DC=local']));
  const r = await login(app, { usuario: 'jperez', password: 'clave' });
  expect(r.status).toBe(403);
  expect(r.body.motivo).toBe('SIN_ACCESO');
  expect(r.body.message).toMatch(/INCOL_APP/);
});

test('AD caído responde 503', async () => {
  const { app, deps } = crearAppPrueba();
  deps.directorio.validarCredenciales.mockRejectedValue(errorAd('AD_NO_DISPONIBLE'));
  const r = await login(app, { usuario: 'jperez', password: 'clave' });
  expect(r.status).toBe(503);
  expect(r.body.motivo).toBe('AD_NO_DISPONIBLE');
});

test('/auth/me con token devuelve el usuario', async () => {
  const { app } = crearAppPrueba();
  const r = await me(app, tokenDe());
  expect(r.status).toBe(200);
  expect(r.body.data.user).toEqual({ usuario: 'operador1', nombre: 'Operador Uno', email: 'op@olivos.local' });
});

test('/auth/me sin token, con token de otro módulo o vencido responde 401', async () => {
  const { app } = crearAppPrueba();
  const deOtro = jwt.sign({ scope: 'porteria', rol: 'guarda' }, CONFIG.jwtSecret, { subject: 'x', expiresIn: '1h' });
  const vencido = jwt.sign({ scope: 'horno' }, CONFIG.jwtSecret, { subject: 'x', expiresIn: -10 });
  for (const token of [null, deOtro, vencido, 'basura']) {
    const r = await me(app, token);
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: 'HOR-AUT-002', motivo: 'NO_AUTENTICADO' });
  }
});

test('health responde ok con la BD viva y 503 si no responde', async () => {
  const viva = crearAppPrueba().app;
  expect((await request(await servir(viva)).get('/api/horno/v1/health')).body.data).toEqual({ estado: 'ok', bd: 'ok' });
  const caida = crearAppPrueba({ bd: { ping: async () => { throw new Error('ECONNREFUSED'); } } }).app;
  const r = await request(await servir(caida)).get('/api/horno/v1/health');
  expect(r.status).toBe(503);
  expect(r.body.error).toBe('HOR-SIS-001');
});

test('ruta inexistente responde 404 con el contrato del módulo', async () => {
  const { app } = crearAppPrueba();
  const r = await request(await servir(app)).get('/api/horno/v1/no-existe');
  expect(r.status).toBe(404);
  expect(r.body).toMatchObject({ success: false, error: 'HOR-SIS-002', motivo: 'NO_ENCONTRADO' });
});
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `cd "BE" && npx jest src/horno/__tests__/auth.test.js`
Expected: FAIL `Cannot find module '../testing/appPrueba'`

- [ ] **Step 3: Implementar**

`BE/src/horno/services/auth.service.js`:

```js
// JWT propio del módulo Horno (scope 'horno') y pertenencia al grupo del AD.
const jwt = require('jsonwebtoken');
const HornoError = require('../utils/HornoError');
const { esDelGrupo } = require('../../h360/services/ldap.service');

const SCOPE = 'horno';

// Solo membresía directa (memberOf): un grupo anidado dentro de INCOL_APP no da acceso.
const perteneceAlGrupo = (memberOf, grupo) => Array.isArray(memberOf) && memberOf.some((dn) => esDelGrupo(dn, grupo));

function firmarToken({ usuario, nombre, email }, { jwtSecret, jwtExpires }) {
  return jwt.sign(
    { scope: SCOPE, nombre: nombre ?? null, email: email ?? null },
    jwtSecret,
    { subject: usuario, algorithm: 'HS256', expiresIn: jwtExpires },
  );
}

const sesionInvalida = () => new HornoError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida');

function verificarToken(token, jwtSecret) {
  let p;
  try {
    p = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw sesionInvalida();
  }
  if (p.scope !== SCOPE || !p.sub || !Number.isInteger(p.exp)) throw sesionInvalida();
  return { usuario: p.sub, nombre: p.nombre ?? null, email: p.email ?? null, exp: p.exp };
}

/** Lo que el front recibe del usuario en sesión. */
const usuarioPublico = ({ usuario, nombre, email }) => ({ usuario, nombre: nombre ?? null, email: email ?? null });

module.exports = { SCOPE, perteneceAlGrupo, firmarToken, verificarToken, usuarioPublico };
```

`BE/src/horno/middleware/apiCodigo.js`:

```js
const logger = require('../../utils/logger');

const MOTIVO_POR_STATUS = {
  400: 'VALIDACION',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  413: 'DEMASIADOS_REGISTROS',
  429: 'DEMASIADOS_INTENTOS',
  503: 'NO_DISPONIBLE',
};

/**
 * Primer middleware de toda ruta del módulo: fija el código de API, la cabecera X-HOR-API y el logger
 * hijo, y garantiza que cualquier respuesta de error lleve { error: <código>, motivo }.
 */
function apiCodigo(codigo) {
  return (req, res, next) => {
    const inicio = Date.now();
    req.hornoApiCodigo = codigo;
    req.hornoLog = logger.child({ modulo: 'horno', api_codigo: codigo });
    res.setHeader('X-HOR-API', codigo);

    const jsonOriginal = res.json.bind(res);
    res.json = (cuerpo) => {
      if (cuerpo && cuerpo.success === false) {
        cuerpo.error = codigo;
        if (!cuerpo.motivo) cuerpo.motivo = MOTIVO_POR_STATUS[res.statusCode] || 'ERROR';
      }
      return jsonOriginal(cuerpo);
    };

    res.on('finish', () => {
      req.hornoLog.info('horno request', {
        metodo: req.method,
        ruta: req.originalUrl.split('?')[0],
        status: res.statusCode,
        ms: Date.now() - inicio,
        usuario: req.hornoUsuario ? req.hornoUsuario.usuario : null,
      });
    });
    next();
  };
}

module.exports = apiCodigo;
```

`BE/src/horno/middleware/errorHandler.js`:

```js
const logger = require('../../utils/logger');
const HornoError = require('../utils/HornoError');
const { errorParaLog } = require('../../porteria/utils/errorSeguro');

const SIN_CODIGO = 'HOR-SIN-CODIGO';

// Último middleware del router del módulo (y de /api/horno en app.js para errores del parser).
// eslint-disable-next-line no-unused-vars
function hornoErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const codigo = req.hornoApiCodigo || SIN_CODIGO;
  const log = req.hornoLog || logger.child({ modulo: 'horno', api_codigo: codigo });
  if (!res.getHeader('X-HOR-API')) res.setHeader('X-HOR-API', codigo);

  let status = 500;
  let motivo = 'ERROR_INTERNO';
  let message = 'Error interno del servidor';
  let errors;

  if (err instanceof HornoError) {
    ({ statusCode: status, motivo, message, errors } = err);
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400; motivo = 'VALIDACION'; message = 'JSON inválido';
  } else if (err && err.type === 'entity.too.large') {
    status = 413; motivo = 'VALIDACION'; message = 'El cuerpo de la solicitud es demasiado grande';
  }

  if (status >= 500) log.error('horno error no controlado', errorParaLog(err));
  else log.warn('horno error', { status, motivo, message });

  const cuerpo = { success: false, error: codigo, motivo, message };
  if (errors) cuerpo.errors = errors;
  res.status(status).json(cuerpo);
}

module.exports = { hornoErrorHandler, SIN_CODIGO };
```

`BE/src/horno/middleware/autenticacion.js`:

```js
const HornoError = require('../utils/HornoError');
const { verificarToken } = require('../services/auth.service');

/** `obtenerConfig()` se llama en cada request: el secreto es el del entorno vigente. */
function crearAutenticacion(obtenerConfig) {
  return (req, res, next) => {
    const encontrado = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    if (!encontrado) return next(new HornoError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida'));
    try {
      req.hornoUsuario = verificarToken(encontrado[1], obtenerConfig().jwtSecret);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { crearAutenticacion };
```

`BE/src/horno/routes/auth.routes.js`:

```js
// Login con el Directorio Activo (grupo HORNO_GRUPO_AD) y sesión actual.
const express = require('express');
const rateLimit = require('express-rate-limit');
const apiCodigo = require('../middleware/apiCodigo');
const HornoError = require('../utils/HornoError');
const aw = require('../utils/aw');
const { perteneceAlGrupo, firmarToken, usuarioPublico } = require('../services/auth.service');

// Misma regla que H360 y Portería: lo que va antes de '@' o después de '\\', en minúsculas.
function normalizarUsuario(raw) {
  const u = String(raw ?? '').trim().toLowerCase();
  if (u.includes('@')) return u.split('@')[0];
  if (u.includes('\\')) return u.split('\\')[1];
  return u;
}

const textoValido = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;

function crearRouterAuth({ obtenerConfig, directorio, autenticar }) {
  const router = express.Router();

  // Solo cuentan los 401 (clave mala): un AD caído (503) o la falta de grupo (403) no bloquean a nadie.
  const demasiados = (req, res, next) => next(new HornoError(
    429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
  ));
  const opcionesLimite = {
    windowMs: 15 * 60 * 1000,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode !== 401,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: demasiados,
  };
  const limitadorUsuario = rateLimit({
    ...opcionesLimite,
    limit: 10,
    keyGenerator: (req) => `${req.ip}|${normalizarUsuario(req.body && req.body.usuario)}`,
  });
  const limitadorIp = rateLimit({ ...opcionesLimite, limit: 100, keyGenerator: (req) => req.ip });

  router.post('/login', apiCodigo('HOR-AUT-001'), limitadorIp, limitadorUsuario, aw(async (req, res) => {
    const { usuario, password } = req.body || {};
    if (!textoValido(usuario, 100) || !textoValido(password, 200)) {
      throw new HornoError(400, 'VALIDACION', 'Usuario y contraseña son obligatorios');
    }
    const registrar = (resultado) => req.hornoLog.info('horno login', { usuario: normalizarUsuario(usuario), ip: req.ip, resultado });

    let datos;
    try {
      datos = await directorio.validarCredenciales(usuario, password);
    } catch (err) {
      if (err.codigo === 'CREDENCIALES_INVALIDAS') {
        registrar('credenciales_invalidas');
        throw new HornoError(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos');
      }
      if (err.codigo === 'AD_NO_DISPONIBLE') {
        registrar('directorio_no_disponible');
        throw new HornoError(503, 'AD_NO_DISPONIBLE', 'No se pudo validar con el directorio activo. Intenta de nuevo.');
      }
      throw err;
    }

    const config = obtenerConfig();
    if (!perteneceAlGrupo(datos.memberOf, config.grupo)) {
      registrar('sin_grupo');
      throw new HornoError(403, 'SIN_ACCESO', `Tu usuario de red no pertenece al grupo ${config.grupo}. Solicita acceso a TI.`);
    }
    registrar('ok');

    const user = usuarioPublico(datos);
    res.json({ success: true, data: { token: firmarToken(user, config), user } });
  }));

  router.get('/me', apiCodigo('HOR-AUT-002'), autenticar, (req, res) => {
    res.json({ success: true, data: { user: usuarioPublico(req.hornoUsuario) } });
  });

  return router;
}

module.exports = { crearRouterAuth };
```

`BE/src/horno/routes/index.js`:

```js
// ============================================
// Router del módulo Horno INCOL (/api/horno/v1)
// ============================================
const express = require('express');
const logger = require('../../utils/logger');
const ldapService = require('../../h360/services/ldap.service');
const { leerEntorno } = require('../config/entorno');
const { crearBdPerezosa } = require('../db');
const apiCodigo = require('../middleware/apiCodigo');
const { hornoErrorHandler } = require('../middleware/errorHandler');
const { crearAutenticacion } = require('../middleware/autenticacion');
const { errorParaLog } = require('../../porteria/utils/errorSeguro');
const { crearRouterAuth } = require('./auth.routes');

/** Fábrica inyectable (tests). `bd` = { ping(), obtener() }; `directorio` = { validarCredenciales }. */
function crearRouterHorno({ bd, obtenerConfig, directorio }) {
  const router = express.Router();
  const autenticar = crearAutenticacion(obtenerConfig);

  router.get('/health', apiCodigo('HOR-SIS-001'), async (req, res) => {
    try {
      await bd.ping();
      res.json({ success: true, data: { estado: 'ok', bd: 'ok' } });
    } catch (err) {
      req.hornoLog.error('horno: falló el ping a la BD', errorParaLog(err));
      res.status(503).json({ success: false, message: 'La base de datos del horno no responde' });
    }
  });

  router.use('/auth', crearRouterAuth({ obtenerConfig, directorio, autenticar }));

  router.use(apiCodigo('HOR-SIS-002'), (req, res) => res.status(404).json({ success: false, message: 'Ruta no encontrada' }));
  router.use(hornoErrorHandler);
  return router;
}

// Producción: se construye UNA vez (express-rate-limit exige crear los limitadores al cargar).
// Nada aquí toca la red ni lanza si faltan variables: el pool se crea al primer uso.
const bd = crearBdPerezosa(() => {
  const e = leerEntorno();
  if (!e.ok) throw new Error(`Horno sin configuración válida: ${e.motivo}`);
  return e.config.db;
});
const real = crearRouterHorno({
  bd,
  obtenerConfig: () => leerEntorno().config, // solo se llama detrás del guardián
  directorio: ldapService,
});

// Si la configuración no es válida responde 503 sin tumbar Mantix (se re-evalúa por request, es barato).
let avisado = false;
function router(req, res, next) {
  const entorno = leerEntorno();
  if (!entorno.ok) {
    if (!avisado) {
      avisado = true;
      logger.error(`horno deshabilitado: ${entorno.motivo}`);
    }
    res.setHeader('X-HOR-API', 'HOR-SIS-000');
    return res.status(503).json({
      success: false,
      error: 'HOR-SIS-000',
      motivo: 'HORNO_DESHABILITADO',
      message: 'El módulo del horno no está disponible: configuración del servidor incompleta',
    });
  }
  avisado = false;
  return real(req, res, next);
}

module.exports = { router, crearRouterHorno, bd };
```

`BE/src/horno/testing/appPrueba.js`:

```js
// App Express mínima con el router del horno y dependencias falsas (jest.fn), reemplazables por prueba.
const express = require('express');
const { crearRouterHorno } = require('../routes');
const { firmarToken } = require('../services/auth.service');

const CONFIG = Object.freeze({ jwtSecret: 'secreto-de-prueba-horno-0123456789abcdef', jwtExpires: '8h', grupo: 'INCOL_APP' });

function crearAppPrueba(deps = {}) {
  const todas = {
    bd: { ping: async () => {} },
    obtenerConfig: () => CONFIG,
    directorio: { validarCredenciales: jest.fn() },
    ...deps,
  };
  const app = express();
  app.use(express.json());
  app.use('/api/horno/v1', crearRouterHorno(todas));
  return { app, deps: todas };
}

const tokenDe = ({ usuario = 'operador1', nombre = 'Operador Uno', email = 'op@olivos.local' } = {}) =>
  firmarToken({ usuario, nombre, email }, CONFIG);

module.exports = { crearAppPrueba, tokenDe, CONFIG };
```

- [ ] **Step 4: Correr y ver pasar**

Run: `cd "BE" && npx jest src/horno`
Expected: PASS (entorno 7 + auth 9)

- [ ] **Step 5: Commit**

```bash
cd "BE" && git add src/horno && git commit -m "feat(horno): login contra el AD restringido al grupo INCOL_APP

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rango de fechas y servicio de lecturas

**Files:**
- Create: `BE/src/horno/utils/rango.js`
- Create: `BE/src/horno/services/lecturas.service.js`
- Test: `BE/src/horno/__tests__/rango.test.js`, `BE/src/horno/__tests__/lecturas.service.test.js`

**Interfaces:**
- Consumes: `HornoError` (Task 1); `bd.obtener().query(sql, params) → [filas]` (mysql2).
- Produces: `leerRango(query, {maxDias=366}) → {desde, hasta, dias}` (textos `YYYY-MM-DD HH:mm:ss`); `VARIABLES` (array `{campo, etiqueta, unidad, decimales}`); `LIMITE_EXCEL = 100000`; `agrupacionPara(dias)`; `crearServicioLecturas({bd}) → { ultima(), serie({desde,hasta,dias}), contar({desde,hasta}), listar({desde,hasta,pagina,tamano}), filasParaExcel({desde,hasta}) }`. Una lectura es `{id, registrado_en, fecha_hmi, temp_combustion, …, ccr_o2_ref}` con números o null.

- [ ] **Step 1: Escribir las pruebas que fallan**

`BE/src/horno/__tests__/rango.test.js`:

```js
const { leerRango } = require('../utils/rango');

test('fechas sin hora cubren el día completo', () => {
  expect(leerRango({ desde: '2026-11-01', hasta: '2026-11-02' })).toEqual({
    desde: '2026-11-01 00:00:00', hasta: '2026-11-02 23:59:59', dias: (2 * 86400 - 1) / 86400,
  });
});

test('acepta hora con y sin segundos, con espacio o T', () => {
  const r = leerRango({ desde: '2026-11-22T08:30', hasta: '2026-11-22 14:05:30' });
  expect(r.desde).toBe('2026-11-22 08:30:00');
  expect(r.hasta).toBe('2026-11-22 14:05:30');
});

test.each([
  [{}, /Indica desde y hasta/],
  [{ desde: '2026-02-30', hasta: '2026-03-01' }, /Indica desde y hasta/],
  [{ desde: '2026-11-22 25:00', hasta: '2026-11-23' }, /Indica desde y hasta/],
  [{ desde: ['2026-11-01'], hasta: '2026-11-02' }, /Indica desde y hasta/],
  [{ desde: '2026-11-22', hasta: '2026-11-21' }, /posterior/],
  [{ desde: '2025-01-01', hasta: '2026-11-22' }, /366/],
])('rechaza %j con 400', (query, mensaje) => {
  try {
    leerRango(query);
    throw new Error('no lanzó');
  } catch (err) {
    expect(err.statusCode).toBe(400);
    expect(err.motivo).toBe('VALIDACION');
    expect(err.message).toMatch(mensaje);
  }
});
```

`BE/src/horno/__tests__/lecturas.service.test.js`:

```js
const { crearServicioLecturas, agrupacionPara, VARIABLES } = require('../services/lecturas.service');

// bd falsa: cada llamada a query devuelve la siguiente respuesta de la lista y registra (sql, params).
function bdFalsa(...respuestas) {
  const query = jest.fn(async () => [respuestas.shift() ?? []]);
  return { bd: { obtener: () => ({ query }) }, query };
}

const fila = (extra = {}) => ({
  id_local: 16, registrado_en: '2026-11-22 14:05:30', fecha_hmi: '2026-11-22 14:05:30',
  temp_combustion: '338.0', temp_postcombustion: '469.0', temp_chimenea: '102.0', co: '4.0',
  oxigeno: '18.63', co_mg_m3: '4.576', ccr: '4.7', ccr_o2_ref: null, ...extra,
});

test('agrupación automática por tamaño del rango', () => {
  expect(agrupacionPara(1)).toBe('crudo');
  expect(agrupacionPara(2)).toBe('crudo');
  expect(agrupacionPara(7)).toBe('hora');
  expect(agrupacionPara(31)).toBe('hora');
  expect(agrupacionPara(31.5)).toBe('dia');
});

test('VARIABLES define las 8 columnas del horno', () => {
  expect(VARIABLES.map((v) => v.campo)).toEqual([
    'temp_combustion', 'temp_postcombustion', 'temp_chimenea', 'co', 'oxigeno', 'co_mg_m3', 'ccr', 'ccr_o2_ref',
  ]);
});

test('ultima convierte los DECIMAL a número y devuelve los minutos sin datos', async () => {
  const { bd, query } = bdFalsa([{ ...fila(), minutos_sin_datos: 3 }]);
  const r = await crearServicioLecturas({ bd }).ultima();
  expect(r).toEqual({
    minutosSinDatos: 3,
    lectura: {
      id: 16, registrado_en: '2026-11-22 14:05:30', fecha_hmi: '2026-11-22 14:05:30',
      temp_combustion: 338, temp_postcombustion: 469, temp_chimenea: 102, co: 4,
      oxigeno: 18.63, co_mg_m3: 4.576, ccr: 4.7, ccr_o2_ref: null,
    },
  });
  expect(query.mock.calls[0][1]).toEqual(['HORNO-INCOL']);
  expect(query.mock.calls[0][0]).toMatch(/ORDER BY registrado_en DESC/);
});

test('ultima sin datos devuelve lectura null', async () => {
  const { bd } = bdFalsa([]);
  expect(await crearServicioLecturas({ bd }).ultima()).toEqual({ lectura: null, minutosSinDatos: null });
});

test('serie cruda repite el valor en prom, min y max', async () => {
  const { bd, query } = bdFalsa([{ t: '2026-11-22 14:05:30', ...fila() }]);
  const r = await crearServicioLecturas({ bd }).serie({ desde: '2026-11-22 00:00:00', hasta: '2026-11-22 23:59:59', dias: 1 });
  expect(r.agrupacion).toBe('crudo');
  expect(r.puntos[0].t).toBe('2026-11-22 14:05:30');
  expect(r.puntos[0].oxigeno).toEqual({ prom: 18.63, min: 18.63, max: 18.63 });
  expect(r.puntos[0].ccr_o2_ref).toEqual({ prom: null, min: null, max: null });
  expect(query.mock.calls[0][1]).toEqual(['HORNO-INCOL', '2026-11-22 00:00:00', '2026-11-22 23:59:59']);
  expect(query.mock.calls[0][0]).not.toMatch(/GROUP BY/);
});

test('serie por hora agrupa con promedio redondeado, mínimo y máximo', async () => {
  const { bd, query } = bdFalsa([{ t: '2026-11-22 14:00:00', oxigeno_prom: '18.6166', oxigeno_min: '18.61', oxigeno_max: '18.63' }]);
  const r = await crearServicioLecturas({ bd }).serie({ desde: '2026-11-15 00:00:00', hasta: '2026-11-22 23:59:59', dias: 8 });
  expect(r.agrupacion).toBe('hora');
  expect(r.puntos[0].oxigeno).toEqual({ prom: 18.62, min: 18.61, max: 18.63 });
  expect(query.mock.calls[0][0]).toMatch(/%Y-%m-%d %H:00:00/);
  expect(query.mock.calls[0][0]).toMatch(/GROUP BY t ORDER BY t/);
});

test('serie por día usa el formato de fecha', async () => {
  const { bd, query } = bdFalsa([]);
  const r = await crearServicioLecturas({ bd }).serie({ desde: '2026-01-01 00:00:00', hasta: '2026-11-22 23:59:59', dias: 325 });
  expect(r).toEqual({ agrupacion: 'dia', puntos: [] });
  expect(query.mock.calls[0][0]).toMatch(/'%Y-%m-%d'\) AS t/);
});

test('listar pagina de más reciente a más antiguo con total', async () => {
  const { bd, query } = bdFalsa([{ total: 120 }], [fila()]);
  const r = await crearServicioLecturas({ bd }).listar({ desde: 'a', hasta: 'b', pagina: 3, tamano: 50 });
  expect(r.total).toBe(120);
  expect(r.pagina).toBe(3);
  expect(r.tamano).toBe(50);
  expect(r.filas[0].oxigeno).toBe(18.63);
  expect(query.mock.calls[1][0]).toMatch(/ORDER BY registrado_en DESC, id_local DESC LIMIT \? OFFSET \?/);
  expect(query.mock.calls[1][1]).toEqual(['HORNO-INCOL', 'a', 'b', 50, 100]);
});

test('filasParaExcel ordena de más antiguo a más reciente', async () => {
  const { bd, query } = bdFalsa([fila()]);
  const filas = await crearServicioLecturas({ bd }).filasParaExcel({ desde: 'a', hasta: 'b' });
  expect(filas).toHaveLength(1);
  expect(query.mock.calls[0][0]).toMatch(/ORDER BY registrado_en, id_local$/);
});
```

- [ ] **Step 2: Correrlas y verlas fallar**

Run: `cd "BE" && npx jest src/horno/__tests__/rango.test.js src/horno/__tests__/lecturas.service.test.js`
Expected: FAIL `Cannot find module`

- [ ] **Step 3: Implementar**

`BE/src/horno/utils/rango.js`:

```js
// Rango de fechas de las consultas. Las fechas son DATETIME en hora de Colombia: se validan y se devuelven
// como texto 'YYYY-MM-DD HH:mm:ss' para pasarlas tal cual a MySQL (sin conversión de zona).
const HornoError = require('./HornoError');

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const dos = (n) => String(n).padStart(2, '0');

function leerFecha(texto, finDeDia) {
  if (typeof texto !== 'string') return null;
  const m = FORMATO.exec(texto.trim());
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const soloFecha = m[4] === undefined;
  const h = soloFecha ? (finDeDia ? 23 : 0) : Number(m[4]);
  const mi = soloFecha ? (finDeDia ? 59 : 0) : Number(m[5]);
  const s = soloFecha ? (finDeDia ? 59 : 0) : Number(m[6] ?? 0);
  if (h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(anio, mes - 1, dia, h, mi, s);
  const f = new Date(ms);
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null; // 30 de febrero
  return { texto: `${anio}-${dos(mes)}-${dos(dia)} ${dos(h)}:${dos(mi)}:${dos(s)}`, ms };
}

function leerRango(query = {}, { maxDias = 366 } = {}) {
  const desde = leerFecha(query.desde, false);
  const hasta = leerFecha(query.hasta, true);
  if (!desde || !hasta) {
    throw new HornoError(400, 'VALIDACION', 'Indica desde y hasta con formato AAAA-MM-DD o AAAA-MM-DD HH:mm:ss');
  }
  if (hasta.ms < desde.ms) throw new HornoError(400, 'VALIDACION', 'La fecha final debe ser posterior a la inicial');
  const dias = (hasta.ms - desde.ms) / 86400000;
  if (dias > maxDias) throw new HornoError(400, 'VALIDACION', `El rango no puede superar ${maxDias} días`);
  return { desde: desde.texto, hasta: hasta.texto, dias };
}

module.exports = { leerRango };
```

`BE/src/horno/services/lecturas.service.js`:

```js
// Consultas de solo lectura sobre horno.lecturas (MySQL central). Las 8 variables se definen aquí una vez
// y de aquí salen el SQL, la serie de las gráficas y las columnas del Excel.
const VARIABLES = Object.freeze([
  { campo: 'temp_combustion', etiqueta: 'Temp. combustión', unidad: '°C', decimales: 1 },
  { campo: 'temp_postcombustion', etiqueta: 'Temp. postcombustión', unidad: '°C', decimales: 1 },
  { campo: 'temp_chimenea', etiqueta: 'Temp. chimenea', unidad: '°C', decimales: 1 },
  { campo: 'co', etiqueta: 'CO', unidad: 'ppm', decimales: 1 },
  { campo: 'oxigeno', etiqueta: 'Oxígeno', unidad: '%', decimales: 2 },
  { campo: 'co_mg_m3', etiqueta: 'CO', unidad: 'mg/m³', decimales: 3 },
  { campo: 'ccr', etiqueta: 'Ccr', unidad: null, decimales: 1 },
  { campo: 'ccr_o2_ref', etiqueta: 'Ccr O2 ref.', unidad: null, decimales: 1 },
]);

const EQUIPO = 'HORNO-INCOL';
const LIMITE_EXCEL = 100000;
const CAMPOS = VARIABLES.map((v) => v.campo).join(', ');
// DATE_FORMAT: el texto sale tal cual está en la base (hora de Colombia), sin que mysql2 lo convierta a Date.
const COLUMNAS = `id_local, DATE_FORMAT(registrado_en, '%Y-%m-%d %H:%i:%s') AS registrado_en, `
  + `DATE_FORMAT(fecha_hmi, '%Y-%m-%d %H:%i:%s') AS fecha_hmi, ${CAMPOS}`;
const EN_RANGO = 'equipo = ? AND registrado_en BETWEEN ? AND ?';
const FORMATO_GRUPO = Object.freeze({ hora: '%Y-%m-%d %H:00:00', dia: '%Y-%m-%d' });

// mysql2 entrega DECIMAL como texto.
function numero(v, decimales) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return decimales === undefined ? n : Number(n.toFixed(decimales));
}

function agrupacionPara(dias) {
  if (dias <= 2) return 'crudo';
  if (dias <= 31) return 'hora';
  return 'dia';
}

function lectura(f) {
  const salida = { id: Number(f.id_local), registrado_en: f.registrado_en, fecha_hmi: f.fecha_hmi ?? null };
  for (const v of VARIABLES) salida[v.campo] = numero(f[v.campo]);
  return salida;
}

function crearServicioLecturas({ bd, equipo = EQUIPO }) {
  const consultar = async (sql, params) => {
    const [filas] = await bd.obtener().query(sql, params);
    return filas;
  };

  async function contar({ desde, hasta }) {
    const [f] = await consultar(`SELECT COUNT(*) AS total FROM lecturas WHERE ${EN_RANGO}`, [equipo, desde, hasta]);
    return Number(f.total);
  }

  return {
    contar,

    async ultima() {
      const filas = await consultar(
        `SELECT ${COLUMNAS}, TIMESTAMPDIFF(MINUTE, registrado_en, NOW()) AS minutos_sin_datos `
        + 'FROM lecturas WHERE equipo = ? ORDER BY registrado_en DESC, id_local DESC LIMIT 1',
        [equipo],
      );
      if (filas.length === 0) return { lectura: null, minutosSinDatos: null };
      return { lectura: lectura(filas[0]), minutosSinDatos: Number(filas[0].minutos_sin_datos) };
    },

    async serie({ desde, hasta, dias }) {
      const agrupacion = agrupacionPara(dias);
      if (agrupacion === 'crudo') {
        const filas = await consultar(
          `SELECT DATE_FORMAT(registrado_en, '%Y-%m-%d %H:%i:%s') AS t, ${CAMPOS} FROM lecturas `
          + `WHERE ${EN_RANGO} ORDER BY registrado_en, id_local`,
          [equipo, desde, hasta],
        );
        return {
          agrupacion,
          puntos: filas.map((f) => {
            const p = { t: f.t };
            for (const v of VARIABLES) {
              const n = numero(f[v.campo]);
              p[v.campo] = { prom: n, min: n, max: n };
            }
            return p;
          }),
        };
      }
      const agregados = VARIABLES
        .map(({ campo }) => `AVG(${campo}) AS ${campo}_prom, MIN(${campo}) AS ${campo}_min, MAX(${campo}) AS ${campo}_max`)
        .join(', ');
      const filas = await consultar(
        `SELECT DATE_FORMAT(registrado_en, '${FORMATO_GRUPO[agrupacion]}') AS t, ${agregados} FROM lecturas `
        + `WHERE ${EN_RANGO} GROUP BY t ORDER BY t`,
        [equipo, desde, hasta],
      );
      return {
        agrupacion,
        puntos: filas.map((f) => {
          const p = { t: f.t };
          for (const v of VARIABLES) {
            p[v.campo] = {
              prom: numero(f[`${v.campo}_prom`], v.decimales),
              min: numero(f[`${v.campo}_min`]),
              max: numero(f[`${v.campo}_max`]),
            };
          }
          return p;
        }),
      };
    },

    async listar({ desde, hasta, pagina, tamano }) {
      const total = await contar({ desde, hasta });
      const filas = await consultar(
        `SELECT ${COLUMNAS} FROM lecturas WHERE ${EN_RANGO} ORDER BY registrado_en DESC, id_local DESC LIMIT ? OFFSET ?`,
        [equipo, desde, hasta, tamano, (pagina - 1) * tamano],
      );
      return { filas: filas.map(lectura), total, pagina, tamano };
    },

    async filasParaExcel({ desde, hasta }) {
      const filas = await consultar(
        `SELECT ${COLUMNAS} FROM lecturas WHERE ${EN_RANGO} ORDER BY registrado_en, id_local`,
        [equipo, desde, hasta],
      );
      return filas.map(lectura);
    },
  };
}

module.exports = { crearServicioLecturas, agrupacionPara, VARIABLES, LIMITE_EXCEL };
```

- [ ] **Step 4: Correr y ver pasar**

Run: `cd "BE" && npx jest src/horno`
Expected: PASS (todas)

- [ ] **Step 5: Commit**

```bash
cd "BE" && git add src/horno && git commit -m "feat(horno): rango de fechas y consultas de lecturas con agrupación automática

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rutas de lecturas y descarga en Excel

**Files:**
- Create: `BE/src/horno/services/lecturasXlsx.js`, `BE/src/horno/routes/lecturas.routes.js`
- Modify: `BE/src/horno/routes/index.js`, `BE/src/horno/testing/appPrueba.js`
- Test: `BE/src/horno/__tests__/lecturas.routes.test.js`

**Interfaces:**
- Consumes: `leerRango`, `crearServicioLecturas`, `VARIABLES`, `LIMITE_EXCEL` (Task 3); `apiCodigo`, `crearAutenticacion` (Task 2).
- Produces: `escribirLecturasXlsx(stream, filas)`; `crearRouterLecturas({autenticar, lecturas})` con `GET /lecturas/ultima` (HOR-LEC-001), `/lecturas/serie` (HOR-LEC-002), `/lecturas` (HOR-LEC-003), `/lecturas.xlsx` (HOR-LEC-004).

- [ ] **Step 1: Escribir la prueba que falla** — `BE/src/horno/__tests__/lecturas.routes.test.js`

```js
const request = require('supertest');
const ExcelJS = require('exceljs');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const P = '/api/horno/v1';
const get = async (app, ruta) => request(await servir(app)).get(`${P}${ruta}`).set('Authorization', `Bearer ${tokenDe()}`);
const binario = (res, cb) => {
  const partes = [];
  res.on('data', (c) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};
const LECTURA = {
  id: 16, registrado_en: '2026-11-22 14:05:30', fecha_hmi: '2026-11-22 14:05:30',
  temp_combustion: 338, temp_postcombustion: 469, temp_chimenea: 102, co: 4,
  oxigeno: 18.63, co_mg_m3: 4.576, ccr: 4.7, ccr_o2_ref: 19.7,
};

test('todas las rutas de lecturas exigen token', async () => {
  const { app } = crearAppPrueba();
  for (const [ruta, codigo] of [
    ['/lecturas/ultima', 'HOR-LEC-001'], ['/lecturas/serie', 'HOR-LEC-002'],
    ['/lecturas', 'HOR-LEC-003'], ['/lecturas.xlsx', 'HOR-LEC-004'],
  ]) {
    const r = await request(await servir(app)).get(`${P}${ruta}`);
    expect([ruta, r.status, r.body.error]).toEqual([ruta, 401, codigo]);
  }
});

test('/lecturas/ultima devuelve lo del servicio', async () => {
  const { app, deps } = crearAppPrueba();
  deps.lecturas.ultima.mockResolvedValue({ lectura: LECTURA, minutosSinDatos: 2 });
  const r = await get(app, '/lecturas/ultima');
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ success: true, data: { lectura: LECTURA, minutosSinDatos: 2 } });
});

test('/lecturas/serie valida el rango y pasa los días al servicio', async () => {
  const { app, deps } = crearAppPrueba();
  deps.lecturas.serie.mockResolvedValue({ agrupacion: 'crudo', puntos: [] });
  const r = await get(app, '/lecturas/serie?desde=2026-11-22&hasta=2026-11-22');
  expect(r.status).toBe(200);
  expect(deps.lecturas.serie).toHaveBeenCalledWith({
    desde: '2026-11-22 00:00:00', hasta: '2026-11-22 23:59:59', dias: 86399 / 86400,
  });
  const malo = await get(app, '/lecturas/serie?desde=hoy');
  expect(malo.status).toBe(400);
  expect(malo.body.motivo).toBe('VALIDACION');
});

test('/lecturas pagina con valores por defecto y valida página y tamaño', async () => {
  const { app, deps } = crearAppPrueba();
  deps.lecturas.listar.mockResolvedValue({ filas: [], total: 0, pagina: 1, tamano: 50 });
  const r = await get(app, '/lecturas?desde=2026-11-01&hasta=2026-11-22');
  expect(r.status).toBe(200);
  expect(deps.lecturas.listar).toHaveBeenCalledWith(expect.objectContaining({ pagina: 1, tamano: 50, desde: '2026-11-01 00:00:00' }));
  for (const q of ['pagina=0', 'tamano=501', 'tamano=abc']) {
    const malo = await get(app, `/lecturas?desde=2026-11-01&hasta=2026-11-22&${q}`);
    expect([q, malo.status]).toEqual([q, 400]);
  }
});

test('/lecturas.xlsx entrega un Excel con encabezados y filas', async () => {
  const { app, deps } = crearAppPrueba();
  deps.lecturas.contar.mockResolvedValue(1);
  deps.lecturas.filasParaExcel.mockResolvedValue([LECTURA]);
  const r = await request(await servir(app)).get(`${P}/lecturas.xlsx?desde=2026-11-01&hasta=2026-11-22`)
    .set('Authorization', `Bearer ${tokenDe()}`).buffer(true).parse(binario);
  expect(r.status).toBe(200);
  expect(r.headers['content-type']).toMatch(/spreadsheetml/);
  expect(r.headers['content-disposition']).toBe('attachment; filename="horno_incol_20261101_20261122.xlsx"');
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(r.body);
  const hoja = libro.getWorksheet('Lecturas');
  expect(hoja.getRow(1).values.slice(1)).toEqual([
    'Fecha y hora', 'Temp. combustión (°C)', 'Temp. postcombustión (°C)', 'Temp. chimenea (°C)',
    'CO (ppm)', 'Oxígeno (%)', 'CO (mg/m³)', 'Ccr', 'Ccr O2 ref.',
  ]);
  expect(hoja.getRow(2).values.slice(1)).toEqual(['2026-11-22 14:05:30', 338, 469, 102, 4, 18.63, 4.576, 4.7, 19.7]);
});

test('/lecturas.xlsx responde 413 si supera el límite', async () => {
  const { app, deps } = crearAppPrueba();
  deps.lecturas.contar.mockResolvedValue(100001);
  const r = await get(app, '/lecturas.xlsx?desde=2026-01-01&hasta=2026-11-22');
  expect(r.status).toBe(413);
  expect(r.body).toMatchObject({ error: 'HOR-LEC-004', motivo: 'DEMASIADOS_REGISTROS' });
  expect(deps.lecturas.filasParaExcel).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `cd "BE" && npx jest src/horno/__tests__/lecturas.routes.test.js`
Expected: FAIL (`deps.lecturas` es undefined / 404)

- [ ] **Step 3: Implementar**

`BE/src/horno/services/lecturasXlsx.js`:

```js
// Excel de lecturas en streaming (no arma el libro completo en memoria).
const ExcelJS = require('exceljs');
const { VARIABLES } = require('./lecturas.service');

const columnas = () => [
  { header: 'Fecha y hora', key: 'registrado_en', width: 20 },
  ...VARIABLES.map((v) => ({
    header: v.unidad ? `${v.etiqueta} (${v.unidad})` : v.etiqueta,
    key: v.campo,
    width: 20,
    style: { numFmt: `0.${'0'.repeat(v.decimales)}` },
  })),
];

async function escribirLecturasXlsx(stream, filas) {
  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  const hoja = libro.addWorksheet('Lecturas', { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = columnas();
  hoja.getRow(1).font = { bold: true };
  for (const f of filas) hoja.addRow(f).commit();
  hoja.commit();
  await libro.commit();
}

module.exports = { escribirLecturasXlsx };
```

`BE/src/horno/routes/lecturas.routes.js`:

```js
// Lecturas del horno: valor actual, serie para gráficas, tabla paginada y Excel.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const HornoError = require('../utils/HornoError');
const aw = require('../utils/aw');
const { leerRango } = require('../utils/rango');
const { LIMITE_EXCEL } = require('../services/lecturas.service');
const { escribirLecturasXlsx } = require('../services/lecturasXlsx');

function leerPaginacion(query) {
  const pagina = query.pagina === undefined ? 1 : Number(query.pagina);
  const tamano = query.tamano === undefined ? 50 : Number(query.tamano);
  if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(tamano) || tamano < 1 || tamano > 500) {
    throw new HornoError(400, 'VALIDACION', 'pagina debe ser 1 o más y tamano entre 1 y 500');
  }
  return { pagina, tamano };
}

const compacta = (texto) => texto.slice(0, 10).replace(/-/g, '');

function crearRouterLecturas({ autenticar, lecturas }) {
  const router = express.Router();

  router.get('/lecturas/ultima', apiCodigo('HOR-LEC-001'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await lecturas.ultima() });
  }));

  router.get('/lecturas/serie', apiCodigo('HOR-LEC-002'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await lecturas.serie(leerRango(req.query)) });
  }));

  router.get('/lecturas', apiCodigo('HOR-LEC-003'), autenticar, aw(async (req, res) => {
    const { desde, hasta } = leerRango(req.query);
    res.json({ success: true, data: await lecturas.listar({ desde, hasta, ...leerPaginacion(req.query) }) });
  }));

  router.get('/lecturas.xlsx', apiCodigo('HOR-LEC-004'), autenticar, aw(async (req, res) => {
    const { desde, hasta } = leerRango(req.query);
    const total = await lecturas.contar({ desde, hasta });
    if (total > LIMITE_EXCEL) {
      throw new HornoError(413, 'DEMASIADOS_REGISTROS',
        `El rango tiene ${total} registros y el máximo por descarga es ${LIMITE_EXCEL}. Reduce el rango.`);
    }
    const filas = await lecturas.filasParaExcel({ desde, hasta });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="horno_incol_${compacta(desde)}_${compacta(hasta)}.xlsx"`);
    await escribirLecturasXlsx(res, filas);
  }));

  return router;
}

module.exports = { crearRouterLecturas };
```

En `BE/src/horno/routes/index.js`:
1. Agregar los require después de `const { crearRouterAuth } = require('./auth.routes');`:

```js
const { crearRouterLecturas } = require('./lecturas.routes');
const { crearServicioLecturas } = require('../services/lecturas.service');
```

2. Cambiar la firma y montar el router (antes del 404):

```js
function crearRouterHorno({ bd, obtenerConfig, directorio, lecturas = crearServicioLecturas({ bd }) }) {
```

```js
  router.use('/auth', crearRouterAuth({ obtenerConfig, directorio, autenticar }));
  router.use(crearRouterLecturas({ autenticar, lecturas }));
```

3. Actualizar el comentario de la fábrica: `/** Fábrica inyectable (tests). \`bd\` = { ping(), obtener() }; \`directorio\` = { validarCredenciales }; \`lecturas\` se construye desde \`bd\`. */`

En `BE/src/horno/testing/appPrueba.js`, dentro de `todas`, después de `directorio`:

```js
    lecturas: {
      ultima: jest.fn(async () => ({ lectura: null, minutosSinDatos: null })),
      serie: jest.fn(async () => ({ agrupacion: 'crudo', puntos: [] })),
      listar: jest.fn(async () => ({ filas: [], total: 0, pagina: 1, tamano: 50 })),
      contar: jest.fn(async () => 0),
      filasParaExcel: jest.fn(async () => []),
    },
```

- [ ] **Step 4: Correr y ver pasar**

Run: `cd "BE" && npx jest src/horno`
Expected: PASS (todas)

- [ ] **Step 5: Commit**

```bash
cd "BE" && git add src/horno && git commit -m "feat(horno): rutas de lecturas, serie para gráficas y descarga en Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Montaje en Mantix y documentación Swagger

**Files:**
- Modify: `BE/src/routes/index.js` (require + mount), `BE/src/app.js` (exención del limitador + errorHandler del parser), `BE/src/config/swagger.js`
- Create: `BE/src/horno/docs/openapi.yaml`
- Test: `BE/src/horno/__tests__/montaje.test.js`, `BE/src/horno/__tests__/swagger.test.js`

**Interfaces:**
- Consumes: `router` de `src/horno/routes` (Task 2/4), `hornoErrorHandler` (Task 2).
- Produces: módulo accesible en `/api/horno/v1/*` de la app real y documentado en `/api-docs`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`BE/src/horno/__tests__/montaje.test.js`:

```js
// Carga la app real de Mantix: montaje en /api/horno/v1, 503 si falta configuración y exención del limitador global.
process.env.RATE_LIMIT_MAX_REQUESTS = '2';
const VARIABLES = ['HORNO_DB_HOST', 'HORNO_DB_PORT', 'HORNO_DB_USER', 'HORNO_DB_PASSWORD', 'HORNO_DB_NAME',
  'HORNO_JWT_SECRET', 'HORNO_JWT_EXPIRES', 'HORNO_GRUPO_AD', 'LDAP_URL', 'LDAP_BASE_DN', 'LDAP_BIND_USER',
  'LDAP_BIND_PASS', 'JWT_SECRET'];
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const app = require('../../app');

afterEach(cerrarServidores);
beforeEach(() => { for (const v of VARIABLES) delete process.env[v]; });

const completas = () => Object.assign(process.env, {
  HORNO_DB_HOST: '127.0.0.1', HORNO_DB_PORT: '1', HORNO_DB_USER: 'u', HORNO_DB_PASSWORD: 'p',
  HORNO_JWT_SECRET: 'h'.repeat(40),
  LDAP_URL: 'ldap://127.0.0.1:1', LDAP_BASE_DN: 'DC=x', LDAP_BIND_USER: 'u', LDAP_BIND_PASS: 'p',
});

test('sin configuración responde 503 HORNO_DESHABILITADO y Mantix sigue vivo', async () => {
  const r = await request(await servir(app)).get('/api/horno/v1/health');
  expect(r.status).toBe(503);
  expect(r.body).toEqual({
    success: false, error: 'HOR-SIS-000', motivo: 'HORNO_DESHABILITADO',
    message: 'El módulo del horno no está disponible: configuración del servidor incompleta',
  });
  expect(JSON.stringify(r.body)).not.toMatch(/HORNO_DB|LDAP|JWT/);
});

test('secreto igual al de Mantix también deshabilita el módulo', async () => {
  completas();
  process.env.JWT_SECRET = process.env.HORNO_JWT_SECRET;
  const r = await request(await servir(app)).get('/api/horno/v1/health');
  expect(r.body.motivo).toBe('HORNO_DESHABILITADO');
});

test('con configuración completa las rutas están montadas', async () => {
  completas();
  const health = await request(await servir(app)).get('/api/horno/v1/health');
  expect(health.status).toBe(503); // la BD de prueba (puerto 1) no responde
  expect(health.body.error).toBe('HOR-SIS-001');
  const login = await request(await servir(app)).post('/api/horno/v1/auth/login').send({});
  expect([login.status, login.body.error]).toEqual([400, 'HOR-AUT-001']);
  const ultima = await request(await servir(app)).get('/api/horno/v1/lecturas/ultima');
  expect([ultima.status, ultima.body.error]).toEqual([401, 'HOR-LEC-001']);
});

test('/api/horno/ está exento del limitador global', async () => {
  for (let i = 0; i < 4; i++) {
    const r = await request(await servir(app)).get('/api/horno/v1/health');
    expect(r.status).toBe(503);
  }
});

test('JSON inválido en /api/horno responde con el contrato del módulo', async () => {
  const r = await request(await servir(app))
    .post('/api/horno/v1/auth/login').set('Content-Type', 'application/json').send('{malo');
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ success: false, motivo: 'VALIDACION', message: 'JSON inválido' });
});
```

`BE/src/horno/__tests__/swagger.test.js`:

```js
// Toda ruta del módulo está documentada en /api-docs.
const spec = require('../../config/swagger');

const P = '/api/horno/v1';
const ESPERADAS = {
  [`${P}/health`]: ['get'],
  [`${P}/auth/login`]: ['post'],
  [`${P}/auth/me`]: ['get'],
  [`${P}/lecturas/ultima`]: ['get'],
  [`${P}/lecturas/serie`]: ['get'],
  [`${P}/lecturas`]: ['get'],
  [`${P}/lecturas.xlsx`]: ['get'],
};

test('documenta cada ruta del horno con sus métodos', () => {
  for (const [ruta, metodos] of Object.entries(ESPERADAS)) {
    expect([ruta, Object.keys(spec.paths[ruta] || {}).sort()]).toEqual([ruta, [...metodos].sort()]);
  }
  const propias = Object.keys(spec.paths).filter((r) => r.startsWith(P)).sort();
  expect(propias).toEqual(Object.keys(ESPERADAS).sort());
});

test('cada operación lleva tag, código de API y el esquema de error del módulo', () => {
  for (const ruta of Object.keys(ESPERADAS)) {
    for (const [metodo, op] of Object.entries(spec.paths[ruta])) {
      expect([ruta, metodo, op.tags]).toEqual([ruta, metodo, ['Horno INCOL']]);
      expect(op.summary).toMatch(/^HOR-[A-Z]{3}-\d{3} · /);
    }
  }
  expect(spec.components.schemas.HornoError.required).toEqual(['success', 'error', 'motivo', 'message']);
});
```

- [ ] **Step 2: Correrlas y verlas fallar**

Run: `cd "BE" && npx jest src/horno/__tests__/montaje.test.js src/horno/__tests__/swagger.test.js`
Expected: FAIL (404 en `/api/horno/v1/health`; rutas no documentadas)

- [ ] **Step 3: Implementar**

`BE/src/routes/index.js`: después de la línea 53 (`const dueloRoutes = …`) agregar

```js
const hornoRoutes = require('../horno/routes').router;       // ← Módulo Horno INCOL
```

y después de `router.use('/duelo/v1', dueloRoutes);` agregar

```js
router.use('/horno/v1', hornoRoutes);       // ← Módulo Horno INCOL (lecturas del horno, login AD propio)
```

`BE/src/app.js`:
1. En el comentario del limitador agregar la línea `// Horno INCOL: varios operadores de planta salen por la misma IP; el módulo aplica su propio límite en el login.` y cambiar el `skip` a:

```js
  skip: (req) => req.originalUrl.startsWith('/api/trk/') || req.originalUrl.startsWith('/api/bigday/')
    || req.originalUrl.startsWith('/api/porteria/') || req.originalUrl.startsWith('/api/masajes/')
    || req.originalUrl.startsWith('/api/duelo/') || req.originalUrl.startsWith('/api/horno/')
```

2. Después de `app.use('/api/porteria', require('./porteria/middleware/errorHandler').porteriaErrorHandler);` agregar:

```js
// Horno INCOL: errores del body parser en /api/horno/* con el contrato del módulo
app.use('/api/horno', require('./horno/middleware/errorHandler').hornoErrorHandler);
```

`BE/src/config/swagger.js`: cambiar el final del arreglo `apis` a

```js
    './src/porteria/docs/*.yaml',
    './src/masajes/docs/*.yaml',
    './src/horno/docs/*.yaml'
  ]
```

`BE/src/horno/docs/openapi.yaml`:

```yaml
# Documentación del módulo Horno INCOL (/api/horno/v1). Token propio del módulo: POST /auth/login.
components:
  securitySchemes:
    HornoBearer:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: Token de POST /api/horno/v1/auth/login (scope horno)
  parameters:
    HornoDesde:
      in: query
      name: desde
      required: true
      schema: { type: string, example: '2026-11-22 00:00:00' }
      description: AAAA-MM-DD o AAAA-MM-DD HH:mm:ss (hora de Colombia)
    HornoHasta:
      in: query
      name: hasta
      required: true
      schema: { type: string, example: '2026-11-22' }
      description: AAAA-MM-DD (incluye todo el día) o AAAA-MM-DD HH:mm:ss. Máximo 366 días después de desde.
  schemas:
    HornoError:
      type: object
      required: [success, error, motivo, message]
      properties:
        success: { type: boolean, example: false }
        error: { type: string, example: HOR-AUT-001, description: Código de la API que respondió }
        motivo: { type: string, example: SIN_ACCESO }
        message: { type: string }
    HornoLectura:
      type: object
      properties:
        id: { type: integer, example: 16 }
        registrado_en: { type: string, example: '2026-11-22 14:05:30' }
        fecha_hmi: { type: string, nullable: true }
        temp_combustion: { type: number, nullable: true }
        temp_postcombustion: { type: number, nullable: true }
        temp_chimenea: { type: number, nullable: true }
        co: { type: number, nullable: true }
        oxigeno: { type: number, nullable: true }
        co_mg_m3: { type: number, nullable: true }
        ccr: { type: number, nullable: true }
        ccr_o2_ref: { type: number, nullable: true }
  responses:
    HornoErrorResp:
      description: Error del módulo
      content:
        application/json:
          schema: { $ref: '#/components/schemas/HornoError' }
paths:
  /api/horno/v1/health:
    get:
      tags: [Horno INCOL]
      summary: HOR-SIS-001 · Estado del módulo y de la base del horno
      responses:
        '200': { description: Base disponible }
        '503': { $ref: '#/components/responses/HornoErrorResp' }
  /api/horno/v1/auth/login:
    post:
      tags: [Horno INCOL]
      summary: HOR-AUT-001 · Login con usuario de red (grupo INCOL_APP)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [usuario, password]
              properties:
                usuario: { type: string, example: jperez }
                password: { type: string, format: password }
      responses:
        '200': { description: 'data: { token, user: { usuario, nombre, email } }' }
        '400': { $ref: '#/components/responses/HornoErrorResp' }
        '401': { $ref: '#/components/responses/HornoErrorResp' }
        '403': { $ref: '#/components/responses/HornoErrorResp' }
        '429': { $ref: '#/components/responses/HornoErrorResp' }
        '503': { $ref: '#/components/responses/HornoErrorResp' }
  /api/horno/v1/auth/me:
    get:
      tags: [Horno INCOL]
      summary: HOR-AUT-002 · Usuario de la sesión
      security: [{ HornoBearer: [] }]
      responses:
        '200': { description: 'data: { user }' }
        '401': { $ref: '#/components/responses/HornoErrorResp' }
  /api/horno/v1/lecturas/ultima:
    get:
      tags: [Horno INCOL]
      summary: HOR-LEC-001 · Última lectura y minutos sin datos
      security: [{ HornoBearer: [] }]
      responses:
        '200':
          description: 'data: { lectura (null si no hay), minutosSinDatos }'
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  data:
                    type: object
                    properties:
                      lectura: { $ref: '#/components/schemas/HornoLectura' }
                      minutosSinDatos: { type: integer, nullable: true }
        '401': { $ref: '#/components/responses/HornoErrorResp' }
  /api/horno/v1/lecturas/serie:
    get:
      tags: [Horno INCOL]
      summary: HOR-LEC-002 · Serie para gráficas (crudo ≤ 2 días, por hora ≤ 31 días, por día)
      security: [{ HornoBearer: [] }]
      parameters:
        - $ref: '#/components/parameters/HornoDesde'
        - $ref: '#/components/parameters/HornoHasta'
      responses:
        '200': { description: 'data: { agrupacion: crudo|hora|dia, puntos: [{ t, <variable>: { prom, min, max } }] }' }
        '400': { $ref: '#/components/responses/HornoErrorResp' }
        '401': { $ref: '#/components/responses/HornoErrorResp' }
  /api/horno/v1/lecturas:
    get:
      tags: [Horno INCOL]
      summary: HOR-LEC-003 · Lecturas paginadas (más recientes primero)
      security: [{ HornoBearer: [] }]
      parameters:
        - $ref: '#/components/parameters/HornoDesde'
        - $ref: '#/components/parameters/HornoHasta'
        - { in: query, name: pagina, schema: { type: integer, minimum: 1, default: 1 } }
        - { in: query, name: tamano, schema: { type: integer, minimum: 1, maximum: 500, default: 50 } }
      responses:
        '200': { description: 'data: { filas: HornoLectura[], total, pagina, tamano }' }
        '400': { $ref: '#/components/responses/HornoErrorResp' }
        '401': { $ref: '#/components/responses/HornoErrorResp' }
  /api/horno/v1/lecturas.xlsx:
    get:
      tags: [Horno INCOL]
      summary: HOR-LEC-004 · Descarga en Excel (máximo 100 000 filas)
      security: [{ HornoBearer: [] }]
      parameters:
        - $ref: '#/components/parameters/HornoDesde'
        - $ref: '#/components/parameters/HornoHasta'
      responses:
        '200':
          description: Archivo horno_incol_AAAAMMDD_AAAAMMDD.xlsx
          content:
            application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
              schema: { type: string, format: binary }
        '400': { $ref: '#/components/responses/HornoErrorResp' }
        '401': { $ref: '#/components/responses/HornoErrorResp' }
        '413': { $ref: '#/components/responses/HornoErrorResp' }
```

- [ ] **Step 4: Correr y ver pasar, y no romper a Portería**

Run: `cd "BE" && npx jest src/horno src/porteria/__tests__/montaje.test.js src/porteria/__tests__/swagger.test.js`
Expected: PASS (todas)

- [ ] **Step 5: Commit**

```bash
cd "BE" && git add src/horno src/routes/index.js src/app.js src/config/swagger.js && git commit -m "feat(horno): monta el módulo en /api/horno/v1 y lo documenta en Swagger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Runbook de despliegue y usuario de solo lectura

**Files:**
- Create: `BE/docs/horno/despliegue.md`
- Create: `/Users/bortega/Documents/Documents/eserver/mysql/05_usuario_incol_api.sql` (proyecto eserver, sin git)

- [ ] **Step 1: Crear el SQL** — `/Users/bortega/Documents/Documents/eserver/mysql/05_usuario_incol_api.sql`

```sql
-- =====================================================================
--  Usuario de SOLO LECTURA para la API del horno (mantix-backend, módulo Horno).
--  Ejecutar en el servidor central 192.9.17.30 con root.
--  Cambiar la clave. Si se conoce la IP del servidor de mantix-api,
--  reemplazar '%' por esa IP (y en el GRANT y SHOW GRANTS también).
-- =====================================================================
CREATE USER IF NOT EXISTS 'incol_api'@'%' IDENTIFIED BY 'CAMBIAR_CLAVE_INCOL_API';
GRANT SELECT ON horno.* TO 'incol_api'@'%';
FLUSH PRIVILEGES;
SHOW GRANTS FOR 'incol_api'@'%';
```

- [ ] **Step 2: Crear el runbook** — `BE/docs/horno/despliegue.md`

````markdown
# Despliegue del módulo Horno INCOL

Cada paso dice cómo comprobarlo y cómo deshacerlo.

## 1. Conectividad del servidor de mantix-api con el MySQL central

En el servidor de mantix-api:

```bash
nc -vz 192.9.17.30 3306
```

Debe decir `succeeded`/`open`. Si no, abrir el puerto 3306 del central hacia ese servidor. Sin esto el
módulo responde 503 en `/health`.

## 2. Usuario de solo lectura en el central

Ejecutar `mysql/05_usuario_incol_api.sql` (proyecto eserver) en 192.9.17.30 con root, cambiando la clave.
Comprobar: `SHOW GRANTS FOR 'incol_api'@'%';` muestra solo `SELECT ON horno.*`.
Deshacer: `DROP USER 'incol_api'@'%';`

## 3. Grupo del AD

Crear el grupo de seguridad `INCOL_APP` y agregar a los usuarios **directamente** (un grupo dentro del
grupo no da acceso). Deshacer: quitar al usuario del grupo (el token vigente vence en `HORNO_JWT_EXPIRES`).

## 4. Variables en el `.env` del backend

Copiar las de `src/horno/horno.env.example`, con `HORNO_DB_PASSWORD` del paso 2 y
`HORNO_JWT_SECRET=$(openssl rand -hex 32)`. Agregar `http://192.9.17.11` a `CORS_ORIGIN`
(lista separada por comas). Deshacer: borrar las `HORNO_*` (el módulo queda en 503, Mantix sigue igual).

## 5. Código

```bash
cd /ruta/mantix-backend && ./scripts/deploy-mantix.sh
```

El script hace `git reset --hard origin/main`, `pm2 restart` y revierte solo si `/api-docs/` no responde.
Comprobar:

```bash
curl -s http://localhost:3020/api/horno/v1/health      # {"success":true,"data":{"estado":"ok","bd":"ok"}}
curl -s -X POST http://localhost:3020/api/horno/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"usuario":"<usuario>","password":"<clave>"}'      # 200 con token (o 403 si no está en INCOL_APP)
```

Si `/health` da `HORNO_DESHABILITADO`, revisar el log de pm2: dice qué variable falta.

## 6. Frontend `incol-frontend`

```bash
npm ci && npm run build
```

Copiar el contenido de `dist/` (incluido `.htaccess`) a `\\192.9.17.11\AppServ\www\incol\`.
Apache necesita `mod_rewrite` y `AllowOverride All` para `www`. Comprobar abriendo
`http://192.9.17.11/incol/` y recargando en `/incol/registros` (no debe dar 404).
Deshacer: restaurar la carpeta anterior o borrar `incol`.
````

- [ ] **Step 3: Verificar que la suite del módulo sigue verde**

Run: `cd "BE" && npx jest src/horno`
Expected: PASS

- [ ] **Step 4: Commit (solo el backend; el SQL queda en el proyecto eserver)**

```bash
cd "BE" && git add docs/horno/despliegue.md && git commit -m "docs(horno): runbook de despliegue del módulo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Base del frontend (Vite, Tailwind con estilos de Los Olivos, layout y rutas)

**Files (todo dentro de `FE`):**
- Create: `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `.gitignore`, `.env.development`, `.env.production`, `README.md`
- Create: `public/.htaccess`, `public/fonts/*` (copia), `public/logo-olivos.webp` (copia)
- Create: `src/main.js`, `src/App.vue`, `src/router/index.js`, `src/assets/styles/main.css`, `src/assets/styles/fonts.css` (copia)
- Create: `src/components/layout/AppSidebar.vue`, `src/components/layout/AppHeader.vue`
- Create: `src/stores/useAuthStore.js` (mínimo para el guard; se completa en Task 8), `src/api/http.js`, `src/api/hornoApi.js`
- Create: `src/views/LoginView.vue`, `src/views/MonitoreoView.vue`, `src/views/GraficasView.vue`, `src/views/RegistrosView.vue` (marcadores que se reemplazan en Tasks 8-11)

**Interfaces:**
- Produces: `sesion` (`token()`, `usuario()`, `guardar(token, usuario)`, `limpiar()`), `http` (axios), `mensajeDeError(err, porDefecto)`; `hornoApi` = `{ login(usuario,password)→{token,user}, me()→{user}, ultima()→{lectura,minutosSinDatos}, serie(desde,hasta)→{agrupacion,puntos}, listar({desde,hasta,pagina,tamano})→{filas,total,pagina,tamano}, excel(desde,hasta)→AxiosResponse<Blob> }`; `useAuthStore()` = `{ usuario, token, iniciales, sesionVigente(), login(u,p), logout() }`; rutas `login`, `monitoreo`, `graficas`, `registros`.

- [ ] **Step 1: Crear el repo y copiar recursos de marca**

```bash
mkdir -p "FE" && cd "FE" && git init -b main
mkdir -p public/fonts src/assets/styles
cp ../crm-frontend/public/fonts/*.ttf public/fonts/
cp ../crm-frontend/src/assets/styles/fonts.css src/assets/styles/fonts.css
cp ../afiliacion-frontend/public/logo-olivos.webp public/logo-olivos.webp
```

- [ ] **Step 2: Archivos de proyecto**

`FE/package.json`:

```json
{
  "name": "incol-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@heroicons/vue": "^2.2.0",
    "axios": "^1.13.5",
    "chart.js": "^4.5.1",
    "dayjs": "^1.11.13",
    "pinia": "^3.0.4",
    "vue": "^3.5.25",
    "vue-chartjs": "^5.3.4",
    "vue-router": "^5.0.2"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.2",
    "autoprefixer": "^10.4.20",
    "jsdom": "^26.1.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.19",
    "vite": "^7.3.1",
    "vitest": "^4.0.0"
  }
}
```

> Si `npm install` no resuelve `vitest@^4`, usar la misma versión que `../crm-frontend/package.json` (`vitest`).

`FE/vite.config.js`:

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Publicado en http://192.9.17.11/incol/ (AppServ). VITE_BASE permite otro subdirectorio.
export default defineConfig({
  base: process.env.VITE_BASE || '/incol/',
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5174,
    proxy: { '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:3020', changeOrigin: true } },
  },
  test: { environment: 'jsdom' },
});
```

`FE/tailwind.config.js`:

```js
/** Tokens de Los Olivos (mismos de GenFlow / crm-frontend). */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6f7f1', 100: '#b3e6d4', 200: '#80d5b7', 300: '#4dc49a', 400: '#1ab37d',
          500: '#00875c', 600: '#006d4a', 700: '#005a3d', 800: '#004730', 900: '#003423',
        },
        cream: '#f9fafb',
        'brown-deep': '#004730',
        'brown-warm': '#005a3d',
        gold: '#00875c',
        'gold-bright': '#1ab37d',
        sage: '#16a34a',
        danger: '#dc2626',
        warning: '#f59e0b',
        text1: '#111827',
        text2: '#374151',
        text3: '#6b7280',
      },
      fontFamily: {
        serif: ['Comfortaa', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Raleway', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { sv: '10px' },
      boxShadow: {
        'sv-card': '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};
```

`FE/postcss.config.js`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`FE/index.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/webp" href="/logo-olivos.webp" />
    <title>Horno INCOL · Los Olivos</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

`FE/.gitignore`:

```
node_modules
dist
.env.local
*.log
.DS_Store
```

`FE/.env.development`:

```bash
# En desarrollo Vite redirige /api a mantix-backend local (VITE_PROXY_TARGET para otro destino)
VITE_API_URL=/api/horno/v1
```

`FE/.env.production`:

```bash
VITE_API_URL=https://mantix-api.losolivoscucuta.com:8444/api/horno/v1
```

`FE/README.md`:

```markdown
# incol-frontend

Monitoreo, gráficas y descarga de las lecturas del horno INCOL. API: módulo `/api/horno/v1` de mantix-backend.

- `npm run dev` — http://localhost:5174/incol/ (proxy de /api a localhost:3020)
- `npm test` — pruebas (Vitest)
- `npm run build` — genera `dist/`; copiar su contenido (incluido `.htaccess`) a `\\192.9.17.11\AppServ\www\incol\`

Acceso: usuarios del grupo `INCOL_APP` del directorio activo.
```

`FE/public/.htaccess`:

```apache
Options -MultiViews
RewriteEngine On
RewriteBase /incol/
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /incol/index.html [L]

<IfModule mod_headers.c>
  <FilesMatch "index\.html$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
  </FilesMatch>
  <FilesMatch "\.(js|css|ttf|webp)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
```

- [ ] **Step 3: Estilos, API, store mínimo, router y layout**

`FE/src/assets/styles/main.css`:

```css
@import './fonts.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body { @apply bg-cream text-text1 font-sans antialiased; }
  h1, h2, h3, h4 { @apply font-serif; }
}

@layer components {
  .sv-card { @apply bg-white rounded-sv shadow-sv-card border border-gray-100; }
  .sv-label { @apply block text-xs font-semibold text-text2 mb-1; }
  .sv-input {
    @apply w-full rounded-sv border border-gray-300 bg-white px-3 py-2 text-sm text-text1 outline-none
      focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20;
  }
  .sv-btn {
    @apply inline-flex items-center justify-center gap-2 rounded-sv px-4 py-2 text-sm font-semibold transition
      disabled:cursor-not-allowed disabled:opacity-50;
  }
  .sv-btn-primary { @apply sv-btn bg-gold text-white hover:bg-gold-bright; }
  .sv-btn-secondary { @apply sv-btn border border-primary-200 bg-white text-primary-700 hover:bg-primary-50; }
}
```

`FE/src/api/http.js`:

```js
import axios from 'axios';

const CLAVE_TOKEN = 'incol_token';
const CLAVE_USUARIO = 'incol_usuario';

export const sesion = {
  token: () => localStorage.getItem(CLAVE_TOKEN),
  usuario() {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_USUARIO) || 'null');
    } catch {
      return null;
    }
  },
  guardar(token, usuario) {
    localStorage.setItem(CLAVE_TOKEN, token);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
  },
  limpiar() {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
  },
};

export const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/horno/v1', timeout: 30000 });

http.interceptors.request.use((config) => {
  const token = sesion.token();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Sesión vencida: el token no se renueva; se limpia y se vuelve al login.
http.interceptors.response.use((r) => r, (err) => {
  const esLogin = String(err.config?.url || '').includes('/auth/login');
  if (err.response?.status === 401 && !esLogin) {
    sesion.limpiar();
    const login = `${import.meta.env.BASE_URL}login`;
    if (!window.location.pathname.endsWith('/login')) window.location.assign(login);
  }
  return Promise.reject(err);
});

export function mensajeDeError(err, porDefecto = 'Ocurrió un error inesperado') {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ECONNABORTED') return 'El servidor tardó demasiado en responder';
  if (err && !err.response) return 'No hay conexión con el servidor';
  return porDefecto;
}
```

`FE/src/api/hornoApi.js`:

```js
import { http } from './http';

const datos = (r) => r.data.data;

export const hornoApi = {
  login: (usuario, password) => http.post('/auth/login', { usuario, password }).then(datos),
  me: () => http.get('/auth/me').then(datos),
  ultima: () => http.get('/lecturas/ultima').then(datos),
  serie: (desde, hasta) => http.get('/lecturas/serie', { params: { desde, hasta } }).then(datos),
  listar: ({ desde, hasta, pagina, tamano }) => http.get('/lecturas', { params: { desde, hasta, pagina, tamano } }).then(datos),
  excel: (desde, hasta) => http.get('/lecturas.xlsx', { params: { desde, hasta }, responseType: 'blob', timeout: 120000 }),
};
```

`FE/src/stores/useAuthStore.js` (versión completa; Task 8 le agrega pruebas):

```js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { sesion } from '@/api/http';
import { hornoApi } from '@/api/hornoApi';

// Momento (ms) en que vence el JWT, leído de su payload. 0 si no se puede leer.
function venceEn(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(sesion.token());
  const usuario = ref(sesion.usuario());

  const iniciales = computed(() => {
    const nombre = usuario.value?.nombre || usuario.value?.usuario || '';
    return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  });

  // Función y no computed: depende de la hora actual, no solo del token.
  const sesionVigente = () => Boolean(token.value) && venceEn(token.value) > Date.now();

  async function login(usuarioRed, password) {
    const d = await hornoApi.login(usuarioRed, password);
    sesion.guardar(d.token, d.user);
    token.value = d.token;
    usuario.value = d.user;
  }

  function logout() {
    sesion.limpiar();
    token.value = null;
    usuario.value = null;
  }

  return { token, usuario, iniciales, sesionVigente, login, logout };
});
```

`FE/src/router/index.js`:

```js
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/useAuthStore';

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { publica: true } },
  { path: '/', redirect: '/monitoreo' },
  { path: '/monitoreo', name: 'monitoreo', component: () => import('@/views/MonitoreoView.vue'), meta: { titulo: 'Monitoreo en vivo' } },
  { path: '/graficas', name: 'graficas', component: () => import('@/views/GraficasView.vue'), meta: { titulo: 'Gráficas' } },
  { path: '/registros', name: 'registros', component: () => import('@/views/RegistrosView.vue'), meta: { titulo: 'Registros' } },
  { path: '/:pathMatch(.*)*', redirect: '/monitoreo' },
];

const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes });

router.beforeEach((to) => {
  const auth = useAuthStore();
  const vigente = auth.sesionVigente();
  if (!to.meta.publica && !vigente) {
    if (auth.token) auth.logout();
    return { name: 'login', query: to.fullPath === '/monitoreo' ? {} : { next: to.fullPath } };
  }
  if (to.name === 'login' && vigente) return { name: 'monitoreo' };
  return true;
});

export default router;
```

`FE/src/main.js`:

```js
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './assets/styles/main.css';

createApp(App).use(createPinia()).use(router).mount('#app');
```

`FE/src/App.vue`:

```vue
<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppSidebar from '@/components/layout/AppSidebar.vue';
import AppHeader from '@/components/layout/AppHeader.vue';

const route = useRoute();
const menuAbierto = ref(false);
const publica = computed(() => route.meta.publica === true);
watch(() => route.fullPath, () => { menuAbierto.value = false; });
</script>

<template>
  <RouterView v-if="publica" />
  <div v-else class="min-h-screen lg:flex">
    <AppSidebar :abierto="menuAbierto" />
    <div v-if="menuAbierto" class="fixed inset-0 z-30 bg-black/40 lg:hidden" @click="menuAbierto = false" />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppHeader :titulo="route.meta.titulo || ''" @menu="menuAbierto = true" />
      <main class="flex-1 p-4 sm:p-6 lg:p-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>
```

`FE/src/components/layout/AppSidebar.vue`:

```vue
<script setup>
import { useRouter } from 'vue-router';
import { SignalIcon, ChartBarIcon, TableCellsIcon, ArrowRightOnRectangleIcon } from '@heroicons/vue/24/outline';
import { useAuthStore } from '@/stores/useAuthStore';

defineProps({ abierto: { type: Boolean, default: false } });

const auth = useAuthStore();
const router = useRouter();
const logo = `${import.meta.env.BASE_URL}logo-olivos.webp`;
const MENU = [
  { to: '/monitoreo', texto: 'Monitoreo', icono: SignalIcon },
  { to: '/graficas', texto: 'Gráficas', icono: ChartBarIcon },
  { to: '/registros', texto: 'Registros', icono: TableCellsIcon },
];

function salir() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <aside
    :class="[
      'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brown-deep text-cream transition-transform duration-200',
      'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
      abierto ? 'translate-x-0' : '-translate-x-full',
    ]"
  >
    <div class="flex items-center gap-3 border-b border-white/10 px-5 py-5">
      <div class="rounded-lg bg-white p-1.5"><img :src="logo" alt="Los Olivos" class="h-9 w-auto" /></div>
      <div>
        <p class="font-serif text-lg font-bold leading-tight">Horno INCOL</p>
        <p class="text-xs text-white/60">Monitoreo de emisiones</p>
      </div>
    </div>

    <nav class="flex-1 space-y-1 px-3 py-4">
      <RouterLink
        v-for="item in MENU" :key="item.to" :to="item.to"
        class="flex items-center gap-3 rounded-sv px-3 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
        active-class="!bg-gold/20 !text-gold-bright"
      >
        <component :is="item.icono" class="h-5 w-5" />
        {{ item.texto }}
      </RouterLink>
    </nav>

    <div class="border-t border-white/10 p-4">
      <div class="mb-3 flex items-center gap-3">
        <span class="flex h-9 w-9 items-center justify-center rounded-full bg-gold font-semibold">{{ auth.iniciales }}</span>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{{ auth.usuario?.nombre || auth.usuario?.usuario }}</p>
          <p class="truncate text-xs text-white/60">{{ auth.usuario?.usuario }}</p>
        </div>
      </div>
      <button type="button" class="flex w-full items-center gap-2 rounded-sv px-3 py-2 text-sm text-white/80 hover:bg-white/10" @click="salir">
        <ArrowRightOnRectangleIcon class="h-5 w-5" /> Cerrar sesión
      </button>
    </div>
  </aside>
</template>
```

`FE/src/components/layout/AppHeader.vue`:

```vue
<script setup>
import { Bars3Icon } from '@heroicons/vue/24/outline';

defineProps({ titulo: { type: String, default: '' } });
defineEmits(['menu']);
</script>

<template>
  <header class="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
    <button type="button" class="rounded-sv p-2 text-text2 hover:bg-gray-100 lg:hidden" aria-label="Abrir menú" @click="$emit('menu')">
      <Bars3Icon class="h-6 w-6" />
    </button>
    <h1 class="font-serif text-xl font-bold text-primary-800">{{ titulo }}</h1>
  </header>
</template>
```

Marcadores (se reemplazan en Tasks 8-11). `FE/src/views/LoginView.vue`, `MonitoreoView.vue`, `GraficasView.vue` y `RegistrosView.vue`, cada uno con:

```vue
<template>
  <div class="sv-card p-6 text-text3">En construcción</div>
</template>
```

- [ ] **Step 4: Instalar y compilar**

Run: `cd "FE" && npm install && npm run build && ls -a dist && ls dist/fonts | head -3`
Expected: build sin errores; `dist` contiene `index.html`, `.htaccess`, `logo-olivos.webp`, `assets/` y `fonts/`. Si `.htaccess` no aparece, agregar a `vite.config.js` un plugin `closeBundle` que copie `public/.htaccess` a `dist/.htaccess` con `fs.copyFileSync`.

- [ ] **Step 5: Commit**

```bash
cd "FE" && git add -A && git commit -m "feat: base de incol-frontend con estilos de Los Olivos, layout y rutas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Login con usuario de red

**Files:**
- Modify: `FE/src/views/LoginView.vue`
- Test: `FE/src/stores/__tests__/useAuthStore.test.js`

**Interfaces:**
- Consumes: `useAuthStore` (Task 7), `mensajeDeError` (Task 7).

- [ ] **Step 1: Escribir la prueba que falla** — `FE/src/stores/__tests__/useAuthStore.test.js`

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('@/api/hornoApi', () => ({ hornoApi: { login: vi.fn() } }));

import { hornoApi } from '@/api/hornoApi';
import { useAuthStore } from '@/stores/useAuthStore';

const tokenQueVence = (segundos) => {
  const exp = Math.floor(Date.now() / 1000) + segundos;
  return `cabecera.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.firma`;
};

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('login guarda token y usuario y deja la sesión vigente', async () => {
    const token = tokenQueVence(3600);
    hornoApi.login.mockResolvedValue({ token, user: { usuario: 'jperez', nombre: 'Juan Pérez' } });
    const auth = useAuthStore();
    await auth.login('jperez', 'clave');
    expect(hornoApi.login).toHaveBeenCalledWith('jperez', 'clave');
    expect(auth.sesionVigente()).toBe(true);
    expect(localStorage.getItem('incol_token')).toBe(token);
    expect(auth.iniciales).toBe('JP');
  });

  it('un token vencido guardado no cuenta como sesión', () => {
    localStorage.setItem('incol_token', tokenQueVence(-60));
    expect(useAuthStore().sesionVigente()).toBe(false);
  });

  it('un token ilegible no cuenta como sesión', () => {
    localStorage.setItem('incol_token', 'no-es-un-jwt');
    expect(useAuthStore().sesionVigente()).toBe(false);
  });

  it('logout limpia el almacenamiento', async () => {
    hornoApi.login.mockResolvedValue({ token: tokenQueVence(3600), user: { usuario: 'jperez' } });
    const auth = useAuthStore();
    await auth.login('jperez', 'clave');
    auth.logout();
    expect(auth.sesionVigente()).toBe(false);
    expect(localStorage.getItem('incol_token')).toBeNull();
    expect(localStorage.getItem('incol_usuario')).toBeNull();
  });
});
```

- [ ] **Step 2: Correrla** — `cd "FE" && npm test`
Expected: PASS (el store ya existe desde Task 7; si falla, corregir el store hasta que pase).

- [ ] **Step 3: Implementar la vista** — `FE/src/views/LoginView.vue`

```vue
<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { mensajeDeError } from '@/api/http';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const logo = `${import.meta.env.BASE_URL}logo-olivos.webp`;

const usuario = ref('');
const password = ref('');
const cargando = ref(false);
const error = ref('');

async function entrar() {
  error.value = '';
  if (!usuario.value.trim() || !password.value) {
    error.value = 'Escribe tu usuario de red y tu contraseña';
    return;
  }
  cargando.value = true;
  try {
    await auth.login(usuario.value.trim(), password.value);
    const destino = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/monitoreo';
    router.replace(destino);
  } catch (err) {
    error.value = mensajeDeError(err, 'No se pudo iniciar sesión');
    password.value = '';
  } finally {
    cargando.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-800 via-primary-700 to-primary-500 p-4">
    <div class="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
      <div class="mb-6 text-center">
        <img :src="logo" alt="Los Olivos" class="mx-auto mb-4 h-16 w-auto" />
        <h1 class="font-serif text-2xl font-bold text-primary-800">Horno INCOL</h1>
        <p class="mt-1 text-sm text-text3">Monitoreo de temperaturas y emisiones</p>
      </div>

      <form class="space-y-4" @submit.prevent="entrar">
        <div>
          <label for="usuario" class="sv-label">Usuario de red</label>
          <input id="usuario" v-model="usuario" class="sv-input" autocomplete="username" autofocus placeholder="jperez" />
        </div>
        <div>
          <label for="password" class="sv-label">Contraseña</label>
          <input id="password" v-model="password" type="password" class="sv-input" autocomplete="current-password" />
          <p class="mt-1 text-xs text-text3">Usa el mismo usuario y clave de Windows.</p>
        </div>
        <p v-if="error" class="rounded-sv bg-red-50 px-3 py-2 text-sm text-danger" role="alert">{{ error }}</p>
        <button type="submit" class="sv-btn-primary w-full py-2.5" :disabled="cargando">
          {{ cargando ? 'Validando…' : 'Ingresar' }}
        </button>
      </form>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Compilar y probar** — `cd "FE" && npm test && npm run build`
Expected: PASS y build sin errores.

- [ ] **Step 5: Commit**

```bash
cd "FE" && git add -A && git commit -m "feat: login con usuario de red y pruebas de la sesión

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Monitoreo en vivo

**Files:**
- Create: `FE/src/config/variables.js`, `FE/src/utils/estado.js`
- Create: `FE/src/components/KpiCard.vue`, `FE/src/components/EstadoRegistro.vue`
- Modify: `FE/src/views/MonitoreoView.vue`
- Test: `FE/src/utils/__tests__/estado.test.js`, `FE/src/config/__tests__/variables.test.js`

**Interfaces:**
- Consumes: `hornoApi.ultima()`, `mensajeDeError` (Task 7).
- Produces: `VARIABLES` (`{campo, etiqueta, unidad, decimales, color, grupo, eje?}`), `GRUPOS` (`{clave, titulo}`), `etiquetaCompleta(v)`, `formatear(valor, v)`; `estadoRegistro(minutos) → {nivel:'ok'|'alerta'|'critico'|'sin-datos', texto}`, `formatearDuracion(min)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`FE/src/utils/__tests__/estado.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { estadoRegistro, formatearDuracion } from '@/utils/estado';

describe('estadoRegistro', () => {
  it.each([
    [null, 'sin-datos'], [0, 'ok'], [9, 'ok'], [10, 'alerta'], [30, 'alerta'], [31, 'critico'], [2000, 'critico'],
  ])('%s minutos → %s', (minutos, nivel) => {
    expect(estadoRegistro(minutos).nivel).toBe(nivel);
  });

  it('el texto crítico dice qué revisar', () => {
    expect(estadoRegistro(90).texto).toMatch(/1 h 30 min/);
    expect(estadoRegistro(90).texto).toMatch(/eServer/);
  });
});

describe('formatearDuracion', () => {
  it.each([[5, '5 min'], [60, '1 h'], [125, '2 h 5 min'], [1500, '1 d 1 h']])('%s → %s', (min, texto) => {
    expect(formatearDuracion(min)).toBe(texto);
  });
});
```

`FE/src/config/__tests__/variables.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { VARIABLES, GRUPOS, etiquetaCompleta, formatear } from '@/config/variables';

const porCampo = (c) => VARIABLES.find((v) => v.campo === c);

describe('variables del horno', () => {
  it('son las 8 columnas de la API, cada una en un grupo existente', () => {
    expect(VARIABLES.map((v) => v.campo)).toEqual([
      'temp_combustion', 'temp_postcombustion', 'temp_chimenea', 'co', 'oxigeno', 'co_mg_m3', 'ccr', 'ccr_o2_ref',
    ]);
    const claves = GRUPOS.map((g) => g.clave);
    for (const v of VARIABLES) expect(claves).toContain(v.grupo);
  });

  it('etiqueta con unidad cuando la tiene', () => {
    expect(etiquetaCompleta(porCampo('co_mg_m3'))).toBe('CO (mg/m³)');
    expect(etiquetaCompleta(porCampo('ccr'))).toBe('Ccr');
  });

  it('formatea con los decimales de la variable y coma decimal', () => {
    expect(formatear(18.6, porCampo('oxigeno'))).toBe('18,60');
    expect(formatear(1234.56, porCampo('temp_combustion'))).toBe('1.234,6');
    expect(formatear(null, porCampo('oxigeno'))).toBe('—');
  });
});
```

- [ ] **Step 2: Correrlas y verlas fallar** — `cd "FE" && npm test`
Expected: FAIL (módulos inexistentes)

- [ ] **Step 3: Implementar**

`FE/src/config/variables.js`:

```js
// Las 8 variables del horno (mismos campos que la API /api/horno/v1).
export const VARIABLES = [
  { campo: 'temp_combustion', etiqueta: 'Temp. combustión', unidad: '°C', decimales: 1, color: '#dc2626', grupo: 'temperaturas' },
  { campo: 'temp_postcombustion', etiqueta: 'Temp. postcombustión', unidad: '°C', decimales: 1, color: '#f59e0b', grupo: 'temperaturas' },
  { campo: 'temp_chimenea', etiqueta: 'Temp. chimenea', unidad: '°C', decimales: 1, color: '#6b7280', grupo: 'temperaturas' },
  { campo: 'co', etiqueta: 'CO', unidad: 'ppm', decimales: 1, color: '#7c3aed', grupo: 'gases', eje: 'y' },
  { campo: 'oxigeno', etiqueta: 'Oxígeno', unidad: '%', decimales: 2, color: '#00875c', grupo: 'gases', eje: 'y1' },
  { campo: 'co_mg_m3', etiqueta: 'CO', unidad: 'mg/m³', decimales: 3, color: '#2563eb', grupo: 'gases', eje: 'y' },
  { campo: 'ccr', etiqueta: 'Ccr', unidad: null, decimales: 1, color: '#005a3d', grupo: 'ccr' },
  { campo: 'ccr_o2_ref', etiqueta: 'Ccr O2 ref.', unidad: null, decimales: 1, color: '#1ab37d', grupo: 'ccr' },
];

export const GRUPOS = [
  { clave: 'temperaturas', titulo: 'Temperaturas' },
  { clave: 'gases', titulo: 'Gases: CO y oxígeno' },
  { clave: 'ccr', titulo: 'Ccr y Ccr O2 ref.' },
];

export const etiquetaCompleta = (v) => (v.unidad ? `${v.etiqueta} (${v.unidad})` : v.etiqueta);

export function formatear(valor, v) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '—';
  return Number(valor).toLocaleString('es-CO', { minimumFractionDigits: v.decimales, maximumFractionDigits: v.decimales });
}
```

`FE/src/utils/estado.js`:

```js
// Semáforo del registro según los minutos desde la última lectura (la HMI registra cada ~4 min).
export function formatearDuracion(min) {
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  if (horas < 24) return resto ? `${horas} h ${resto} min` : `${horas} h`;
  return `${Math.floor(horas / 24)} d ${horas % 24} h`;
}

export function estadoRegistro(minutos) {
  if (minutos === null || minutos === undefined) return { nivel: 'sin-datos', texto: 'Aún no hay lecturas registradas' };
  if (minutos < 10) return { nivel: 'ok', texto: 'Registrando con normalidad' };
  if (minutos <= 30) return { nivel: 'alerta', texto: `Sin datos nuevos hace ${minutos} min` };
  return { nivel: 'critico', texto: `Sin datos hace ${formatearDuracion(minutos)}: revisar la HMI, eServer y la copia al servidor` };
}
```

`FE/src/components/KpiCard.vue`:

```vue
<script setup>
import { computed } from 'vue';
import { formatear } from '@/config/variables';

const props = defineProps({
  variable: { type: Object, required: true },
  valor: { type: Number, default: null },
});
const texto = computed(() => formatear(props.valor, props.variable));
</script>

<template>
  <div class="sv-card relative overflow-hidden p-5">
    <span class="absolute inset-y-0 left-0 w-1.5" :style="{ backgroundColor: variable.color }" />
    <p class="text-xs font-semibold uppercase tracking-wide text-text3">{{ variable.etiqueta }}</p>
    <p class="mt-2 flex items-baseline gap-1.5">
      <span class="font-serif text-3xl font-bold text-text1">{{ texto }}</span>
      <span v-if="variable.unidad" class="text-sm font-semibold text-text3">{{ variable.unidad }}</span>
    </p>
  </div>
</template>
```

`FE/src/components/EstadoRegistro.vue`:

```vue
<script setup>
import { computed } from 'vue';
import dayjs from 'dayjs';
import { estadoRegistro } from '@/utils/estado';

const props = defineProps({
  minutos: { type: Number, default: null },
  registradoEn: { type: String, default: null },
});

const estado = computed(() => estadoRegistro(props.minutos));
const ESTILOS = {
  ok: 'bg-primary-50 border-primary-200 text-primary-800',
  alerta: 'bg-amber-50 border-amber-200 text-amber-800',
  critico: 'bg-red-50 border-red-200 text-red-800',
  'sin-datos': 'bg-gray-50 border-gray-200 text-text2',
};
const PUNTO = { ok: 'bg-primary-500', alerta: 'bg-warning', critico: 'bg-danger', 'sin-datos': 'bg-gray-400' };
</script>

<template>
  <div :class="['flex flex-wrap items-center gap-3 rounded-sv border px-4 py-3', ESTILOS[estado.nivel]]" role="status">
    <span class="relative flex h-3 w-3">
      <span v-if="estado.nivel === 'ok'" class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-60" />
      <span :class="['relative inline-flex h-3 w-3 rounded-full', PUNTO[estado.nivel]]" />
    </span>
    <span class="font-semibold">{{ estado.texto }}</span>
    <span v-if="registradoEn" class="text-sm opacity-80">· Último dato: {{ dayjs(registradoEn).format('DD/MM/YYYY HH:mm:ss') }}</span>
  </div>
</template>
```

`FE/src/views/MonitoreoView.vue`:

```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import { hornoApi } from '@/api/hornoApi';
import { mensajeDeError } from '@/api/http';
import { VARIABLES, GRUPOS } from '@/config/variables';
import KpiCard from '@/components/KpiCard.vue';
import EstadoRegistro from '@/components/EstadoRegistro.vue';

const INTERVALO_MS = 30000;
const datos = ref({ lectura: null, minutosSinDatos: null });
const cargando = ref(false);
const error = ref('');
const actualizado = ref(null);
let temporizador = null;

async function cargar() {
  cargando.value = true;
  try {
    datos.value = await hornoApi.ultima();
    actualizado.value = new Date();
    error.value = '';
  } catch (err) {
    error.value = mensajeDeError(err, 'No se pudo consultar la última lectura');
  } finally {
    cargando.value = false;
  }
}

// Con la pestaña oculta no consulta; al volver, actualiza de inmediato.
function programar() {
  clearInterval(temporizador);
  temporizador = null;
  if (document.visibilityState === 'visible') temporizador = setInterval(cargar, INTERVALO_MS);
}
function alCambiarVisibilidad() {
  if (document.visibilityState === 'visible') cargar();
  programar();
}

onMounted(() => {
  cargar();
  programar();
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
});
onUnmounted(() => {
  clearInterval(temporizador);
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
});

const variablesDe = (grupo) => VARIABLES.filter((v) => v.grupo === grupo);
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <EstadoRegistro class="flex-1" :minutos="datos.minutosSinDatos" :registrado-en="datos.lectura?.registrado_en ?? null" />
      <button type="button" class="sv-btn-secondary" :disabled="cargando" @click="cargar">
        <ArrowPathIcon :class="['h-4 w-4', cargando && 'animate-spin']" /> Actualizar
      </button>
    </div>

    <p v-if="error" class="rounded-sv bg-red-50 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>

    <section v-for="grupo in GRUPOS" :key="grupo.clave">
      <h2 class="mb-3 font-serif text-lg font-bold text-primary-800">{{ grupo.titulo }}</h2>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard v-for="v in variablesDe(grupo.clave)" :key="v.campo" :variable="v" :valor="datos.lectura?.[v.campo] ?? null" />
      </div>
    </section>

    <p class="text-xs text-text3">
      Se actualiza cada 30 segundos.
      <span v-if="actualizado">Última consulta: {{ actualizado.toLocaleTimeString('es-CO') }}.</span>
    </p>
  </div>
</template>
```

- [ ] **Step 4: Probar y compilar** — `cd "FE" && npm test && npm run build`
Expected: PASS y build sin errores.

- [ ] **Step 5: Commit**

```bash
cd "FE" && git add -A && git commit -m "feat: monitoreo en vivo con semáforo de registro y tarjetas por variable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Gráficas por rango

**Files:**
- Create: `FE/src/utils/rangos.js`, `FE/src/components/FiltroRango.vue`, `FE/src/components/GraficaSerie.vue`
- Modify: `FE/src/views/GraficasView.vue`
- Test: `FE/src/utils/__tests__/rangos.test.js`

**Interfaces:**
- Consumes: `hornoApi.serie(desde,hasta) → {agrupacion, puntos:[{t, <campo>:{prom,min,max}}]}`; `VARIABLES`, `GRUPOS`, `etiquetaCompleta` (Task 9).
- Produces: `FORMATO`, `PRESETS`, `rangoPreset(clave, ahora?) → {desde,hasta}`, `rangoPersonalizado(desdeLocal, hastaLocal) → {desde,hasta} | {error}`, `aInputLocal(texto)`; `<FiltroRango :inicial="'24h'" @cambio="({desde,hasta,clave}) => …">`; `<GraficaSerie :titulo :puntos :agrupacion :variables>`.

- [ ] **Step 1: Escribir la prueba que falla** — `FE/src/utils/__tests__/rangos.test.js`

```js
import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { rangoPreset, rangoPersonalizado, aInputLocal } from '@/utils/rangos';

const AHORA = dayjs('2026-11-22 14:30:15');

describe('rangoPreset', () => {
  it.each([
    ['hoy', '2026-11-22 00:00:00'],
    ['24h', '2026-11-21 14:30:15'],
    ['7d', '2026-11-15 14:30:15'],
    ['30d', '2026-10-23 14:30:15'],
  ])('%s empieza en %s y termina ahora', (clave, desde) => {
    expect(rangoPreset(clave, AHORA)).toEqual({ desde, hasta: '2026-11-22 14:30:15' });
  });

  it('rechaza una clave desconocida', () => {
    expect(() => rangoPreset('1año', AHORA)).toThrow(/desconocido/);
  });
});

describe('rangoPersonalizado', () => {
  it('convierte los valores de datetime-local', () => {
    expect(rangoPersonalizado('2026-11-01T06:00', '2026-11-02T18:30')).toEqual({
      desde: '2026-11-01 06:00:00', hasta: '2026-11-02 18:30:00',
    });
  });

  it.each([
    ['', '2026-11-02T18:30', /Indica/],
    ['2026-11-03T00:00', '2026-11-02T00:00', /posterior/],
    ['2025-01-01T00:00', '2026-11-02T00:00', /366/],
  ])('rechaza %s → %s', (d, h, mensaje) => {
    expect(rangoPersonalizado(d, h).error).toMatch(mensaje);
  });
});

it('aInputLocal da el formato de datetime-local', () => {
  expect(aInputLocal('2026-11-22 14:30:15')).toBe('2026-11-22T14:30');
});
```

- [ ] **Step 2: Correrla y verla fallar** — `cd "FE" && npm test`
Expected: FAIL (`@/utils/rangos` no existe)

- [ ] **Step 3: Implementar**

`FE/src/utils/rangos.js`:

```js
// Rangos de fecha en hora local del navegador (la planta y los usuarios están en Colombia, igual que la base).
import dayjs from 'dayjs';

export const FORMATO = 'YYYY-MM-DD HH:mm:ss';

export const PRESETS = [
  { clave: 'hoy', texto: 'Hoy' },
  { clave: '24h', texto: '24 h' },
  { clave: '7d', texto: '7 días' },
  { clave: '30d', texto: '30 días' },
];

export function rangoPreset(clave, ahora = dayjs()) {
  const inicios = {
    hoy: () => ahora.startOf('day'),
    '24h': () => ahora.subtract(24, 'hour'),
    '7d': () => ahora.subtract(7, 'day'),
    '30d': () => ahora.subtract(30, 'day'),
  };
  if (!inicios[clave]) throw new Error(`Rango desconocido: ${clave}`);
  return { desde: inicios[clave]().format(FORMATO), hasta: ahora.format(FORMATO) };
}

export function rangoPersonalizado(desdeLocal, hastaLocal) {
  const desde = dayjs(desdeLocal);
  const hasta = dayjs(hastaLocal);
  if (!desdeLocal || !hastaLocal || !desde.isValid() || !hasta.isValid()) return { error: 'Indica la fecha inicial y la final' };
  if (hasta.isBefore(desde)) return { error: 'La fecha final debe ser posterior a la inicial' };
  if (hasta.diff(desde, 'day', true) > 366) return { error: 'El rango no puede superar 366 días' };
  return { desde: desde.format(FORMATO), hasta: hasta.format(FORMATO) };
}

export const aInputLocal = (texto) => dayjs(texto).format('YYYY-MM-DDTHH:mm');
```

`FE/src/components/FiltroRango.vue`:

```vue
<script setup>
import { ref, onMounted } from 'vue';
import { PRESETS, rangoPreset, rangoPersonalizado, aInputLocal } from '@/utils/rangos';

const props = defineProps({ inicial: { type: String, default: '24h' } });
const emit = defineEmits(['cambio']);

const activo = ref(props.inicial);
const desdeLocal = ref('');
const hastaLocal = ref('');
const error = ref('');

function elegir(clave) {
  activo.value = clave;
  error.value = '';
  const rango = rangoPreset(clave);
  desdeLocal.value = aInputLocal(rango.desde);
  hastaLocal.value = aInputLocal(rango.hasta);
  emit('cambio', { ...rango, clave });
}

function aplicarPersonalizado() {
  const r = rangoPersonalizado(desdeLocal.value, hastaLocal.value);
  if (r.error) {
    error.value = r.error;
    return;
  }
  error.value = '';
  activo.value = 'personalizado';
  emit('cambio', { ...r, clave: 'personalizado' });
}

// Vuelve a calcular el preset activo con la hora actual (para "Actualizar").
function refrescar() {
  if (activo.value === 'personalizado') aplicarPersonalizado();
  else elegir(activo.value);
}

onMounted(() => elegir(props.inicial));
defineExpose({ refrescar });
</script>

<template>
  <div class="sv-card flex flex-wrap items-end gap-3 p-4">
    <div class="flex flex-wrap gap-1 rounded-sv bg-gray-100 p-1">
      <button
        v-for="p in PRESETS" :key="p.clave" type="button"
        :class="['rounded-md px-3 py-1.5 text-sm font-semibold transition', activo === p.clave ? 'bg-white text-primary-700 shadow' : 'text-text2 hover:text-primary-700']"
        @click="elegir(p.clave)"
      >{{ p.texto }}</button>
    </div>
    <div>
      <label class="sv-label" for="filtro-desde">Desde</label>
      <input id="filtro-desde" v-model="desdeLocal" type="datetime-local" class="sv-input" />
    </div>
    <div>
      <label class="sv-label" for="filtro-hasta">Hasta</label>
      <input id="filtro-hasta" v-model="hastaLocal" type="datetime-local" class="sv-input" />
    </div>
    <button type="button" :class="activo === 'personalizado' ? 'sv-btn-primary' : 'sv-btn-secondary'" @click="aplicarPersonalizado">Aplicar</button>
    <slot />
    <p v-if="error" class="w-full text-sm text-danger" role="alert">{{ error }}</p>
  </div>
</template>
```

`FE/src/components/GraficaSerie.vue`:

```vue
<script setup>
import { computed } from 'vue';
import dayjs from 'dayjs';
import { Line } from 'vue-chartjs';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js';
import { etiquetaCompleta } from '@/config/variables';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

const props = defineProps({
  titulo: { type: String, required: true },
  puntos: { type: Array, default: () => [] },
  agrupacion: { type: String, default: 'crudo' },
  variables: { type: Array, required: true },
});

const FORMATO_EJE = { crudo: 'DD/MM HH:mm', hora: 'DD/MM HH:00', dia: 'DD/MM/YYYY' };
const conAlfa = (hex, alfa) => `${hex}${Math.round(alfa * 255).toString(16).padStart(2, '0')}`;

const datos = computed(() => {
  const labels = props.puntos.map((p) => dayjs(p.t).format(FORMATO_EJE[props.agrupacion]));
  const datasets = [];
  for (const v of props.variables) {
    const eje = v.eje || 'y';
    const serie = (clave) => props.puntos.map((p) => p[v.campo]?.[clave] ?? null);
    if (props.agrupacion !== 'crudo') {
      // Banda mín–máx: el dataset "máx" se rellena hasta el siguiente ("mín").
      datasets.push({ label: `${etiquetaCompleta(v)} máx`, data: serie('max'), borderColor: 'transparent', backgroundColor: conAlfa(v.color, 0.15), pointRadius: 0, fill: '+1', yAxisID: eje, banda: true });
      datasets.push({ label: `${etiquetaCompleta(v)} mín`, data: serie('min'), borderColor: 'transparent', pointRadius: 0, fill: false, yAxisID: eje, banda: true });
    }
    datasets.push({
      label: etiquetaCompleta(v), data: serie('prom'), borderColor: v.color, backgroundColor: v.color,
      borderWidth: 2, pointRadius: props.puntos.length > 150 ? 0 : 2, tension: 0.25, spanGaps: true, fill: false, yAxisID: eje,
    });
  }
  return { labels, datasets };
});

const opciones = computed(() => {
  const usaY1 = props.variables.some((v) => v.eje === 'y1');
  const unidades = (eje) => [...new Set(props.variables.filter((v) => (v.eje || 'y') === eje && v.unidad).map((v) => v.unidad))].join(' / ');
  const scales = {
    x: { ticks: { maxTicksLimit: 10, maxRotation: 0 }, grid: { display: false } },
    y: { title: { display: Boolean(unidades('y')), text: unidades('y') } },
  };
  if (usaY1) scales.y1 = { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: unidades('y1') } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, filter: (item, data) => !data.datasets[item.datasetIndex].banda } },
      tooltip: { filter: (ctx) => !ctx.dataset.banda },
    },
    scales,
  };
});
</script>

<template>
  <div class="sv-card p-5">
    <h3 class="mb-3 font-serif text-base font-bold text-primary-800">{{ titulo }}</h3>
    <div v-if="puntos.length" class="h-72">
      <Line :data="datos" :options="opciones" />
    </div>
    <p v-else class="flex h-72 items-center justify-center text-sm text-text3">No hay lecturas en este rango</p>
  </div>
</template>
```

`FE/src/views/GraficasView.vue`:

```vue
<script setup>
import { ref, computed } from 'vue';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import { hornoApi } from '@/api/hornoApi';
import { mensajeDeError } from '@/api/http';
import { VARIABLES, GRUPOS } from '@/config/variables';
import FiltroRango from '@/components/FiltroRango.vue';
import GraficaSerie from '@/components/GraficaSerie.vue';

const filtro = ref(null);
const serie = ref({ agrupacion: 'crudo', puntos: [] });
const cargando = ref(false);
const error = ref('');

const DESCRIPCION = {
  crudo: 'Cada punto es una lectura.',
  hora: 'Promedio por hora; la franja muestra el mínimo y el máximo.',
  dia: 'Promedio por día; la franja muestra el mínimo y el máximo.',
};
const descripcion = computed(() => DESCRIPCION[serie.value.agrupacion]);

async function cargar({ desde, hasta }) {
  cargando.value = true;
  error.value = '';
  try {
    serie.value = await hornoApi.serie(desde, hasta);
  } catch (err) {
    error.value = mensajeDeError(err, 'No se pudo cargar la serie');
  } finally {
    cargando.value = false;
  }
}

const variablesDe = (grupo) => VARIABLES.filter((v) => v.grupo === grupo);
</script>

<template>
  <div class="space-y-6">
    <FiltroRango ref="filtro" inicial="24h" @cambio="cargar">
      <button type="button" class="sv-btn-secondary" :disabled="cargando" @click="filtro?.refrescar()">
        <ArrowPathIcon :class="['h-4 w-4', cargando && 'animate-spin']" /> Actualizar
      </button>
    </FiltroRango>

    <p v-if="error" class="rounded-sv bg-red-50 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>
    <p class="text-sm text-text3">{{ descripcion }} {{ serie.puntos.length }} puntos.</p>

    <div :class="['grid grid-cols-1 gap-6 transition-opacity', cargando && 'opacity-60']">
      <GraficaSerie
        v-for="g in GRUPOS" :key="g.clave"
        :titulo="g.titulo" :puntos="serie.puntos" :agrupacion="serie.agrupacion" :variables="variablesDe(g.clave)"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Probar y compilar** — `cd "FE" && npm test && npm run build`
Expected: PASS y build sin errores.

- [ ] **Step 5: Commit**

```bash
cd "FE" && git add -A && git commit -m "feat: gráficas por rango con banda de mínimo y máximo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Registros y descarga en Excel

**Files:**
- Create: `FE/src/utils/descarga.js`, `FE/src/components/TablaLecturas.vue`
- Modify: `FE/src/views/RegistrosView.vue`
- Test: `FE/src/utils/__tests__/descarga.test.js`

**Interfaces:**
- Consumes: `hornoApi.listar`, `hornoApi.excel`, `mensajeDeError` (Task 7); `VARIABLES`, `formatear`, `etiquetaCompleta` (Task 9); `FiltroRango` (Task 10).
- Produces: `nombreDesdeCabecera(cabecera, porDefecto)`, `descargarBlob(blob, nombre)`, `mensajeDeErrorBlob(err, porDefecto)`.

- [ ] **Step 1: Escribir la prueba que falla** — `FE/src/utils/__tests__/descarga.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { nombreDesdeCabecera, descargarBlob, mensajeDeErrorBlob } from '@/utils/descarga';

describe('descarga', () => {
  it('toma el nombre del Content-Disposition', () => {
    expect(nombreDesdeCabecera('attachment; filename="horno_incol_20261101_20261122.xlsx"', 'x.xlsx'))
      .toBe('horno_incol_20261101_20261122.xlsx');
    expect(nombreDesdeCabecera(undefined, 'x.xlsx')).toBe('x.xlsx');
  });

  it('lee el mensaje de error que viene dentro de un Blob', async () => {
    const data = new Blob([JSON.stringify({ success: false, message: 'Reduce el rango.' })], { type: 'application/json' });
    expect(await mensajeDeErrorBlob({ response: { status: 413, data } }, 'otro')).toBe('Reduce el rango.');
    expect(await mensajeDeErrorBlob({ response: { status: 500, data: new Blob(['<html>']) } }, 'otro')).toBe('otro');
  });

  it('descarga con un enlace temporal', () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    descargarBlob(new Blob(['a']), 'archivo.xlsx');
    expect(click).toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
```

- [ ] **Step 2: Correrla y verla fallar** — `cd "FE" && npm test`
Expected: FAIL (`@/utils/descarga` no existe)

- [ ] **Step 3: Implementar**

`FE/src/utils/descarga.js`:

```js
import { mensajeDeError } from '@/api/http';

export function nombreDesdeCabecera(cabecera, porDefecto) {
  const m = /filename="?([^";]+)"?/i.exec(cabecera || '');
  return m ? m[1] : porDefecto;
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Con responseType 'blob' el JSON de error del backend llega como Blob.
export async function mensajeDeErrorBlob(err, porDefecto) {
  const datos = err?.response?.data;
  if (datos instanceof Blob) {
    try {
      const json = JSON.parse(await datos.text());
      if (json.message) return json.message;
    } catch {
      return porDefecto;
    }
    return porDefecto;
  }
  return mensajeDeError(err, porDefecto);
}
```

`FE/src/components/TablaLecturas.vue`:

```vue
<script setup>
import dayjs from 'dayjs';
import { VARIABLES, formatear, etiquetaCompleta } from '@/config/variables';

defineProps({ filas: { type: Array, default: () => [] } });
</script>

<template>
  <div class="overflow-x-auto">
    <table class="min-w-full text-sm">
      <thead class="bg-primary-50 text-left text-xs font-semibold uppercase tracking-wide text-primary-800">
        <tr>
          <th class="sticky left-0 bg-primary-50 px-4 py-3">Fecha y hora</th>
          <th v-for="v in VARIABLES" :key="v.campo" class="whitespace-nowrap px-4 py-3 text-right">{{ etiquetaCompleta(v) }}</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        <tr v-for="f in filas" :key="f.id" class="hover:bg-gray-50">
          <td class="sticky left-0 whitespace-nowrap bg-white px-4 py-2.5 font-medium text-text1">{{ dayjs(f.registrado_en).format('DD/MM/YYYY HH:mm:ss') }}</td>
          <td v-for="v in VARIABLES" :key="v.campo" class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-text2">{{ formatear(f[v.campo], v) }}</td>
        </tr>
        <tr v-if="!filas.length">
          <td :colspan="VARIABLES.length + 1" class="px-4 py-10 text-center text-text3">No hay lecturas en este rango</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

`FE/src/views/RegistrosView.vue`:

```vue
<script setup>
import { ref, computed } from 'vue';
import { ArrowDownTrayIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/vue/24/outline';
import { hornoApi } from '@/api/hornoApi';
import { mensajeDeError } from '@/api/http';
import { descargarBlob, nombreDesdeCabecera, mensajeDeErrorBlob } from '@/utils/descarga';
import FiltroRango from '@/components/FiltroRango.vue';
import TablaLecturas from '@/components/TablaLecturas.vue';

const TAMANO = 50;
const rango = ref(null);
const pagina = ref(1);
const resultado = ref({ filas: [], total: 0 });
const cargando = ref(false);
const descargando = ref(false);
const error = ref('');

const totalPaginas = computed(() => Math.max(1, Math.ceil(resultado.value.total / TAMANO)));
const desdeFila = computed(() => (resultado.value.total ? (pagina.value - 1) * TAMANO + 1 : 0));
const hastaFila = computed(() => Math.min(pagina.value * TAMANO, resultado.value.total));

async function cargar() {
  if (!rango.value) return;
  cargando.value = true;
  error.value = '';
  try {
    resultado.value = await hornoApi.listar({ ...rango.value, pagina: pagina.value, tamano: TAMANO });
  } catch (err) {
    error.value = mensajeDeError(err, 'No se pudieron cargar los registros');
  } finally {
    cargando.value = false;
  }
}

function alCambiarRango({ desde, hasta }) {
  rango.value = { desde, hasta };
  pagina.value = 1;
  cargar();
}

function irA(n) {
  pagina.value = Math.min(Math.max(1, n), totalPaginas.value);
  cargar();
}

async function descargar() {
  descargando.value = true;
  error.value = '';
  try {
    const r = await hornoApi.excel(rango.value.desde, rango.value.hasta);
    descargarBlob(r.data, nombreDesdeCabecera(r.headers['content-disposition'], 'horno_incol.xlsx'));
  } catch (err) {
    error.value = await mensajeDeErrorBlob(err, 'No se pudo generar el Excel');
  } finally {
    descargando.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <FiltroRango inicial="24h" @cambio="alCambiarRango">
      <button type="button" class="sv-btn-primary" :disabled="descargando || !resultado.total" @click="descargar">
        <ArrowDownTrayIcon class="h-4 w-4" /> {{ descargando ? 'Generando…' : 'Descargar Excel' }}
      </button>
    </FiltroRango>

    <p v-if="error" class="rounded-sv bg-red-50 px-4 py-3 text-sm text-danger" role="alert">{{ error }}</p>

    <div :class="['sv-card overflow-hidden transition-opacity', cargando && 'opacity-60']">
      <TablaLecturas :filas="resultado.filas" />
      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm text-text2">
        <span>{{ desdeFila }}–{{ hastaFila }} de {{ resultado.total.toLocaleString('es-CO') }} lecturas</span>
        <div class="flex items-center gap-2">
          <button type="button" class="sv-btn-secondary px-2 py-1" :disabled="pagina <= 1 || cargando" aria-label="Página anterior" @click="irA(pagina - 1)">
            <ChevronLeftIcon class="h-4 w-4" />
          </button>
          <span>Página {{ pagina }} de {{ totalPaginas }}</span>
          <button type="button" class="sv-btn-secondary px-2 py-1" :disabled="pagina >= totalPaginas || cargando" aria-label="Página siguiente" @click="irA(pagina + 1)">
            <ChevronRightIcon class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Probar y compilar** — `cd "FE" && npm test && npm run build`
Expected: PASS y build sin errores.

- [ ] **Step 5: Commit**

```bash
cd "FE" && git add -A && git commit -m "feat: registros paginados y descarga en Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verificación integral, push a main y publicación del frontend

**Files:** ninguno nuevo.

- [ ] **Step 1: Suite completa del backend**

Run: `cd "BE" && npx jest src/horno src/porteria src/masajes 2>&1 | tail -15`
Expected: todas PASS (los fallos ajenos a estos módulos que ya existían en `main` se reportan, no se corrigen aquí).

- [ ] **Step 2: Prueba de humo local del frontend contra el backend local**

Run (dos terminales): `cd "BE" && npm run dev` · `cd "FE" && npm run dev`. Abrir `http://localhost:5174/incol/login`.
Expected: sin `HORNO_*` en el `.env` local, el login muestra "El módulo del horno no está disponible…" (503). Eso confirma la integración de punta a punta; la prueba con datos reales es en producción.

- [ ] **Step 3: Merge a main y push (backend)**

```bash
cd "BE" && git checkout main && git pull --ff-only && git merge --no-ff feat/horno -m "Merge: módulo Horno INCOL (monitoreo, gráficas y Excel con login AD)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && npx jest src/horno && git push origin main
```

Expected: push aceptado. El despliegue en el servidor (`scripts/deploy-mantix.sh` + variables) lo hace el usuario con `docs/horno/despliegue.md`.

- [ ] **Step 4: Build de producción y publicación**

```bash
cd "FE" && npm run build && ls -a dist
ls /Volumes/AppServ/www >/dev/null 2>&1 || open 'smb://192.9.17.11/AppServ'
```

Si el recurso no está montado, esperar a que el usuario lo monte (pide credenciales en Finder). Luego:

```bash
mkdir -p /Volumes/AppServ/www/incol && rsync -rtv --exclude '.DS_Store' "FE/dist/" /Volumes/AppServ/www/incol/ && ls -la /Volumes/AppServ/www/incol
```

Expected: `index.html`, `.htaccess`, `assets/`, `fonts/`, `logo-olivos.webp` en el servidor. Abrir `http://192.9.17.11/incol/` y comprobar que carga el login (el login real funciona cuando el backend esté desplegado con las variables y `CORS_ORIGIN`).
