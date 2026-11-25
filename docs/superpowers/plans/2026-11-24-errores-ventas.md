# Los errores de ventas no apagan el backend — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un error en cualquier handler de ventas (`/api/sv`) responda un mensaje en vez de terminar el proceso del backend.

**Architecture:** `capturarAsync` envuelve, en un solo lugar, los handlers del router de ventas ya montado para que sus promesas rechazadas lleguen a `next(err)`. `svErrorHandler`, al final de ese router, traduce los errores. Los catálogos responden 409 ante un código repetido, y los errores de archivo conservan su mensaje.

**Tech Stack:** Express 4.21.2, Sequelize 6.37.7, Jest 29.7.0, supertest 6.3.4, csv-parse 6.

**Spec:** `docs/superpowers/specs/2026-11-24-errores-ventas-design.md`

## Global Constraints

- Pruebas solo con `jest.mock` / `jest.doMock`: nunca `sequelize.sync` ni conexión a la base, porque la única es la de producción compartida.
- Los servidores de prueba escuchan en `127.0.0.1` con `tests/helpers/servidorLocal.js`.
- Solo el módulo `sv`. No se tocan otros módulos, `server.js`, `src/app.js` ni el manejador global.
- No cambian rutas, permisos ni validaciones.
- El 500 responde exactamente `INTERNAL_ERROR` y "Error interno. Intenta de nuevo en unos minutos."; el texto interno queda solo en el log, sin la query.
- `capturarAsync(router)` y `router.use(svErrorHandler)` van después de montar todas las rutas.
- Se trabaja en el worktree `.wt/mantix-backend-catalogos`, rama `fix/admin-catalogos-errores`. Sin push ni despliegue salvo pedido del usuario.
- Cinco suites fallan desde antes: `test/grupoIndivII`, `tests/invitacion.service`, `src/masajes/__tests__/adapters`, `src/masajes/__tests__/adapters.n8n` y `tests/afiliadoEmpresaAccess`.

---

### Task 1: `capturarAsync`

**Files:** Create `src/sv/utils/capturarAsync.js`, `tests/helpers/servidorLocal.js`, `tests/capturarAsync.test.js`

**Interfaces:** Produces `capturarAsync(router) → router`; `escuchar(app) → Promise<Server>` y `cerrarTodos()`.

- [ ] **Step 1: Prueba y helper**

`tests/helpers/servidorLocal.js`:

```js
// supertest 6 escucha en '::' y conecta a 127.0.0.1. En macOS ese puerto puede estar
// tomado por otro proceso y la petición le llega a él. Por eso las pruebas escuchan
// explícitamente en 127.0.0.1 y cierran el servidor al terminar.
const servidores = [];

async function escuchar(app) {
  const server = app.listen(0, '127.0.0.1');
  servidores.push(server);
  await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  return server;
}

async function cerrarTodos() {
  await Promise.all(servidores.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
}

module.exports = { escuchar, cerrarTodos };
```

`tests/capturarAsync.test.js`:

