# Portería — Fase 0 (base del módulo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar montado `src/porteria/` en `/api/porteria/v1` con configuración validada (503 si falta algo, sin tumbar Mantix), contrato de error, pool MySQL propio, migrador con control, esquema completo + seed de motivos + vista Superset, `/health` y la infraestructura de pruebas unitarias e integración.

**Architecture:** Módulo autocontenido como Big Day: pool `mysql2/promise` perezoso (no Sequelize), router construido una vez al cargar y envuelto por un guardián que responde 503 si `leerEntorno()` falla. Contrato de error y middleware `apiCodigo` copiados del patrón TRK con prefijo `POR-`. Migrador con tabla de control `por_migraciones` como TRK.

**Tech Stack:** Node.js, Express 4, mysql2/promise, Jest + supertest, MySQL 8 (docker), winston (`src/utils/logger`).

**Diseño de referencia:** `docs/superpowers/specs/2026-10-29-porteria-design.md`

## Global Constraints

- Todo el código del módulo vive en `src/porteria/`; tablas con prefijo `por_`.
- Portería nunca escribe en tablas de H360/Mantix.
- Mensajes al usuario en español. Contrato de error: `{ success:false, error:'POR-XXX-NNN', motivo, message, errors? }`. Éxito: `{ success:true, data }`.
- Ningún `require` del módulo lanza por configuración; Mantix arranca siempre.
- `PORTERIA_JWT_SECRET` obligatorio y distinto de `JWT_SECRET`, `IDENTIDAD_JWT_SECRET` y `TRK_JWT_SECRET`; < 32 caracteres solo advierte.
- Pool con `timezone: '-05:00'`, `charset: 'utf8mb4'`.
- Las pruebas de integración solo tocan una base cuyo nombre termine en `_test`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Directorio de trabajo para todos los comandos: la raíz del repo `mantix` (worktree de `feature/porteria`).

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/porteria/config/entorno.js` | `leerConexion()`, `leerEntorno()`: leen y validan variables; nunca lanzan |
| `src/porteria/utils/PorteriaError.js` | Error operativo con `statusCode`, `motivo`, `message`, `errors` |
| `src/porteria/middleware/apiCodigo.js` | Fija `req.porApiCodigo`, cabecera `X-POR-API`, logger hijo, completa cuerpos de error |
| `src/porteria/middleware/errorHandler.js` | Último middleware: convierte errores al contrato |
| `src/porteria/db.js` | `crearPool(cfg)`, `crearBdPerezosa(cfgFn)` → `{ obtener, ping, cerrar }` |
| `src/porteria/scripts/migrador.js` | `aplicarMigraciones(conn, dir?, log?)` |
| `src/porteria/scripts/migrar.js` | CLI `npm run porteria:migrate` |
| `src/porteria/migrations/001_esquema.sql` | Tablas `por_*` |
| `src/porteria/migrations/002_seed_motivos.sql` | 12 motivos iniciales |
| `src/porteria/migrations/003_vista_movimientos.sql` | Vista `v_por_movimientos` |
| `src/porteria/routes/index.js` | `crearRouterPorteria({ bd })`, guardián 503, export `router` |
| `src/porteria/testing/*` | docker-compose, env, globalSetup, `sql/h360_minimo.sql`, `bd.js` |
| `src/routes/index.js` | Montaje `/porteria/v1` |
| `src/app.js` | Exención del limitador global y errorHandler de parser para `/api/porteria` |
| `jest.porteria-int.config.js`, `package.json` | Config Jest de integración y scripts npm |

## Antes de empezar

1. Crear el worktree desde `feature/porteria` (`superpowers:using-git-worktrees`) y correr `npm ci`.
2. Línea base: correr `npx jest` y anotar qué pruebas fallan ya (si alguna). La Task 6 compara contra esta lista.
3. Docker disponible para `npm run porteria:db:test` (puerto 3308 libre).

---

### Task 1: Configuración del módulo (`entorno.js`)

**Files:**
- Create: `src/porteria/config/entorno.js`
- Test: `src/porteria/__tests__/entorno.test.js`

**Interfaces:**
- Produces: `leerConexion(env?) → { ok:true, db:{host,port,user,password,database} } | { ok:false, motivo }`; `leerEntorno(env?) → { ok:true, advertencia:string|null, config:{ jwtSecret, jwtExpires, grupos:{ guarda, admin, adminGeneral }, db } } | { ok:false, motivo }`.

- [ ] **Step 1: Write the failing test**

```js
// src/porteria/__tests__/entorno.test.js
const { leerEntorno, leerConexion } = require('../config/entorno');

const base = () => ({
  DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p',
  PORTERIA_JWT_SECRET: 'x'.repeat(40),
  LDAP_GROUP_PORTERIA_GUARDA: 'PorteriaGuardas',
  LDAP_GROUP_PORTERIA_ADMIN: 'PorteriaAdmins',
});

describe('leerConexion', () => {
  test('usa las DB_* de Mantix con valores por defecto de puerto y base', () => {
    expect(leerConexion(base())).toEqual({
      ok: true, db: { host: 'h', port: 3306, user: 'u', password: 'p', database: 'serfuweb' },
    });
  });
  test('reporta las variables de conexión que faltan', () => {
    const r = leerConexion({ DB_HOST: 'h' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('Faltan variables: DB_USER, DB_PASSWORD');
  });
});

describe('leerEntorno', () => {
  test('configuración completa', () => {
    const r = leerEntorno({ ...base(), DB_PORT: '3310', DB_NAME: 'otra', LDAP_GROUP_ADMIN: 'Admins' });
    expect(r).toEqual({
      ok: true,
      advertencia: null,
      config: {
        jwtSecret: 'x'.repeat(40),
        jwtExpires: '12h',
        grupos: { guarda: 'PorteriaGuardas', admin: 'PorteriaAdmins', adminGeneral: 'Admins' },
        db: { host: 'h', port: 3310, user: 'u', password: 'p', database: 'otra' },
      },
    });
  });
  test('sin LDAP_GROUP_ADMIN el admin general queda en null y respeta PORTERIA_JWT_EXPIRES', () => {
    const r = leerEntorno({ ...base(), PORTERIA_JWT_EXPIRES: '8h' });
    expect(r.config.grupos.adminGeneral).toBeNull();
    expect(r.config.jwtExpires).toBe('8h');
  });
  test.each(['PORTERIA_JWT_SECRET', 'LDAP_GROUP_PORTERIA_GUARDA', 'LDAP_GROUP_PORTERIA_ADMIN', 'DB_HOST'])(
    'falta %s → deshabilitado', (variable) => {
      const env = { ...base(), [variable]: '   ' };
      const r = leerEntorno(env);
      expect(r.ok).toBe(false);
      expect(r.motivo).toContain(variable);
    });
  test.each(['JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'TRK_JWT_SECRET'])(
    'secreto igual a %s → deshabilitado', (otro) => {
      const env = { ...base(), [otro]: 'x'.repeat(40) };
      expect(leerEntorno(env)).toEqual({
        ok: false,
        motivo: 'PORTERIA_JWT_SECRET debe ser distinto de JWT_SECRET, IDENTIDAD_JWT_SECRET y TRK_JWT_SECRET',
      });
    });
  test('secreto corto solo advierte', () => {
    const r = leerEntorno({ ...base(), PORTERIA_JWT_SECRET: 'corto' });
    expect(r.ok).toBe(true);
    expect(r.advertencia).toBe('PORTERIA_JWT_SECRET tiene menos de 32 caracteres');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/porteria/__tests__/entorno.test.js`
Expected: FAIL — `Cannot find module '../config/entorno'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/porteria/config/entorno.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/porteria/__tests__/entorno.test.js`
Expected: PASS (todas las pruebas)

- [ ] **Step 5: Commit**

```bash
git add src/porteria/config/entorno.js src/porteria/__tests__/entorno.test.js
git commit -m "feat(porteria): lectura y validación de la configuración del módulo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Contrato de error (`PorteriaError`, `apiCodigo`, `errorHandler`)

**Files:**
- Create: `src/porteria/utils/PorteriaError.js`
- Create: `src/porteria/middleware/apiCodigo.js`
- Create: `src/porteria/middleware/errorHandler.js`
- Test: `src/porteria/__tests__/contratoError.test.js`

**Interfaces:**
- Consumes: `src/utils/AppError.js` (`new AppError(message, statusCode)`), `src/utils/logger.js` (winston, tiene `.child()`), `src/trk/utils/errorSeguro.js` (`errorParaLog(err)`), `src/testing/servidorPrueba.js` (`servir(app)`, `cerrarServidores()`).
- Produces:
  - `new PorteriaError(statusCode, motivo, message, errors?)`
  - `apiCodigo(codigo) → middleware` que fija `req.porApiCodigo`, `req.porLog` y la cabecera `X-POR-API`; en respuestas `{success:false}` completa `error` y `motivo`.
  - `porteriaErrorHandler(err, req, res, next)`; `SIN_CODIGO = 'POR-SIN-CODIGO'`.
  - `MOTIVO_POR_STATUS` (exportado por `apiCodigo.js` como propiedad `apiCodigo.MOTIVO_POR_STATUS`).

- [ ] **Step 1: Write the failing test**

```js
// src/porteria/__tests__/contratoError.test.js
const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const apiCodigo = require('../middleware/apiCodigo');
const { porteriaErrorHandler } = require('../middleware/errorHandler');
const PorteriaError = require('../utils/PorteriaError');

afterEach(cerrarServidores);

function appCon(manejador) {
  const app = express();
  app.use(express.json());
  app.post('/x', apiCodigo('POR-TST-001'), manejador);
  app.use('/', porteriaErrorHandler);
  return app;
}

test('PorteriaError produce el contrato con código, motivo y errores', async () => {
  const app = appCon((req, res, next) => next(
    new PorteriaError(409, 'SENTIDO_INCOHERENTE', 'El vehículo ya figura dentro', { estado: { dentro: true } }),
  ));
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.status).toBe(409);
  expect(r.headers['x-por-api']).toBe('POR-TST-001');
  expect(r.body).toEqual({
    success: false, error: 'POR-TST-001', motivo: 'SENTIDO_INCOHERENTE',
    message: 'El vehículo ya figura dentro', errors: { estado: { dentro: true } },
  });
});

test('un error inesperado responde 500 genérico sin filtrar detalles', async () => {
  const app = appCon(() => { throw new Error("Duplicate entry 'ABC123'"); });
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.status).toBe(500);
  expect(r.body).toEqual({
    success: false, error: 'POR-TST-001', motivo: 'ERROR_INTERNO', message: 'Error interno del servidor',
  });
});

test('una respuesta de error directa recibe código y motivo según el status', async () => {
  const app = appCon((req, res) => res.status(403).json({ success: false, message: 'Sin permiso' }));
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.body).toEqual({ success: false, error: 'POR-TST-001', motivo: 'SIN_PERMISO', message: 'Sin permiso' });
});

test('503 directo lleva motivo NO_DISPONIBLE', async () => {
  const app = appCon((req, res) => res.status(503).json({ success: false, message: 'Caído' }));
  const r = await request(await servir(app)).post('/x').send({});
  expect(r.body.motivo).toBe('NO_DISPONIBLE');
});

test('JSON inválido → 400 VALIDACION', async () => {
  const app = appCon((req, res) => res.json({ success: true }));
  const r = await request(await servir(app)).post('/x').set('Content-Type', 'application/json').send('{malo');
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ success: false, error: 'POR-SIN-CODIGO', motivo: 'VALIDACION', message: 'JSON inválido' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/porteria/__tests__/contratoError.test.js`
Expected: FAIL — `Cannot find module '../middleware/apiCodigo'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/porteria/utils/PorteriaError.js
const AppError = require('../../utils/AppError');

// Error operativo de Portería: status HTTP + motivo estable + mensaje para el usuario.
class PorteriaError extends AppError {
  constructor(statusCode, motivo, message, errors) {
    super(message, statusCode);
    this.motivo = motivo;
    if (errors) this.errors = errors;
  }
}

module.exports = PorteriaError;
```

```js
// src/porteria/middleware/apiCodigo.js
const logger = require('../../utils/logger');

const MOTIVO_POR_STATUS = {
  400: 'VALIDACION',
  401: 'NO_AUTENTICADO',
  403: 'SIN_PERMISO',
  404: 'NO_ENCONTRADO',
  409: 'CONFLICTO',
  422: 'VALIDACION',
  429: 'DEMASIADOS_INTENTOS',
  503: 'NO_DISPONIBLE',
};

/**
 * Primer middleware de toda ruta de Portería: fija el código de API, la cabecera X-POR-API y el
 * logger hijo, y garantiza que cualquier respuesta de error lleve { error: <código>, motivo }.
 */