```js
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const express = require('express');
const request = require('supertest');
const logger = require('../src/utils/logger');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

let manejador;

function montar(router) {
  const a = express();
  a.use(router);
  // Manejador de cuatro argumentos; jest.fn no sirve directo porque su length es 0.
  // eslint-disable-next-line no-unused-vars
  a.use((err, req, res, next) => manejador(err, req, res, next));
  return escuchar(a);
}

beforeEach(() => {
  jest.clearAllMocks();
  manejador = jest.fn((err, req, res, next) => {
    if (res.headersSent) return next(err);
    return res.status(500).json({ atrapado: err.message });
  });
});
afterEach(cerrarTodos);

describe('capturarAsync', () => {
  test('un handler async que falla llega al manejador de errores', async () => {
    const r = express.Router();
    r.get('/x', async () => { throw new Error('bum'); });
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ atrapado: 'bum' });
  });

  test('alcanza subrouters anidados', async () => {
    const nieto = express.Router();
    nieto.post('/z', async () => { throw new Error('nieto'); });
    const hijo = express.Router();
    hijo.use('/y', nieto);
    const r = express.Router();
    r.use('/x', hijo);
    const res = await request(await montar(capturarAsync(r))).post('/x/y/z');
    expect(res.body).toEqual({ atrapado: 'nieto' });
  });

  test('alcanza middlewares async montados con use', async () => {
    const r = express.Router();
    r.use(async () => { throw new Error('middleware'); });
    r.get('/x', (req, res) => res.json({ ok: 1 }));
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.body).toEqual({ atrapado: 'middleware' });
  });

  test('alcanza cada handler de una misma ruta', async () => {
    const r = express.Router();
    r.get('/x', async (req, res, next) => next(), async () => { throw new Error('segundo'); });
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.body).toEqual({ atrapado: 'segundo' });
  });

  test('un rechazo sin motivo también es un error', async () => {
    const r = express.Router();
    // eslint-disable-next-line prefer-promise-reject-errors
    r.get('/x', async () => Promise.reject());
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ atrapado: 'Promesa rechazada sin motivo' });
  });

  test('un error síncrono sigue llegando al manejador', async () => {
    const r = express.Router();
    r.get('/x', () => { throw new Error('sincrono'); });
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.body).toEqual({ atrapado: 'sincrono' });
  });

  test('las respuestas correctas no cambian', async () => {
    const r = express.Router();
    r.get('/sync', (req, res) => res.json({ tipo: 'sync' }));
    r.get('/async/:id', async (req, res) => res.status(201).json({ id: req.params.id }));
    const server = await montar(capturarAsync(r));
    expect((await request(server).get('/sync')).body).toEqual({ tipo: 'sync' });
    const res = await request(server).get('/async/7');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: '7' });
    expect(manejador).not.toHaveBeenCalled();
  });

  test('no toca los manejadores de error del propio router', async () => {
    const r = express.Router();
    r.get('/x', async () => { throw new Error('bum'); });
    // eslint-disable-next-line no-unused-vars
    r.use((err, req, res, next) => res.status(418).json({ propio: err.message }));
    const res = await request(await montar(capturarAsync(r))).get('/x');
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ propio: 'bum' });
  });

  test('aplicarlo dos veces no repite el error', async () => {
    const r = express.Router();
    r.get('/x', async () => { throw new Error('una vez'); });
    capturarAsync(r);
    capturarAsync(r);
    await request(await montar(r)).get('/x');
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  test('si falla después de responder, la respuesta llega y solo se anota', async () => {
    const r = express.Router();
    r.get('/x', async (req, res) => { res.json({ ok: 1 }); throw new Error('tarde'); });
    const res = await request(await montar(capturarAsync(r))).get('/x?telefono=3001234567');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: 1 });
    expect(manejador).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][1]).toEqual(expect.objectContaining({ message: 'tarde', method: 'GET', path: '/x' }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('3001234567');
  });

  test('si falla con la respuesta a medias, se corta esa petición y el servidor sigue', async () => {
    const r = express.Router();
    r.get('/medias', async (req, res) => { res.write('a'); throw new Error('a medias'); });
    r.get('/ok', (req, res) => res.json({ ok: 1 }));
    const server = await montar(capturarAsync(r));
    await expect(request(server).get('/medias')).rejects.toThrow();
    expect((await request(server).get('/ok')).body).toEqual({ ok: 1 });
  });
});
```

- [ ] **Step 2:** `npx jest tests/capturarAsync.test.js` → FAIL, "Cannot find module '../src/sv/utils/capturarAsync'".
- [ ] **Step 3: Implementar** `src/sv/utils/capturarAsync.js`:

```js
/**
 * sv/utils/capturarAsync.js
 * Express 4 no recoge la promesa rechazada de un handler async, y server.js termina el
 * proceso ante cualquier unhandledRejection. capturarAsync recorre un router ya montado
 * (y sus subrouters) y hace que esos rechazos lleguen a next(err).
 *
 * Usa la estructura interna de Express 4 (router.stack / layer.handle). Express 5 reenvía
 * los rechazos por sí mismo: al migrar, este archivo se elimina.
 */
const logger = require('../../utils/logger');

const CAPTURADO = Symbol('sv.capturado');

function envolver(layer) {
  const original = layer.handle;
  // Cuatro argumentos = manejador de errores (err, req, res, next): no se toca.
  if (original.length > 3 || original[CAPTURADO]) return;

  const capturado = function (req, res, next) {
    const resultado = original.call(this, req, res, next);
    if (resultado && typeof resultado.catch === 'function') {
      resultado.catch((motivo) => {
        // next(undefined) seguiría como si no hubiera error.
        const err = motivo || new Error('Promesa rechazada sin motivo');
        // Con la respuesta ya terminada, next(err) cortaría la conexión: solo se anota.
        if (res.writableEnded) {
          logger.error('[SV] Error después de responder', {
            message: err.message, stack: err.stack, method: req.method, path: req.baseUrl + req.path
          });
          return;
        }
        next(err);
      });
    }
    return resultado;
  };
  capturado[CAPTURADO] = true;
  layer.handle = capturado;
}

function capturarAsync(router) {
  for (const layer of router.stack) {
    if (layer.route) layer.route.stack.forEach(envolver);
    else if (Array.isArray(layer.handle.stack)) capturarAsync(layer.handle);
    else envolver(layer);
  }
  return router;
}

module.exports = { capturarAsync };
```