function apiCodigo(codigo) {
  const middleware = (req, res, next) => {
    const inicio = Date.now();
    req.porApiCodigo = codigo;
    req.porLog = logger.child({ modulo: 'porteria', api_codigo: codigo });
    res.setHeader('X-POR-API', codigo);

    const jsonOriginal = res.json.bind(res);
    res.json = (cuerpo) => {
      if (cuerpo && cuerpo.success === false) {
        cuerpo.error = codigo;
        if (!cuerpo.motivo) cuerpo.motivo = MOTIVO_POR_STATUS[res.statusCode] || 'ERROR';
      }
      return jsonOriginal(cuerpo);
    };

    res.on('finish', () => {
      req.porLog.info('porteria request', {
        metodo: req.method,
        ruta: req.originalUrl.split('?')[0], // sin query: puede llevar placas o documentos
        status: res.statusCode,
        ms: Date.now() - inicio,
        usuario: req.porUsuario ? req.porUsuario.usuario : null,
      });
    });
    next();
  };
  middleware.porApiCodigo = codigo;
  return middleware;
}

apiCodigo.MOTIVO_POR_STATUS = MOTIVO_POR_STATUS;
module.exports = apiCodigo;
```

```js
// src/porteria/middleware/errorHandler.js
const logger = require('../../utils/logger');
const PorteriaError = require('../utils/PorteriaError');
const { errorParaLog } = require('../../trk/utils/errorSeguro');