- [ ] **Step 4:** el mismo comando → PASS (11).
- [ ] **Step 5: Commit** `feat(sv): capturar los rechazos de los handlers async de un router`

---

### Task 2: `svErrorHandler`

**Files:** Create `src/sv/middleware/svErrorHandler.js`, `tests/svErrorHandler.test.js`

**Interfaces:** Consumes `fail` (`sv/utils/response`), `ERROR_CODES`. Produces `svErrorHandler(err, req, res, next)`.

- [ ] **Step 1: Prueba** `tests/svErrorHandler.test.js`:

```js
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const logger = require('../src/utils/logger');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');

const REQ = { method: 'GET', baseUrl: '/api/sv/personas', path: '/buscar', originalUrl: '/api/sv/personas/buscar?telefono=3001234567' };

function ejecutar(err, { headersSent = false } = {}) {
  const res = { headersSent, status: jest.fn(() => res), json: jest.fn(() => res) };
  const next = jest.fn();
  svErrorHandler(err, REQ, res, next);
  return { res, next };
}

const error = (props, message = 'mensaje del error') => Object.assign(new Error(message), props);

beforeEach(() => jest.clearAllMocks());

describe('svErrorHandler', () => {
  test('tiene cuatro argumentos: Express lo reconoce como manejador de errores', () => {
    expect(svErrorHandler).toHaveLength(4);
  });

  test.each([
    ['VALIDATION_ERROR', 422], ['NOT_FOUND', 404], ['FORBIDDEN', 403], ['CONFLICT', 409],
    ['DUPLICATE', 409], ['DUPLICATE_PHONE', 409], ['DUPLICATE_NIT', 409], ['DUPLICATE_EMAIL', 409]
  ])('%s → %i con su código y su mensaje', (code, estado) => {
    const { res, next } = ejecutar(error({ code }));
    expect(res.status).toHaveBeenCalledWith(estado);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: code, message: 'mensaje del error' });
    expect(next).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test.each([
    ['SequelizeValidationError'], ['SequelizeUniqueConstraintError'], ['SequelizeDatabaseError'], ['MulterError']
  ])('%s lo responde el manejador global', (name) => {
    const err = error({ name, code: 'LIMIT_FILE_SIZE' });
    const { res, next } = ejecutar(err);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  test.each([
    ['un error común', error({})],
    ['un error del sistema', error({ code: 'ECONNREFUSED' }, 'connect ECONNREFUSED 10.0.0.5:3306')],
    ['una caída de la base', error({ name: 'SequelizeConnectionError' }, 'connect ETIMEDOUT 10.0.0.5:3306')],
    ['un code que coincide con una propiedad heredada', error({ code: 'constructor' })]
  ])('%s → 500 genérico, sin el texto interno', (_nombre, err) => {
    const { res, next } = ejecutar(err);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false, error: 'INTERNAL_ERROR', message: 'Error interno. Intenta de nuevo en unos minutos.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('el 500 anota el detalle en el log, sin la query', () => {
    ejecutar(error({}, 'detalle interno'));
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][1]).toEqual(expect.objectContaining({
      message: 'detalle interno', method: 'GET', path: '/api/sv/personas/buscar'
    }));
    expect(logger.error.mock.calls[0][1].stack).toContain('detalle interno');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('3001234567');
  });

  test('con la respuesta ya empezada lo pasa a next', () => {
    const err = error({ code: 'NOT_FOUND' });
    const { res, next } = ejecutar(err, { headersSent: true });
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** `npx jest tests/svErrorHandler.test.js` → FAIL, módulo inexistente.
- [ ] **Step 3: Implementar** `src/sv/middleware/svErrorHandler.js`:

```js
/**
 * sv/middleware/svErrorHandler.js
 * Último middleware del router de ventas. Responde los errores que los controladores no
 * resolvieron, con el formato de sv/utils/response. El texto interno de un error
 * inesperado queda en el log y no llega al cliente.
 */