const SIN_CODIGO = 'POR-SIN-CODIGO';

// Último middleware del router de Portería (y de /api/porteria en app.js para errores del parser).
// eslint-disable-next-line no-unused-vars
function porteriaErrorHandler(err, req, res, next) {
  const codigo = req.porApiCodigo || SIN_CODIGO;
  const log = req.porLog || logger.child({ modulo: 'porteria', api_codigo: codigo });
  if (!res.getHeader('X-POR-API')) res.setHeader('X-POR-API', codigo);

  let status = 500;
  let motivo = 'ERROR_INTERNO';
  let message = 'Error interno del servidor';
  let errors;

  if (err instanceof PorteriaError) {
    ({ statusCode: status, motivo, message, errors } = err);
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400; motivo = 'VALIDACION'; message = 'JSON inválido';
  } else if (err && err.type === 'entity.too.large') {
    status = 413; motivo = 'VALIDACION'; message = 'El cuerpo de la solicitud es demasiado grande';
  }

  if (status >= 500) log.error('porteria error no controlado', errorParaLog(err));
  else log.warn('porteria error', { status, motivo, message });

  const cuerpo = { success: false, error: codigo, motivo, message };
  if (errors) cuerpo.errors = errors;
  res.status(status).json(cuerpo);
}

module.exports = { porteriaErrorHandler, SIN_CODIGO };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/porteria/__tests__/contratoError.test.js`
Expected: PASS (5 pruebas)

- [ ] **Step 5: Commit**

```bash
git add src/porteria/utils src/porteria/middleware src/porteria/__tests__/contratoError.test.js
git commit -m "feat(porteria): contrato de error y middleware de código de API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pool perezoso y migrador

**Files:**
- Create: `src/porteria/db.js`
- Create: `src/porteria/scripts/migrador.js`
- Create: `src/porteria/scripts/migrar.js`
- Test: `src/porteria/__tests__/db.test.js`
- Test: `src/porteria/__tests__/migrador.test.js`

**Interfaces:**
- Consumes: `leerConexion()` (Task 1).
- Produces:
  - `crearPool(cfg) → mysql2 Pool`
  - `crearBdPerezosa(cfgFn) → { obtener(): Pool, ping(): Promise<void>, cerrar(): Promise<void> }` — no llama `cfgFn` hasta el primer `obtener()`.
  - `aplicarMigraciones(conn, dir = DIR_MIGRACIONES, log = () => {}) → Promise<string[]>` (nombres aplicados); `DIR_MIGRACIONES`.

- [ ] **Step 1: Write the failing tests**

```js
// src/porteria/__tests__/db.test.js
jest.mock('mysql2/promise', () => ({ createPool: jest.fn() }));
const mysql = require('mysql2/promise');
const { crearBdPerezosa } = require('../db');

beforeEach(() => mysql.createPool.mockReset());

test('no lee la configuración ni crea el pool hasta el primer uso', async () => {
  const query = jest.fn().mockResolvedValue([[{ 1: 1 }]]);
  mysql.createPool.mockReturnValue({ query, end: jest.fn().mockResolvedValue() });
  const cfgFn = jest.fn(() => ({ host: 'h', port: 1, user: 'u', password: 'p', database: 'd' }));

  const bd = crearBdPerezosa(cfgFn);
  expect(cfgFn).not.toHaveBeenCalled();

  await bd.ping();
  await bd.ping();
  expect(cfgFn).toHaveBeenCalledTimes(1);
  expect(mysql.createPool).toHaveBeenCalledTimes(1);
  expect(mysql.createPool.mock.calls[0][0]).toMatchObject({ timezone: '-05:00', charset: 'utf8mb4', host: 'h' });
  expect(query).toHaveBeenCalledWith('SELECT 1');
});

test('cerrar libera el pool y el siguiente uso crea uno nuevo', async () => {
  const end = jest.fn().mockResolvedValue();
  mysql.createPool.mockReturnValue({ query: jest.fn().mockResolvedValue([[]]), end });
  const bd = crearBdPerezosa(() => ({}));
  bd.obtener();
  await bd.cerrar();
  expect(end).toHaveBeenCalledTimes(1);
  bd.obtener();
  expect(mysql.createPool).toHaveBeenCalledTimes(2);
});
```

```js
// src/porteria/__tests__/migrador.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { aplicarMigraciones } = require('../scripts/migrador');

function dirCon(archivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'por-mig-'));
  for (const [nombre, sql] of Object.entries(archivos)) fs.writeFileSync(path.join(dir, nombre), sql);
  return dir;
}

function connFalsa(yaAplicadas) {
  const llamadas = [];
  return {
    llamadas,
    query: jest.fn(async (sql, params) => {
      llamadas.push([sql, params]);
      if (/^SELECT nombre FROM por_migraciones/.test(sql)) return [yaAplicadas.map((nombre) => ({ nombre }))];
      return [[]];
    }),
  };
}

test('aplica en orden solo las migraciones pendientes y las registra', async () => {
  const dir = dirCon({
    '002_b.sql': 'SQL B', '001_a.sql': 'SQL A', '003_c.sql': 'SQL C', 'notas.txt': 'x', '4_mal.sql': 'x',
  });
  const conn = connFalsa(['001_a.sql']);
  const aplicadas = await aplicarMigraciones(conn, dir);

  expect(aplicadas).toEqual(['002_b.sql', '003_c.sql']);
  const sqls = conn.llamadas.map(([sql]) => sql);
  expect(sqls[0]).toMatch(/CREATE TABLE IF NOT EXISTS por_migraciones/);
  expect(sqls).toContain('SQL B');
  expect(sqls).not.toContain('SQL A');
  expect(sqls.indexOf('SQL B')).toBeLessThan(sqls.indexOf('SQL C'));
  expect(conn.llamadas).toContainEqual(['INSERT INTO por_migraciones (nombre) VALUES (?)', ['003_c.sql']]);
});

test('el directorio real solo tiene migraciones con nombre válido', () => {
  const { DIR_MIGRACIONES } = require('../scripts/migrador');
  const archivos = fs.readdirSync(DIR_MIGRACIONES);
  expect(archivos.length).toBeGreaterThan(0);
  for (const a of archivos) expect(a).toMatch(/^\d{3}_[a-z0-9_]+\.sql$/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/porteria/__tests__/db.test.js src/porteria/__tests__/migrador.test.js`