const logger = require('../../utils/logger');
const { fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');

const ESTADO_POR_CODIGO = new Map([
  ['VALIDATION_ERROR', 422],
  ['NOT_FOUND',        404],
  ['FORBIDDEN',        403],
  ['CONFLICT',         409],
  ['DUPLICATE',        409],
  ['DUPLICATE_PHONE',  409],
  ['DUPLICATE_NIT',    409],
  ['DUPLICATE_EMAIL',  409]
]);

// El manejador global (src/middleware/errorHandler.js) ya traduce estos a mensajes claros.
const DEL_MANEJADOR_GLOBAL = new Set([
  'SequelizeValidationError', 'SequelizeUniqueConstraintError', 'SequelizeDatabaseError', 'MulterError'
]);

function svErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const estado = ESTADO_POR_CODIGO.get(err.code);
  if (estado) return fail(res, estado, err.code, err.message);

  if (DEL_MANEJADOR_GLOBAL.has(err.name)) return next(err);

  logger.error('[SV] Error no controlado', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.baseUrl + req.path // sin la query: puede traer nombres o teléfonos
  });
  return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Error interno. Intenta de nuevo en unos minutos.');
}

module.exports = { svErrorHandler };
```

- [ ] **Step 4:** el mismo comando → PASS (19).
- [ ] **Step 5: Commit** `feat(sv): manejador de errores del módulo de ventas`

---

### Task 3: Conectar en las rutas de ventas y 409 en catálogos

**Files:** Modify `src/sv/routes/index.js`, `src/sv/controllers/config.controller.js`. Create `tests/svRoutesCaptura.test.js`, `tests/configCatalogos.routes.test.js`

**Interfaces:** Consumes `capturarAsync` (Task 1), `svErrorHandler` (Task 2).

- [ ] **Step 1: Pruebas**

`tests/svRoutesCaptura.test.js`:

```js
// Vigila que TODAS las rutas de ventas queden cubiertas por capturarAsync + svErrorHandler.
// Cada *.routes.js se reemplaza por un router con un handler async que falla; svAuth y
// svAreaGuard se dejan pasar. No se cargan modelos ni servicios.
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

const DIR = path.join(__dirname, '../src/sv/routes');
const ARCHIVOS = fs.readdirSync(DIR).filter((f) => f.endsWith('.routes.js')).map((f) => f.replace(/\.js$/, ''));
const FUENTE = fs.readFileSync(path.join(DIR, 'index.js'), 'utf8');

// prefijo de montaje de cada archivo, leído de index.js
const PREFIJOS = new Map(
  [...FUENTE.matchAll(/router\.use\('([^']+)',[^\n]*require\('\.\/([\w-]+\.routes)'\)\)/g)].map((m) => [m[2], m[1]])
);

let server;

beforeAll(async () => {
  jest.resetModules();
  jest.doMock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
  jest.doMock('../src/sv/middleware/svAuth', () => ({ svAuth: (req, res, next) => next() }));
  jest.doMock('../src/sv/middleware/svAreaGuard', () => ({ svAreaGuard: (req, res, next) => next() }));
  for (const archivo of ARCHIVOS) {
    jest.doMock(`../src/sv/routes/${archivo}`, () => {
      const r = require('express').Router();
      r.get(`/__falla-${archivo}`, async () => { throw new Error('bum'); });
      return r;
    });
  }
  const a = express();
  a.use('/api/sv', require('../src/sv/routes/index'));
  server = await escuchar(a);
});
afterAll(cerrarTodos);

test('todos los archivos de rutas están montados en index.js', () => {
  expect(ARCHIVOS.length).toBeGreaterThan(0);
  expect([...PREFIJOS.keys()].sort()).toEqual([...ARCHIVOS].sort());
});

test.each(ARCHIVOS)('%s: un handler async que falla responde 500 en vez de tumbar el proceso', async (archivo) => {
  const prefijo = PREFIJOS.get(archivo) === '/' ? '' : PREFIJOS.get(archivo);
  const r = await request(server).get(`/api/sv${prefijo}/__falla-${archivo}`);
  expect(r.status).toBe(500);
  expect(r.body.error).toBe('INTERNAL_ERROR');
});

test('/health sigue respondiendo', async () => {
  const r = await request(server).get('/api/sv/health');
  expect(r.status).toBe(200);
  expect(r.body.ok).toBe(true);
});
```

`tests/configCatalogos.routes.test.js`:

```js
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/models', () => {
  const modelo = () => ({ findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() });
  return {
    SvArea: modelo(), SvGrupo: modelo(), SvProducto: modelo(), SvEstado: modelo(),
    SvResultado: modelo(), SvFuente: modelo(), SvPunto: modelo(), SvTipoEmpresa: modelo()
  };
});