Expected: FAIL — `Cannot find module '../db'` y `Cannot find module '../scripts/migrador'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/porteria/db.js
// Pool mysql2 propio del módulo (no usa el Sequelize de Mantix). Misma base que H360/Mantix.
const mysql = require('mysql2/promise');

function crearPool(cfg) {
  return mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
    // Las fechas se guardan en la zona de la sesión (Colombia); el pool debe leerlas en la misma zona.
    timezone: '-05:00',
    connectionLimit: 10,
  });
}

/** El pool se crea en el primer uso: Mantix arranca aunque la configuración de Portería esté incompleta. */
function crearBdPerezosa(cfgFn) {
  let pool = null;
  const obtener = () => {
    if (!pool) pool = crearPool(cfgFn());
    return pool;
  };
  return {
    obtener,
    async ping() { await obtener().query('SELECT 1'); },
    async cerrar() {
      if (!pool) return;
      const actual = pool;
      pool = null;
      await actual.end();
    },
  };
}

module.exports = { crearPool, crearBdPerezosa };
```

```js
// src/porteria/scripts/migrador.js
/**
 * Aplica en orden las migraciones NNN_*.sql de src/porteria/migrations que no estén registradas
 * en por_migraciones. La conexión debe tener multipleStatements.
 */
const fs = require('fs');
const path = require('path');

const DIR_MIGRACIONES = path.join(__dirname, '..', 'migrations');
const PATRON = /^\d{3}_[a-z0-9_]+\.sql$/;

async function aplicarMigraciones(conn, dir = DIR_MIGRACIONES, log = () => {}) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS por_migraciones (
       nombre VARCHAR(150) NOT NULL PRIMARY KEY,
       aplicada_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  const [filas] = await conn.query('SELECT nombre FROM por_migraciones');
  const hechas = new Set(filas.map((f) => f.nombre));
  const archivos = fs.readdirSync(dir).filter((f) => PATRON.test(f)).sort();

  const aplicadas = [];
  for (const archivo of archivos) {
    if (hechas.has(archivo)) continue;
    await conn.query(fs.readFileSync(path.join(dir, archivo), 'utf8'));
    await conn.query('INSERT INTO por_migraciones (nombre) VALUES (?)', [archivo]);
    aplicadas.push(archivo);
    log(archivo);
  }
  return aplicadas;
}

module.exports = { aplicarMigraciones, DIR_MIGRACIONES };
```

```js
// src/porteria/scripts/migrar.js
// npm run porteria:migrate — aplica las migraciones pendientes del módulo Portería.
require('dotenv').config();
const mysql = require('mysql2/promise');
const { leerConexion } = require('../config/entorno');
const { aplicarMigraciones } = require('./migrador');

async function main() {
  const conexion = leerConexion();
  if (!conexion.ok) {
    console.error(`porteria:migrate — ${conexion.motivo}`);
    process.exitCode = 1;
    return;
  }
  const conn = await mysql.createConnection({ ...conexion.db, charset: 'utf8mb4', multipleStatements: true });
  try {
    const aplicadas = await aplicarMigraciones(conn, undefined, (a) => console.log(`aplicada ${a}`));
    console.log(aplicadas.length ? `${aplicadas.length} migración(es) aplicada(s)` : 'Sin migraciones pendientes');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('porteria:migrate falló:', err.message);
  process.exitCode = 1;
});
```

Nota: la segunda prueba de `migrador.test.js` necesita al menos un archivo en `src/porteria/migrations/`; queda en rojo hasta la Task 4. Para cerrar esta tarea en verde, crea ya el archivo vacío de la Task 4:

```bash
mkdir -p src/porteria/migrations && printf -- '-- Esquema del módulo Portería (se completa en la Task 4)\nSELECT 1;\n' > src/porteria/migrations/001_esquema.sql
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/porteria/__tests__/db.test.js src/porteria/__tests__/migrador.test.js`
Expected: PASS (4 pruebas)

- [ ] **Step 5: Commit**

```bash
git add src/porteria/db.js src/porteria/scripts src/porteria/migrations src/porteria/__tests__/db.test.js src/porteria/__tests__/migrador.test.js
git commit -m "feat(porteria): pool perezoso y migrador con tabla de control

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Esquema, seed de motivos, vista e infraestructura de integración

**Files:**
- Modify: `src/porteria/migrations/001_esquema.sql` (reemplaza el marcador de la Task 3)
- Create: `src/porteria/migrations/002_seed_motivos.sql`
- Create: `src/porteria/migrations/003_vista_movimientos.sql`
- Create: `src/porteria/testing/docker-compose.yml`
- Create: `src/porteria/testing/env.js`
- Create: `src/porteria/testing/globalSetup.js`
- Create: `src/porteria/testing/bd.js`
- Create: `src/porteria/testing/sql/h360_minimo.sql`
- Create: `jest.porteria-int.config.js`
- Modify: `package.json` (scripts)
- Test: `src/porteria/__tests__/migraciones.int.test.js`

**Interfaces:**
- Consumes: `aplicarMigraciones` (Task 3).
- Produces (para fases siguientes):
  - Tablas `por_motivos`, `por_vehiculos_externos`, `por_eventos`, `por_estado_vehiculo`, `por_auditoria`; vista `v_por_movimientos`.
  - `abrirConexion() → Promise<mysql2 Connection>` (testing/bd.js) contra la base de prueba.
  - Esquema mínimo de H360 para pruebas: `sedes`, `vehiculos`, `asistencias`, `exequias`.

- [ ] **Step 1: Write the failing integration test**

```js
// src/porteria/__tests__/migraciones.int.test.js
const { abrirConexion } = require('../testing/bd');
const { aplicarMigraciones } = require('../scripts/migrador');

let conn;
beforeAll(async () => { conn = await abrirConexion(); });
afterAll(async () => { await conn.end(); });

test('las tres migraciones quedan registradas y un segundo intento no aplica nada', async () => {
  const [filas] = await conn.query('SELECT nombre FROM por_migraciones ORDER BY nombre');
  expect(filas.map((f) => f.nombre)).toEqual([
    '001_esquema.sql', '002_seed_motivos.sql', '003_vista_movimientos.sql',
  ]);
  expect(await aplicarMigraciones(conn)).toEqual([]);
});

test('el seed crea los 12 motivos con su configuración', async () => {
  const [motivos] = await conn.query(
    `SELECT codigo, aplica_propio, aplica_proveedor_asistencia, aplica_proveedor,
            tipo_referencia, referencia_obligatoria
       FROM por_motivos ORDER BY orden`,
  );
  expect(motivos).toHaveLength(12);
  const porCodigo = Object.fromEntries(motivos.map((m) => [m.codigo, m]));
  expect(porCodigo.SERES_QUERIDOS).toMatchObject({ aplica_propio: 1, tipo_referencia: 'ASISTENCIA', referencia_obligatoria: 1 });
  expect(porCodigo.EXEQUIAS).toMatchObject({ tipo_referencia: 'EXEQUIA', referencia_obligatoria: 1 });
  expect(porCodigo.TANQUEO).toMatchObject({ tipo_referencia: 'NINGUNA', referencia_obligatoria: 0 });
  expect(porCodigo.SERES_QUERIDOS_TERCERIZADA).toMatchObject({
    aplica_propio: 0, aplica_proveedor_asistencia: 1, aplica_proveedor: 0, tipo_referencia: 'ASISTENCIA',
  });
  expect(porCodigo.OTRO).toMatchObject({
    aplica_propio: 0, aplica_proveedor_asistencia: 1, aplica_proveedor: 1, tipo_referencia: 'TEXTO', referencia_obligatoria: 1,
  });
});