const express = require('express');
const request = require('supertest');
const M = require('../src/sv/models');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

const INTERNO = { success: false, error: 'INTERNAL_ERROR', message: 'Error interno. Intenta de nuevo en unos minutos.' };

// Arma el router igual que sv/routes/index.js: montar, capturar y al final el manejador.
function app() {
  const router = express.Router();
  router.use('/config', require('../src/sv/routes/config.routes'));
  capturarAsync(router);
  router.use(svErrorHandler);
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { usr_id: 1, usr_area_id: 1, rol: { rol_codigo: 'SUPER_ADMIN' } }; next(); });
  a.use('/api/sv', router);
  return escuchar(a);
}

const duplicado = () => Object.assign(new Error('Validation error'), { name: 'SequelizeUniqueConstraintError', errors: [] });
const caida = () => Object.assign(new Error('connect ETIMEDOUT 10.0.0.5:3306'), { name: 'SequelizeConnectionError' });
const fila = (datos) => ({ ...datos, update: jest.fn(async () => {}) });

beforeEach(() => jest.resetAllMocks());
afterEach(cerrarTodos);

describe('editar un catálogo', () => {
  test.each([
    ['fuente', 'SvFuente', '/fuentes/5', { fuente_codigo: 'REFERIDO' }],
    ['punto',  'SvPunto',  '/puntos/5',  { punto_codigo: 'SJ' }]
  ])('%s con un código que ya existe responde 409', async (_n, modelo, ruta, body) => {
    const item = fila({});
    item.update.mockRejectedValue(duplicado());
    M[modelo].findByPk.mockResolvedValue(item);
    const r = await request(await app()).put(`/api/sv/config${ruta}`).send(body);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ success: false, error: 'VALIDATION_ERROR', message: 'Código duplicado' });
  });

  test('con la base caída responde 500 genérico', async () => {
    const item = fila({});
    item.update.mockRejectedValue(caida());
    M.SvFuente.findByPk.mockResolvedValue(item);
    const r = await request(await app()).put('/api/sv/config/fuentes/5').send({ fuente_nombre: 'X' });
    expect(r.status).toBe(500);
    expect(r.body).toEqual(INTERNO);
  });

  test('que no existe responde 404', async () => {
    M.SvFuente.findByPk.mockResolvedValue(null);
    const r = await request(await app()).put('/api/sv/config/fuentes/99').send({ fuente_nombre: 'X' });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('NOT_FOUND');
  });

  test('con datos válidos lo actualiza', async () => {
    const item = fila({ fuente_id: 5 });
    M.SvFuente.findByPk.mockResolvedValue(item);
    const r = await request(await app()).put('/api/sv/config/fuentes/5').send({ fuente_nombre: 'Encuestas' });
    expect(r.status).toBe(200);
    expect(item.update).toHaveBeenCalledWith({ fuente_nombre: 'Encuestas' });
    expect(r.body.data.fuente_id).toBe(5);
  });
});

describe('crear un catálogo', () => {
  const NUEVA = { fuente_area_id: 1, fuente_codigo: 'OTROS', fuente_nombre: 'Otros' };

  test('con un código que ya existe responde 409', async () => {
    M.SvFuente.create.mockRejectedValue(duplicado());
    const r = await request(await app()).post('/api/sv/config/fuentes').send(NUEVA);
    expect(r.status).toBe(409);
    expect(r.body.message).toBe('Código duplicado');
  });

  test('con la base caída responde 500 genérico', async () => {
    M.SvFuente.create.mockRejectedValue(caida());
    const r = await request(await app()).post('/api/sv/config/fuentes').send(NUEVA);
    expect(r.status).toBe(500);
    expect(r.body).toEqual(INTERNO);
  });

  test('con datos válidos responde 201', async () => {
    M.SvFuente.create.mockResolvedValue({ fuente_id: 9 });
    const r = await request(await app()).post('/api/sv/config/fuentes').send(NUEVA);
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ fuente_id: 9 });
  });
});