test('la vista calcula duración y km del viaje con par y omite anulados', async () => {
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (901, 'S901', 'Sede vista', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (901, 'VIS901', 'Ford', 'X', 'CARROZA', 1)");
  const [[motivo]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'TANQUEO'");
  const [salida] = await conn.query(
    `INSERT INTO por_eventos (sede_id, sentido, tipo_vehiculo, placa, vehiculo_id, conductor_nombre, motivo_id,
                              kilometraje, registrado_at, registrado_por)
     VALUES (901, 'SALIDA', 'PROPIO', 'VIS901', 901, 'Juan', ?, 1000, '2026-10-30 08:00:00', 'guarda1')`, [motivo.id]);
  await conn.query(
    `INSERT INTO por_eventos (sede_id, sentido, tipo_vehiculo, placa, vehiculo_id, conductor_nombre, motivo_id,
                              kilometraje, evento_par_id, registrado_at, registrado_por)
     VALUES (901, 'INGRESO', 'PROPIO', 'VIS901', 901, 'Juan', ?, 1042, ?, '2026-10-30 09:30:00', 'guarda1')`,
    [motivo.id, salida.insertId]);
  await conn.query(
    `INSERT INTO por_eventos (sede_id, sentido, tipo_vehiculo, placa, conductor_nombre, motivo_id,
                              registrado_at, registrado_por, anulado)
     VALUES (901, 'SALIDA', 'PROPIO', 'VIS901', 'Juan', ?, '2026-10-30 10:00:00', 'guarda1', 1)`, [motivo.id]);

  const [filas] = await conn.query(
    "SELECT sentido, sede_nombre, motivo_codigo, duracion_min, km_recorridos FROM v_por_movimientos WHERE placa = 'VIS901' ORDER BY registrado_at",
  );
  expect(filas).toEqual([
    { sentido: 'SALIDA', sede_nombre: 'Sede vista', motivo_codigo: 'TANQUEO', duracion_min: null, km_recorridos: null },
    { sentido: 'INGRESO', sede_nombre: 'Sede vista', motivo_codigo: 'TANQUEO', duracion_min: 90, km_recorridos: 42 },
  ]);
});

test('por_estado_vehiculo tiene la placa como clave primaria', async () => {
  const [[pk]] = await conn.query(
    `SELECT GROUP_CONCAT(COLUMN_NAME) AS columnas FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_estado_vehiculo' AND CONSTRAINT_NAME = 'PRIMARY'`,
  );
  expect(pk.columnas).toBe('placa');
});
```

- [ ] **Step 2: Create the test infrastructure**

```yaml
# src/porteria/testing/docker-compose.yml
services:
  mysql-porteria-test:
    image: mysql:8.0
    container_name: mysql-porteria-test
    environment:
      MYSQL_ROOT_PASSWORD: por_test
    command: ["--character-set-server=utf8mb4", "--collation-server=utf8mb4_unicode_ci", "--default-time-zone=-05:00"]
    ports:
      - "127.0.0.1:3308:3306"
    tmpfs:
      - /var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-ppor_test"]
      interval: 2s
      timeout: 2s
      retries: 30
```

```js
// src/porteria/testing/env.js
// Valores por defecto para las pruebas de integración de Portería. No pisa variables ya definidas.
const DEFAULTS = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3308',
  DB_NAME: 'porteria_test',
  DB_USER: 'root',
  DB_PASSWORD: 'por_test',
  JWT_SECRET: 'test-jwt-mantix',
  PORTERIA_JWT_SECRET: 'test-jwt-porteria-0123456789abcdef0123',
  LDAP_GROUP_PORTERIA_GUARDA: 'PorteriaGuardas',
  LDAP_GROUP_PORTERIA_ADMIN: 'PorteriaAdmins',
  LOG_LEVEL: 'error',
};

for (const [clave, valor] of Object.entries(DEFAULTS)) {
  if (!process.env[clave]) process.env[clave] = valor;
}

module.exports = DEFAULTS;
```

```js
// src/porteria/testing/bd.js
// Conexión a la base de pruebas (la crea globalSetup). Solo se permite una base *_test.
require('./env');
const mysql = require('mysql2/promise');

async function abrirConexion() {
  const bd = process.env.DB_NAME;
  if (!/_test$/.test(bd)) throw new Error(`Por seguridad, la BD de pruebas debe terminar en _test (recibido: ${bd})`);
  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: bd,
    charset: 'utf8mb4',
    timezone: '-05:00',
    multipleStatements: true,
  });
}

module.exports = { abrirConexion };
```

```js
// src/porteria/testing/globalSetup.js
// Recrea la base de pruebas: esquema mínimo de H360 + migraciones de Portería. Una vez por corrida.
require('./env');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { aplicarMigraciones } = require('../scripts/migrador');

module.exports = async () => {
  const bd = process.env.DB_NAME;
  if (!/_test$/.test(bd)) throw new Error(`Por seguridad, la BD de pruebas debe terminar en _test (recibido: ${bd})`);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${bd}\``);
  await conn.query(`CREATE DATABASE \`${bd}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${bd}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, 'sql', 'h360_minimo.sql'), 'utf8'));
  await aplicarMigraciones(conn);
  await conn.end();
};
```

```sql
-- src/porteria/testing/sql/h360_minimo.sql
-- Esquema MÍNIMO de las tablas de H360/Mantix que Portería lee, solo para pruebas.
-- Columnas tomadas de los controladores de H360; en la Fase 1 se contrasta con SHOW CREATE TABLE
-- de la base real y se ajusta este archivo (no el código) si difiere.
CREATE TABLE sedes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(10) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  direccion VARCHAR(200) NULL,
  ciudad VARCHAR(100) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vehiculos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  placa VARCHAR(20) NOT NULL,
  marca VARCHAR(50) NULL,
  modelo VARCHAR(50) NULL,
  anio INT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'CARROZA',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  observaciones TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE asistencias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL,
  nombre_ser_querido VARCHAR(200) NULL,
  contrato VARCHAR(50) NULL,
  conductor_id VARCHAR(100) NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'NUEVO',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exequias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asistencia_id INT NULL,
  tipo VARCHAR(50) NULL,
  fecha DATE NULL,
  hora TIME NULL,
  lugar VARCHAR(200) NULL,
  vehiculo_id INT NULL,
  conductor_id VARCHAR(100) NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_CONFIRMAR',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

```js
// jest.porteria-int.config.js
// Pruebas de integración de Portería contra MySQL de prueba (npm run porteria:db:test).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/porteria/**/*.int.test.js'],
  setupFiles: ['<rootDir>/src/porteria/testing/env.js'],
  globalSetup: '<rootDir>/src/porteria/testing/globalSetup.js',
  testTimeout: 30000,
};
```

En `package.json`, dentro de `"scripts"`, después de `"test:bigday:int"`, agregar:

```json
    "test:porteria": "jest src/porteria",
    "test:porteria:int": "jest -c jest.porteria-int.config.js --runInBand",
    "porteria:db:test": "docker compose -f src/porteria/testing/docker-compose.yml up -d --wait",
    "porteria:migrate": "node src/porteria/scripts/migrar.js"