describe('listar, activar y bootstrap', () => {
  test('listar con la base caída responde 500 genérico', async () => {
    M.SvFuente.findAll.mockRejectedValue(caida());
    const r = await request(await app()).get('/api/sv/config/fuentes');
    expect(r.status).toBe(500);
    expect(r.body).toEqual(INTERNO);
  });

  test('listar devuelve los datos', async () => {
    M.SvFuente.findAll.mockResolvedValue([{ fuente_id: 1 }]);
    const r = await request(await app()).get('/api/sv/config/fuentes');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([{ fuente_id: 1 }]);
  });

  test('activar con la base caída responde 500 genérico', async () => {
    const item = fila({ fuente_activa: 1 });
    item.update.mockRejectedValue(caida());
    M.SvFuente.findByPk.mockResolvedValue(item);
    const r = await request(await app()).patch('/api/sv/config/fuentes/5/toggle');
    expect(r.status).toBe(500);
    expect(r.body).toEqual(INTERNO);
  });

  test('activar alterna el estado', async () => {
    const item = fila({ fuente_activa: 1 });
    M.SvFuente.findByPk.mockResolvedValue(item);
    const r = await request(await app()).patch('/api/sv/config/fuentes/5/toggle');
    expect(r.status).toBe(200);
    expect(item.update).toHaveBeenCalledWith({ fuente_activa: 0 });
  });

  test('bootstrap con la base caída responde 500 genérico', async () => {
    M.SvArea.findByPk.mockRejectedValue(caida());
    const r = await request(await app()).get('/api/sv/config/bootstrap?area_id=1');
    expect(r.status).toBe(500);
    expect(r.body).toEqual(INTERNO);
  });

  test('bootstrap de un área que no existe responde 404', async () => {
    M.SvArea.findByPk.mockResolvedValue(null);
    const r = await request(await app()).get('/api/sv/config/bootstrap?area_id=99');
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 2:** `npx jest tests/svRoutesCaptura.test.js tests/configCatalogos.routes.test.js --testTimeout=3000` → FAIL: las rutas no responden (tiempo agotado) y la edición con código repetido no da 409.
- [ ] **Step 3: Conectar** en `src/sv/routes/index.js`:

```diff
diff --git a/src/sv/routes/index.js b/src/sv/routes/index.js
index 07a9acb..79c1832 100644
--- a/src/sv/routes/index.js
+++ b/src/sv/routes/index.js
@@ -6,4 +6,6 @@ const router = require('express').Router();
 const { svAuth }      = require('../middleware/svAuth');
 const { svAreaGuard } = require('../middleware/svAreaGuard');
+const { svErrorHandler } = require('../middleware/svErrorHandler');
+const { capturarAsync }  = require('../utils/capturarAsync');
 
 router.get('/health', (_req, res) => res.json({
@@ -54,3 +56,8 @@ router.use('/renovaciones', svAuth, svAreaGuard, require('./renovaciones.routes'
 router.use('/salas',        svAuth, svAreaGuard, require('./salas.routes'));
 
+// ─── Errores: siempre al final, después de montar TODAS las rutas ───
+// Un handler async que falla llega a svErrorHandler en vez de terminar el proceso.
+capturarAsync(router);
+router.use(svErrorHandler);
+
 module.exports = router;
```

- [ ] **Step 4: 409** en `src/sv/controllers/config.controller.js`:

```diff
diff --git a/src/sv/controllers/config.controller.js b/src/sv/controllers/config.controller.js
index 7c6d909..98a375a 100644
--- a/src/sv/controllers/config.controller.js
+++ b/src/sv/controllers/config.controller.js
@@ -54,5 +54,12 @@ function updateFactory(Model, pkName) {
     const item = await Model.findByPk(id);
     if (!item) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Recurso no encontrado');
-    await item.update(req.body);
+    try {
+      await item.update(req.body);
+    } catch (e) {
+      if (e.name === 'SequelizeUniqueConstraintError') {
+        return fail(res, 409, ERROR_CODES.VALIDATION_ERROR, 'Código duplicado');
+      }
+      throw e;
+    }
     return ok(res, item);
   };
```

- [ ] **Step 5:** el mismo comando → PASS (21 y 14).
- [ ] **Step 6: Commit** `fix(sv): un error en las rutas de ventas ya no termina el proceso`

---

### Task 4: Errores de archivo con su mensaje

**Files:** Modify `src/sv/services/listas.service.js`, `src/sv/controllers/listas.controller.js`, `src/sv/controllers/fidelizacion.controller.js`. Create `tests/svArchivos.errores.test.js`

- [ ] **Step 1: Prueba** `tests/svArchivos.errores.test.js`:

```js
// Errores de carga masiva (CSV real con csv-parse) y de los filtros de archivo: deben
// llegar como 422 con su mensaje, no como "Error interno".
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/models', () => ({
  SvLista: { create: jest.fn() }, SvPersona: {}, SvUsuario: {},
  SvProspecto: { findOne: jest.fn(), create: jest.fn() }, SvEstado: { findOne: jest.fn() }
}));
jest.mock('../src/sv/services/personas.service', () => ({ crear: jest.fn() }));
jest.mock('../src/sv/services/fidelizacion.service', () => ({}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const M = require('../src/sv/models');
const personas = require('../src/sv/services/personas.service');
const listas = require('../src/sv/services/listas.service');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

let dir;
let lista;

beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-listas-')); });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  jest.resetAllMocks();
  lista = { lista_id: 1, update: jest.fn(async () => {}) };
  M.SvLista.create.mockResolvedValue(lista);
  M.SvEstado.findOne.mockResolvedValue({ estado_id: 11 });
  M.SvProspecto.findOne.mockResolvedValue(null);
  personas.crear.mockResolvedValue({ persona_id: 500 });
});
afterEach(cerrarTodos);

function cargar(csv) {
  const filePath = path.join(dir, `lista-${Date.now()}-${Math.random()}.csv`);
  fs.writeFileSync(filePath, csv);
  return listas.cargarDesdeArchivo({
    filePath, originalName: 'lista.csv', areaId: 1, grupoId: 1, fuenteId: 1, asesorId: 7, nombreLista: 'L', usuarioId: 7
  });
}

describe('carga masiva', () => {
  test.each([
    ['una fila con más columnas', 'nombre,telefono\nAna,3001234567\nLuis,3007654321,Cúcuta', 3],
    ['una comilla sin cerrar', 'nombre,telefono\n"Ana,3001234567', 2]
  ])('%s: VALIDATION_ERROR con la línea y la lista fallida', async (_caso, csv, linea) => {
    const e = await cargar(csv).then(() => null, (err) => err);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.message).toBe(`El archivo CSV no es válido (línea ${linea}). Revisa que todas las filas tengan las mismas columnas y que no falten comillas.`);
    expect(lista.update).toHaveBeenCalledWith(expect.objectContaining({
      lista_estado: 'fallida', lista_log: { error: expect.stringContaining('CSV inválido: ') }
    }));
    expect(M.SvProspecto.create).not.toHaveBeenCalled();
  });

  test('un grupo sin estados: VALIDATION_ERROR con su mensaje', async () => {
    M.SvEstado.findOne.mockResolvedValue(null);
    const e = await cargar('nombre,telefono\nAna,3001234567').then(() => null, (err) => err);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.message).toBe('No hay estados activos configurados para el grupo');
  });

  test('un CSV correcto se sigue cargando', async () => {
    await cargar('nombre,telefono\nAna,3001234567');
    expect(M.SvProspecto.create).toHaveBeenCalledTimes(1);
    expect(lista.update).toHaveBeenLastCalledWith(expect.objectContaining({ lista_importadas: 1, lista_estado: 'completada' }));
  });
});

describe('filtros de archivo', () => {
  function app(subir) {
    const router = express.Router();
    router.post('/subir', subir, (req, res) => res.json({ ok: 1 }));
    capturarAsync(router);
    router.use(svErrorHandler);
    const a = express();
    a.use('/api/sv', router);
    return escuchar(a);
  }

  test('la lista masiva rechaza lo que no es CSV', async () => {
    const { uploadMiddleware } = require('../src/sv/controllers/listas.controller');
    const r = await request(await app(uploadMiddleware)).post('/api/sv/subir')
      .attach('archivo', Buffer.from('x'), { filename: 'lista.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ success: false, error: 'VALIDATION_ERROR', message: 'Solo se aceptan archivos CSV' });
  });

  test('la evidencia de fidelización rechaza lo que no es imagen', async () => {
    const { uploadFotoMiddleware } = require('../src/sv/controllers/fidelizacion.controller');
    const r = await request(await app(uploadFotoMiddleware)).post('/api/sv/subir')
      .attach('foto', Buffer.from('x'), { filename: 'foto.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ success: false, error: 'VALIDATION_ERROR', message: 'Solo se aceptan imágenes (jpg/png/webp)' });
  });
});
```

- [ ] **Step 2:** `npx jest tests/svArchivos.errores.test.js` → FAIL (5 de 6).
- [ ] **Step 3: Implementar**

```diff
diff --git a/src/sv/services/listas.service.js b/src/sv/services/listas.service.js
index 80e626b..8890b4f 100644
--- a/src/sv/services/listas.service.js
+++ b/src/sv/services/listas.service.js
@@ -48,5 +48,7 @@ async function cargarDesdeArchivo({ filePath, originalName, areaId, grupoId, fue
   if (!estadoInicial) {
     await lista.update({ lista_estado: 'fallida', lista_log: { error: 'No hay estados para el grupo' } });
-    throw new Error('No hay estados activos configurados para el grupo');
+    const sinEstados = new Error('No hay estados activos configurados para el grupo');
+    sinEstados.code = 'VALIDATION_ERROR';
+    throw sinEstados;
   }
 
@@ -61,5 +63,8 @@ async function cargarDesdeArchivo({ filePath, originalName, areaId, grupoId, fue
   } catch (e) {
     await lista.update({ lista_estado: 'fallida', lista_log: { error: 'CSV inválido: ' + e.message } });
-    throw e;
+    const linea = e.lines ? ` (línea ${e.lines})` : '';
+    const invalido = new Error(`El archivo CSV no es válido${linea}. Revisa que todas las filas tengan las mismas columnas y que no falten comillas.`);
+    invalido.code = 'VALIDATION_ERROR';
+    throw invalido;
   }
 
```

```diff
diff --git a/src/sv/controllers/listas.controller.js b/src/sv/controllers/listas.controller.js
index e6662a7..be90071 100644
--- a/src/sv/controllers/listas.controller.js
+++ b/src/sv/controllers/listas.controller.js
@@ -24,5 +24,5 @@ const upload = multer({
   fileFilter: (_req, file, cb) => {
     if (/csv|text\/plain/.test(file.mimetype) || /\.csv$/i.test(file.originalname)) cb(null, true);
-    else cb(new Error('Solo se aceptan archivos CSV'));
+    else cb(Object.assign(new Error('Solo se aceptan archivos CSV'), { code: ERROR_CODES.VALIDATION_ERROR }));
   }
 });
```

```diff
diff --git a/src/sv/controllers/fidelizacion.controller.js b/src/sv/controllers/fidelizacion.controller.js
index 66f7cd1..ecf0256 100644
--- a/src/sv/controllers/fidelizacion.controller.js
+++ b/src/sv/controllers/fidelizacion.controller.js
@@ -29,5 +29,5 @@ const upload = multer({
   fileFilter: (_req, file, cb) => {
     if (/^image\//.test(file.mimetype)) cb(null, true);
-    else cb(new Error('Solo se aceptan imágenes (jpg/png/webp)'));
+    else cb(Object.assign(new Error('Solo se aceptan imágenes (jpg/png/webp)'), { code: ERROR_CODES.VALIDATION_ERROR }));
   }
 });
```

- [ ] **Step 4:** el mismo comando → PASS (6).
- [ ] **Step 5: Commit** `fix(sv): los errores de carga de archivos llegan con su mensaje`

---

### Task 5: Integración y despliegue (con el usuario)

- [ ] **Step 1:** suite completa, `npx jest`: solo fallan las cinco conocidas.
- [ ] **Step 2:** `git fetch origin && git merge origin/main`, y repetir las pruebas de las Tasks 1 a 4.
- [ ] **Step 3:** con confirmación del usuario, `git push origin HEAD:main`.
- [ ] **Step 4 (usuario):** `deploy-mantix`. En los logs de pm2 no debe aparecer `Cannot find module`.
- [ ] **Step 5 (usuario), smoke:** en Administración → Fuentes, crear una fuente de prueba, editarla con el código de otra y ver "Código duplicado"; después desactivarla. GenFlow sigue respondiendo y `pm2 describe` no muestra un reinicio.
- [ ] **Reversión:** `git revert` del merge, push y `deploy-mantix`.