```

(Recuerda la coma al final de la línea `"test:bigday:int": ...`.)

- [ ] **Step 3: Run the integration test to verify it fails**

Run: `npm run porteria:db:test && npm run test:porteria:int`
Expected: FAIL — `por_migraciones` contiene solo `001_esquema.sql` y no existe la tabla `por_motivos`.

- [ ] **Step 4: Write the migrations**

```sql
-- src/porteria/migrations/001_esquema.sql
-- Esquema del módulo Portería. sede_id, vehiculo_id, asistencia_id y exequia_id son FK lógicas
-- a tablas de H360 (sin restricción: Portería no depende de su esquema ni lo modifica).

CREATE TABLE IF NOT EXISTS por_motivos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  aplica_propio TINYINT(1) NOT NULL DEFAULT 0,
  aplica_proveedor_asistencia TINYINT(1) NOT NULL DEFAULT 0,
  aplica_proveedor TINYINT(1) NOT NULL DEFAULT 0,
  aplica_ingreso TINYINT(1) NOT NULL DEFAULT 1,
  aplica_salida TINYINT(1) NOT NULL DEFAULT 1,
  tipo_referencia ENUM('NINGUNA','ASISTENCIA','EXEQUIA','TEXTO') NOT NULL DEFAULT 'NINGUNA',
  referencia_obligatoria TINYINT(1) NOT NULL DEFAULT 0,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(100) NULL,
  UNIQUE KEY uq_por_motivos_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS por_vehiculos_externos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  placa VARCHAR(20) NOT NULL,
  tipo ENUM('PROVEEDOR_ASISTENCIA','PROVEEDOR') NOT NULL,
  empresa VARCHAR(150) NOT NULL,
  descripcion VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) NOT NULL,
  updated_at DATETIME NULL,
  updated_by VARCHAR(100) NULL,
  UNIQUE KEY uq_por_vext_placa (placa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS por_eventos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sede_id INT NOT NULL,
  sentido ENUM('INGRESO','SALIDA') NOT NULL,
  tipo_vehiculo ENUM('PROPIO','PROVEEDOR_ASISTENCIA','PROVEEDOR') NOT NULL,
  placa VARCHAR(20) NOT NULL,
  vehiculo_id INT NULL,
  vehiculo_externo_id INT NULL,
  conductor_usuario VARCHAR(100) NULL,
  conductor_nombre VARCHAR(150) NOT NULL,
  conductor_documento VARCHAR(30) NULL,
  conductor_otro TINYINT(1) NOT NULL DEFAULT 0,
  empresa VARCHAR(150) NULL,
  motivo_id INT NOT NULL,
  asistencia_id INT NULL,
  exequia_id INT NULL,
  referencia_texto VARCHAR(255) NULL,
  referencia_snapshot JSON NULL,
  evento_par_id INT NULL,
  kilometraje INT NULL,
  observaciones VARCHAR(500) NULL,
  inconsistente TINYINT(1) NOT NULL DEFAULT 0,
  inconsistencia_tipo ENUM('INGRESO_ESTANDO_DENTRO','SALIDA_ESTANDO_FUERA') NULL,
  registrado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  registrado_por VARCHAR(100) NOT NULL,
  corregido_at DATETIME NULL,
  corregido_por VARCHAR(100) NULL,
  anulado TINYINT(1) NOT NULL DEFAULT 0,
  anulado_por VARCHAR(100) NULL,
  anulado_at DATETIME NULL,
  anulado_motivo VARCHAR(255) NULL,
  KEY ix_por_eventos_sede_fecha (sede_id, registrado_at),
  KEY ix_por_eventos_placa_fecha (placa, registrado_at),
  KEY ix_por_eventos_motivo (motivo_id),
  KEY ix_por_eventos_inconsistente (inconsistente),
  KEY ix_por_eventos_par (evento_par_id),
  CONSTRAINT fk_por_eventos_motivo FOREIGN KEY (motivo_id) REFERENCES por_motivos (id),
  CONSTRAINT fk_por_eventos_vext FOREIGN KEY (vehiculo_externo_id) REFERENCES por_vehiculos_externos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Estado actual: una fila por placa (no por sede). Tabla derivada de por_eventos; se actualiza en la
-- misma transacción que cada evento y se recalcula al anular.
CREATE TABLE IF NOT EXISTS por_estado_vehiculo (
  placa VARCHAR(20) NOT NULL PRIMARY KEY,
  tipo_vehiculo ENUM('PROPIO','PROVEEDOR_ASISTENCIA','PROVEEDOR') NOT NULL,
  sede_id INT NOT NULL,
  dentro TINYINT(1) NOT NULL,
  ultimo_evento_id INT NOT NULL,
  salida_abierta_id INT NULL,
  actualizado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_por_estado_sede_dentro (sede_id, dentro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS por_auditoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(100) NOT NULL,
  api_codigo VARCHAR(20) NULL,
  entidad VARCHAR(40) NOT NULL,
  entidad_id INT NOT NULL,
  accion ENUM('CREAR','CORREGIR','ANULAR','FORZAR') NOT NULL,
  antes JSON NULL,
  despues JSON NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_por_auditoria_entidad (entidad, entidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

```sql
-- src/porteria/migrations/002_seed_motivos.sql
-- Motivos iniciales (editables desde el admin). Todos aplican a ingreso y salida.
INSERT INTO por_motivos
  (codigo, nombre, aplica_propio, aplica_proveedor_asistencia, aplica_proveedor,
   tipo_referencia, referencia_obligatoria, orden, updated_by)
VALUES
  ('SERES_QUERIDOS',             'Seres queridos (asistencia)',             1, 0, 0, 'ASISTENCIA', 1,  10, 'seed'),
  ('EXEQUIAS',                   'Exequias',                                1, 0, 0, 'EXEQUIA',    1,  20, 'seed'),
  ('TRASLADOS',                  'Traslados',                               1, 0, 0, 'TEXTO',      1,  30, 'seed'),
  ('RECOGIDA_COFRES',            'Recogida de cofres',                      1, 0, 0, 'NINGUNA',    0,  40, 'seed'),
  ('EQUIPOS_VELACION',           'Equipos de velación',                     1, 0, 0, 'NINGUNA',    0,  50, 'seed'),
  ('TANQUEO',                    'Tanqueo',                                 1, 0, 0, 'NINGUNA',    0,  60, 'seed'),
  ('LAVADO',                     'Lavado',                                  1, 0, 0, 'NINGUNA',    0,  70, 'seed'),
  ('MANTENIMIENTO',              'Mantenimiento',                           1, 0, 0, 'NINGUNA',    0,  80, 'seed'),
  ('SERES_QUERIDOS_TERCERIZADA', 'Seres queridos (asistencia tercerizada)', 0, 1, 0, 'ASISTENCIA', 1,  90, 'seed'),
  ('ENTREGA_MERCANCIA',          'Entrega de mercancía',                    0, 0, 1, 'NINGUNA',    0, 100, 'seed'),
  ('MANTENIMIENTO_SERVICIO',     'Mantenimiento / servicio técnico',        0, 0, 1, 'NINGUNA',    0, 110, 'seed'),
  ('OTRO',                       'Otro',                                    0, 1, 1, 'TEXTO',      1, 120, 'seed');
```

```sql
-- src/porteria/migrations/003_vista_movimientos.sql
-- Vista para Superset: movimientos no anulados con sede, motivo y vehículo. En los ingresos que cierran
-- un viaje (evento_par_id) agrega la duración en minutos y los km recorridos.
CREATE OR REPLACE VIEW v_por_movimientos AS
SELECT
  e.id,
  e.registrado_at,
  e.sede_id,
  s.codigo AS sede_codigo,
  s.nombre AS sede_nombre,
  e.sentido,
  e.tipo_vehiculo,
  e.placa,
  v.marca AS vehiculo_marca,
  v.modelo AS vehiculo_modelo,
  e.empresa,
  e.conductor_nombre,
  e.conductor_otro,
  m.codigo AS motivo_codigo,
  m.nombre AS motivo_nombre,
  JSON_UNQUOTE(JSON_EXTRACT(e.referencia_snapshot, '$.codigo')) AS referencia_codigo,
  e.referencia_texto,
  e.kilometraje,
  e.inconsistente,
  e.inconsistencia_tipo,
  e.registrado_por,
  e.evento_par_id,
  CASE WHEN e.sentido = 'INGRESO' AND p.id IS NOT NULL
       THEN TIMESTAMPDIFF(MINUTE, p.registrado_at, e.registrado_at) END AS duracion_min,
  CASE WHEN e.sentido = 'INGRESO' AND e.kilometraje IS NOT NULL AND p.kilometraje IS NOT NULL
       THEN e.kilometraje - p.kilometraje END AS km_recorridos
FROM por_eventos e
JOIN por_motivos m ON m.id = e.motivo_id
LEFT JOIN sedes s ON s.id = e.sede_id
LEFT JOIN vehiculos v ON v.id = e.vehiculo_id
LEFT JOIN por_eventos p ON p.id = e.evento_par_id AND p.anulado = 0
WHERE e.anulado = 0;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:porteria:int`
Expected: PASS (4 pruebas). `globalSetup` recrea la base, así que no hace falta limpiar entre corridas.

Run: `npx jest src/porteria`
Expected: PASS (las unitarias siguen en verde; el `.int.test.js` se ignora por `testPathIgnorePatterns`).

- [ ] **Step 6: Commit**

```bash
git add src/porteria/migrations src/porteria/testing src/porteria/__tests__/migraciones.int.test.js jest.porteria-int.config.js package.json
git commit -m "feat(porteria): esquema, seed de motivos, vista Superset y pruebas de integración

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Router, `/health`, guardián 503 y montaje en Mantix

**Files:**
- Create: `src/porteria/routes/index.js`
- Modify: `src/routes/index.js` (líneas ~47-48 de requires y ~93-94 de montaje)
- Modify: `src/app.js` (limitador global ~línea 80; errorHandlers del parser ~líneas 93-96)
- Test: `src/porteria/__tests__/health.test.js`
- Test: `src/porteria/__tests__/montaje.test.js`

**Interfaces:**
- Consumes: `leerEntorno` (Task 1), `apiCodigo`, `porteriaErrorHandler` (Task 2), `crearBdPerezosa` (Task 3).
- Produces:
  - `crearRouterPorteria({ bd }) → express.Router` (fábrica inyectable; las fases siguientes le agregan sub-routers).
  - `router` (guardián de producción): 503 `{ success:false, error:'POR-SIS-000', motivo:'PORTERIA_DESHABILITADO', message }` si `leerEntorno()` no está ok.
  - `bd` (instancia de producción de `crearBdPerezosa`), exportada para que las fases siguientes la reutilicen.
  - Códigos: `POR-SIS-000` (módulo deshabilitado), `POR-SIS-001` (`GET /health`).

- [ ] **Step 1: Write the failing tests**

```js
// src/porteria/__tests__/health.test.js
const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearRouterPorteria } = require('../routes');

afterEach(cerrarServidores);

function appCon(bd) {
  const app = express();
  app.use('/api/porteria/v1', crearRouterPorteria({ bd }));
  return app;
}

test('health ok cuando la BD responde', async () => {
  const r = await request(await servir(appCon({ ping: async () => {} }))).get('/api/porteria/v1/health');
  expect(r.status).toBe(200);
  expect(r.headers['x-por-api']).toBe('POR-SIS-001');
  expect(r.body).toEqual({ success: true, data: { estado: 'ok', bd: 'ok' } });
});

test('health 503 cuando la BD no responde, sin filtrar el error', async () => {
  const bd = { ping: async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:3306'); } };
  const r = await request(await servir(appCon(bd))).get('/api/porteria/v1/health');
  expect(r.status).toBe(503);
  expect(r.body).toEqual({
    success: false, error: 'POR-SIS-001', motivo: 'NO_DISPONIBLE', message: 'La base de datos no responde',
  });
});
```

```js
// src/porteria/__tests__/montaje.test.js
// Carga la app real de Mantix: montaje en /api/porteria/v1, 503 si falta configuración y exención
// del limitador global.
process.env.RATE_LIMIT_MAX_REQUESTS = '2';
const VARIABLES = ['PORTERIA_JWT_SECRET', 'PORTERIA_JWT_EXPIRES', 'LDAP_GROUP_PORTERIA_GUARDA', 'LDAP_GROUP_PORTERIA_ADMIN',
  'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'TRK_JWT_SECRET'];
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const app = require('../../app');

afterEach(cerrarServidores);
afterEach(() => jest.restoreAllMocks());
beforeEach(() => { for (const v of VARIABLES) delete process.env[v]; });

const completas = () => Object.assign(process.env, {
  DB_HOST: '127.0.0.1', DB_PORT: '1', DB_USER: 'u', DB_PASSWORD: 'p',
  PORTERIA_JWT_SECRET: 'p'.repeat(40), LDAP_GROUP_PORTERIA_GUARDA: 'G', LDAP_GROUP_PORTERIA_ADMIN: 'A',
});

test('sin configuración responde 503 PORTERIA_DESHABILITADO y Mantix sigue vivo', async () => {
  const r = await request(await servir(app)).get('/api/porteria/v1/health');
  expect(r.status).toBe(503);
  expect(r.body).toEqual({
    success: false, error: 'POR-SIS-000', motivo: 'PORTERIA_DESHABILITADO',
    message: 'El módulo de Portería no está disponible: configuración del servidor incompleta',
  });
  expect(JSON.stringify(r.body)).not.toMatch(/PORTERIA_JWT|LDAP|DB_/);
  const otra = await request(await servir(app)).get('/api/ruta-mantix-inexistente-por');
  expect(otra.status).toBe(404);
});

test('secreto igual al de Mantix también deshabilita el módulo', async () => {
  completas();
  process.env.JWT_SECRET = process.env.PORTERIA_JWT_SECRET;
  const r = await request(await servir(app)).get('/api/porteria/v1/health');
  expect(r.body.motivo).toBe('PORTERIA_DESHABILITADO');
});

test('con configuración completa la ruta está montada (health 503 porque la BD no responde)', async () => {
  completas();
  const r = await request(await servir(app)).get('/api/porteria/v1/health');
  expect(r.status).toBe(503);
  expect(r.body.error).toBe('POR-SIS-001');
});

test('/api/porteria/ está exento del limitador global', async () => {
  for (let i = 0; i < 4; i++) {
    const r = await request(await servir(app)).get('/api/porteria/v1/health');
    expect(r.status).toBe(503);
  }
});

test('JSON inválido en /api/porteria responde con el contrato del módulo', async () => {
  const r = await request(await servir(app))
    .post('/api/porteria/v1/health').set('Content-Type', 'application/json').send('{malo');
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ success: false, motivo: 'VALIDACION', message: 'JSON inválido' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/porteria/__tests__/health.test.js src/porteria/__tests__/montaje.test.js`
Expected: FAIL — `Cannot find module '../routes'`; en montaje, 404 en `/api/porteria/v1/health`.

- [ ] **Step 3: Write the router**

```js
// src/porteria/routes/index.js
// ============================================
// Router del módulo Portería (/api/porteria/v1)
// ============================================
const express = require('express');
const logger = require('../../utils/logger');
const { leerEntorno } = require('../config/entorno');
const { crearBdPerezosa } = require('../db');
const apiCodigo = require('../middleware/apiCodigo');
const { porteriaErrorHandler } = require('../middleware/errorHandler');
const { errorParaLog } = require('../../trk/utils/errorSeguro');

/** Fábrica inyectable (tests): `bd` = { ping(), obtener() }. */
function crearRouterPorteria({ bd }) {
  const router = express.Router();

  router.get('/health', apiCodigo('POR-SIS-001'), async (req, res) => {
    try {
      await bd.ping();
      res.json({ success: true, data: { estado: 'ok', bd: 'ok' } });
    } catch (err) {
      req.porLog.error('porteria: falló el ping a la BD', errorParaLog(err));
      res.status(503).json({ success: false, message: 'La base de datos no responde' });
    }
  });

  router.use(porteriaErrorHandler);
  return router;
}

// Producción: el router se construye UNA vez al cargar (los limitadores de fases siguientes lo exigen).
// Nada aquí toca la red ni lanza si faltan variables: el pool se crea al primer uso.
const bd = crearBdPerezosa(() => leerEntorno().config.db);
const real = crearRouterPorteria({ bd });

// Si la configuración no es válida responde 503 sin tumbar Mantix (se re-evalúa por request, es barato).
let avisado = false;
function router(req, res, next) {
  const entorno = leerEntorno();
  if (!entorno.ok) {
    if (!avisado) {
      avisado = true;
      logger.error(`porteria deshabilitado: ${entorno.motivo}`);
    }
    res.setHeader('X-POR-API', 'POR-SIS-000');
    return res.status(503).json({
      success: false,
      error: 'POR-SIS-000',
      motivo: 'PORTERIA_DESHABILITADO',
      message: 'El módulo de Portería no está disponible: configuración del servidor incompleta',
    });
  }
  avisado = false;
  return real(req, res, next);
}

module.exports = { router, crearRouterPorteria, bd };
```

- [ ] **Step 4: Mount in Mantix**

En `src/routes/index.js`, después de `const bigdayRoutes = require('../bigday/routes').router; // ← Módulo October Big Day`:

```js
const porteriaRoutes = require('../porteria/routes').router; // ← Módulo Portería
```

y después de `router.use('/bigday/v1', bigdayRoutes); // ← Módulo October Big Day (encuesta)`:

```js
router.use('/porteria/v1', porteriaRoutes); // ← Módulo Portería (ingresos y salidas de vehículos)
```

En `src/app.js`, reemplazar la línea `skip:` del limitador global:

```js
  // Portería: las casetas de una sede pueden compartir IP; el módulo aplica su propio límite en el login.
  skip: (req) => req.originalUrl.startsWith('/api/trk/') || req.originalUrl.startsWith('/api/bigday/')
    || req.originalUrl.startsWith('/api/porteria/')
```

y después de `app.use('/api/bigday', require('./bigday/middleware/errorHandler').bigdayErrorHandler);`:

```js
// Portería: errores del body parser en /api/porteria/* con el contrato del módulo
app.use('/api/porteria', require('./porteria/middleware/errorHandler').porteriaErrorHandler);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/porteria`
Expected: PASS (todas las unitarias del módulo).

Run: `npx jest src/bigday/__tests__/montaje.test.js src/trk/__tests__/montaje.test.js`
Expected: PASS (el montaje de los otros módulos no cambia).

- [ ] **Step 6: Commit**

```bash
git add src/porteria/routes src/porteria/__tests__/health.test.js src/porteria/__tests__/montaje.test.js src/routes/index.js src/app.js
git commit -m "feat(porteria): router con health y montaje en /api/porteria/v1 (503 sin configuración)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verificación de cierre de la Fase 0

- [ ] **Step 1: Suite completa de Mantix**

Run: `npx jest`
Expected: ninguna prueba falla que no fallara ya en la línea base (ver "Antes de empezar").

- [ ] **Step 2: Integración**

Run: `npm run porteria:db:test && npm run test:porteria:int`
Expected: PASS.

- [ ] **Step 3: Ejemplo de variables**

Crear `src/porteria/porteria.env.example` (como `src/bigday/bigday.env.example`; el repo no tiene `.env.example` en la raíz):

```
# Módulo Portería (la conexión reutiliza DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME de Mantix)
# Opcional: LDAP_GROUP_ADMIN existente también entra como admin_porteria.
PORTERIA_JWT_SECRET=          # ≥ 32 caracteres, distinto de JWT_SECRET, IDENTIDAD_JWT_SECRET y TRK_JWT_SECRET
PORTERIA_JWT_EXPIRES=12h
LDAP_GROUP_PORTERIA_GUARDA=
LDAP_GROUP_PORTERIA_ADMIN=
```

```bash
git add src/porteria/porteria.env.example
git commit -m "docs(porteria): variables de entorno del módulo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Revisión**

Usar `superpowers:requesting-code-review` sobre el diff de la fase y `superpowers:verification-before-completion` antes de declararla terminada.
