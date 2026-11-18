# Permisos de `/api/sv/gestiones` — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que registrar gestiones, ver su historial y ver el resumen del día en `/api/sv/gestiones` respete el alcance del usuario, que la gestión quede siempre a nombre de quien la registra y que un error de base no tumbe el proceso.

**Architecture:** Una función pura `fueraDeAlcance(user, scope, prospecto)` en `src/sv/utils/alcanceProspecto.js` concentra la regla que hoy vive dentro de `prospectos.controller.getOne`. `getOne` y el controlador de gestiones la usan; el de gestiones carga el prospecto con una consulta liviana nueva (`prospectos.service.obtenerAlcance`). `gest_asesor_id` sale del esquema y del servicio. `resumen-dia` valida `asesor_id` con `usuariosAccesibles`. Todos los handlers tocados reenvían errores con `next(e)`.

**Tech Stack:** Node.js, Express 4, Sequelize (MySQL), Joi, Jest 29, supertest.

**Spec:** `docs/superpowers/specs/2026-11-18-permisos-gestiones-design.md`

## Global Constraints

- Trabajar solo en el worktree `mantix-backend/.worktrees/fix-permisos-gestiones`, rama `fix/permisos-gestiones`. No tocar `main`, no hacer push ni desplegar.
- Pruebas solo con `jest.mock`. Nunca `sequelize.sync` ni conexión a base: la única base es la de producción compartida.
- Correr pruebas con `npx jest <ruta>` desde la raíz del worktree (no `npm test`, que agrega `--coverage`).
- Mensajes de 403 exactos: `Fuera de tu alcance`, `Fuera de tu grupo`, `Fuera de tu área`, `Sin alcance definido`. 404: `Prospecto no encontrado`. Códigos: `ERROR_CODES.FORBIDDEN`, `ERROR_CODES.NOT_FOUND` de `src/sv/config/constants.js`.
- Respuestas con los helpers de `src/sv/utils/response.js` (`ok`, `created`, `fail`).
- Cada commit lleva el mensaje en español con prefijo convencional (`feat(sv):`, `fix(sv):`, `test(sv):`) y termina con la línea `Co-Authored-By: <nombre del modelo que hace el commit> <noreply@anthropic.com>`, con el nombre del modelo que realmente hace el commit.
- Hacer `git add` solo de los archivos de la tarea. No usar `git stash`.
- Suites que ya fallaban antes y no son parte de esta tarea: `test/grupoIndivII.test.js`, `tests/invitacion.service.test.js`, `src/masajes/__tests__/adapters.test.js`, `src/masajes/__tests__/adapters.n8n.test.js`, `tests/afiliadoEmpresaAccess.test.js`. Línea base: 5 suites fallidas, 165 pasan, 170 en total.

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/sv/utils/alcanceProspecto.js` | Crear | Regla única de alcance sobre un prospecto (pura) |
| `src/sv/controllers/prospectos.controller.js` | Modificar | `getOne` usa el helper y reenvía errores |
| `src/sv/services/prospectos.service.js` | Modificar | `obtenerAlcance(id)`: carga liviana para el alcance |
| `src/sv/controllers/gestiones.controller.js` | Reescribir | Alcance en `create`/`list`, `asesor_id` en `resumenDia`, `next(e)` |
| `src/sv/validations/crm.validation.js` | Modificar | `gest_asesor_id` sale de `gestiones.create` |
| `src/sv/services/gestiones.service.js` | Modificar | `crear` ignora `payload.gest_asesor_id` |
| `tests/alcanceProspecto.test.js` | Crear | Tabla de casos del helper |
| `tests/prospectosGetOne.test.js` | Crear | Regresión de `getOne` |
| `tests/prospectosObtenerAlcance.test.js` | Crear | Consulta liviana |
| `tests/gestiones.routes.test.js` | Crear (Tarea 3), ampliar (Tareas 4 y 5) | Endpoints de gestiones detrás del `svAreaGuard` real |
| `tests/gestiones.service.test.js` | Crear | `crear` y `gest_asesor_id` |

---

### Task 1: Helper `fueraDeAlcance`

**Files:**
- Create: `src/sv/utils/alcanceProspecto.js`
- Test: `tests/alcanceProspecto.test.js`

**Interfaces:**
- Consumes: `grupoIdsAccesibles(user)` y `areaIdsAccesibles(user)` de `src/sv/utils/acceso.js` (devuelven `number[]`, o `null` para SUPER_ADMIN); `svAreaGuard(req, res, next)` de `src/sv/middleware/svAreaGuard.js` (solo en la prueba, para armar `req.scope` como en producción).
- Produces: `fueraDeAlcance(user, scope, prospecto) → null | string`, exportado como `module.exports = { fueraDeAlcance }`. `prospecto` necesita `prosp_asesor_id`, `prosp_grupo_id`, `prosp_area_id`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `tests/alcanceProspecto.test.js`:

```js
/**
 * Regla única de alcance sobre un prospecto (src/sv/utils/alcanceProspecto.js).
 * El scope se arma con el svAreaGuard real para que la prueba refleje producción.
 */
const { fueraDeAlcance } = require('../src/sv/utils/alcanceProspecto');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

function scopeDe(user) {
  const req = { user };
  svAreaGuard(req, {}, () => {});
  return req.scope;
}

const P = (asesor, grupo, area) => ({
  prosp_id: 1, prosp_asesor_id: asesor, prosp_grupo_id: grupo, prosp_area_id: area
});

const asesor       = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [{ grupo_id: 2 }], rol: { rol_codigo: 'ASESOR' } };
const agente       = { usr_id: 12, usr_area_id: 4, usr_grupo_id: 6, rol: { rol_codigo: 'AGENTE_SVC' } };
const supervisor   = { usr_id: 20, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [{ grupo_id: 2 }], rol: { rol_codigo: 'SUPERVISOR' } };
const coordinador  = { usr_id: 21, usr_area_id: 2, usr_grupo_id: 5, rol: { rol_codigo: 'COORDINADOR_PREVISION' } };
// JEFE_PAP con usr_grupo_id distinto del grupo PAP (3): svAreaGuard le fija grupoId = 3.
const jefePap      = { usr_id: 22, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'JEFE_PAP' } };
const adminArea    = { usr_id: 30, usr_area_id: 1, areasExtra: [{ area_id: 2 }], rol: { rol_codigo: 'ADMIN_AREA' } };
const adminSinArea = { usr_id: 31, usr_area_id: null, rol: { rol_codigo: 'ADMIN_AREA' } };
const superAdmin   = { usr_id: 1,  usr_area_id: 1, rol: { rol_codigo: 'SUPER_ADMIN' } };
const gerente      = { usr_id: 2,  usr_area_id: 1, rol: { rol_codigo: 'GERENTE_GENERAL' } };
const director     = { usr_id: 3,  usr_area_id: 1, rol: { rol_codigo: 'DIRECTOR_COMERCIAL' } };
const desconocido  = { usr_id: 50, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'OTRO' } };

describe('fueraDeAlcance', () => {
  test.each([
    ['ASESOR, prospecto propio',                         asesor,       P(10, 1, 1),   null],
    ['ASESOR, prospecto de otro asesor de su grupo',     asesor,       P(11, 1, 1),   'Fuera de tu alcance'],
    ['ASESOR, prospecto ajeno en un grupo extra',        asesor,       P(11, 2, 1),   'Fuera de tu alcance'],
    ['ASESOR, prospecto sin asignar',                    asesor,       P(null, 1, 1), 'Fuera de tu alcance'],
    ['AGENTE_SVC, prospecto propio',                     agente,       P(12, 6, 4),   null],
    ['AGENTE_SVC, prospecto ajeno',                      agente,       P(13, 6, 4),   'Fuera de tu alcance'],
    ['SUPERVISOR, prospecto de su grupo',                supervisor,   P(11, 1, 1),   null],
    ['SUPERVISOR, prospecto sin asignar de su grupo',    supervisor,   P(null, 1, 1), null],
    ['SUPERVISOR, prospecto de un grupo extra',          supervisor,   P(11, 2, 1),   null],
    ['SUPERVISOR, prospecto de otro grupo',              supervisor,   P(11, 9, 1),   'Fuera de tu grupo'],
    ['COORDINADOR_PREVISION, prospecto de su grupo',     coordinador,  P(11, 5, 2),   null],
    ['COORDINADOR_PREVISION, prospecto de otro grupo',   coordinador,  P(11, 1, 1),   'Fuera de tu grupo'],
    ['JEFE_PAP con usr_grupo_id ≠ PAP, prospecto PAP',   jefePap,      P(11, 3, 3),   null],
    ['JEFE_PAP, prospecto de otro grupo',                jefePap,      P(11, 9, 2),   'Fuera de tu grupo'],
    ['ADMIN_AREA, prospecto de su área',                 adminArea,    P(11, 9, 1),   null],
    ['ADMIN_AREA, prospecto de un área extra',           adminArea,    P(11, 9, 2),   null],
    ['ADMIN_AREA, prospecto de otra área',               adminArea,    P(11, 9, 4),   'Fuera de tu área'],
    ['ADMIN_AREA sin área asignada',                     adminSinArea, P(11, 9, 1),   'Sin alcance definido'],
    ['SUPER_ADMIN',                                      superAdmin,   P(11, 9, 4),   null],
    ['GERENTE_GENERAL (cross-área)',                     gerente,      P(11, 9, 4),   null],
    ['DIRECTOR_COMERCIAL (cross-área)',                  director,     P(11, 9, 4),   null],
    ['rol desconocido',                                  desconocido,  P(10, 1, 1),   'Sin alcance definido']
  ])('%s', (_, user, prospecto, esperado) => {
    expect(fueraDeAlcance(user, scopeDe(user), prospecto)).toBe(esperado);
  });

  test('compara ids aunque lleguen como texto', () => {
    expect(fueraDeAlcance(supervisor, scopeDe(supervisor), P('11', '1', '1'))).toBeNull();
    expect(fueraDeAlcance(asesor, scopeDe(asesor), P('10', '1', '1'))).toBeNull();
  });

  test('sin scope → Sin alcance definido', () => {
    expect(fueraDeAlcance(asesor, undefined, P(10, 1, 1))).toBe('Sin alcance definido');
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx jest tests/alcanceProspecto.test.js`
Expected: FAIL con `Cannot find module '../src/sv/utils/alcanceProspecto'`.

- [ ] **Step 3: Implementar el helper**

Crear `src/sv/utils/alcanceProspecto.js`:

```js
/**
 * sv/utils/alcanceProspecto.js
 * Regla única de alcance sobre un prospecto, a partir de req.user y del
 * req.scope que arma middleware/svAreaGuard. Función pura: no consulta la base.
 *
 * fueraDeAlcance(user, scope, prospecto) → null si hay acceso, o el mensaje
 * para responder 403. Orden:
 *   1. crossArea (SUPER_ADMIN, GERENTE_GENERAL, DIRECTOR_COMERCIAL) → acceso
 *   2. asesorId  (ASESOR, AGENTE_SVC) → solo sus prospectos
 *   3. grupoId   (SUPERVISOR, COORDINADOR_PREVISION, JEFE_PAP) → sus grupos
 *   4. areaId    (ADMIN_AREA) → sus áreas
 *   5. sin alcance definido → se niega (falla cerrado)
 */
const { grupoIdsAccesibles, areaIdsAccesibles } = require('./acceso');

// ¿valor está en lista ∪ {extra}? Compara como número (Sequelize o el token
// pueden entregar texto).
function contiene(lista, extra, valor) {
  if (valor == null) return false;
  const ids = new Set([...(lista || []), extra].filter(v => v != null).map(Number));
  return ids.has(Number(valor));
}

function fueraDeAlcance(user, scope, prospecto) {
  const s = scope || {};
  if (s.crossArea) return null;

  if (s.asesorId) {
    return prospecto.prosp_asesor_id != null && Number(prospecto.prosp_asesor_id) === Number(s.asesorId)
      ? null
      : 'Fuera de tu alcance';
  }

  if (s.grupoId) {
    // La unión con scope.grupoId cubre al JEFE_PAP, que svAreaGuard fija al
    // grupo PAP sin importar su usr_grupo_id.
    return contiene(grupoIdsAccesibles(user), s.grupoId, prospecto.prosp_grupo_id)
      ? null
      : 'Fuera de tu grupo';
  }

  if (s.areaId) {
    return contiene(areaIdsAccesibles(user), s.areaId, prospecto.prosp_area_id)
      ? null
      : 'Fuera de tu área';
  }

  return 'Sin alcance definido';
}

module.exports = { fueraDeAlcance };
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `npx jest tests/alcanceProspecto.test.js`
Expected: PASS, 24 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/sv/utils/alcanceProspecto.js tests/alcanceProspecto.test.js
git commit -m "feat(sv): regla única de alcance sobre un prospecto

Co-Authored-By: <nombre del modelo que hace el commit> <noreply@anthropic.com>"
```

---

### Task 2: `getOne` usa el helper

**Files:**
- Modify: `src/sv/controllers/prospectos.controller.js:7` (import) y `:52-65` (`getOne`)
- Test: `tests/prospectosGetOne.test.js`

**Interfaces:**
- Consumes: `fueraDeAlcance(user, scope, prospecto)` de la Tarea 1; `prospectos.obtenerCompleto(id)` (ya existe).
- Produces: `getOne(req, res, next)` con la misma respuesta de antes en los casos normales, 200 para JEFE_PAP sobre PAP, 403 `Sin alcance definido` para usuarios sin alcance y `next(e)` ante errores.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `tests/prospectosGetOne.test.js`:

```js
/**
 * Regresión de prospectos.controller.getOne sobre utils/alcanceProspecto.
 */
jest.mock('../src/sv/services/prospectos.service', () => ({ obtenerCompleto: jest.fn() }));

const prospectos = require('../src/sv/services/prospectos.service');
const ctrl = require('../src/sv/controllers/prospectos.controller');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

function reqDe(user, id) {
  const req = { user, params: { id: String(id) }, query: {}, body: {} };
  svAreaGuard(req, {}, () => {});
  return req;
}
function resFalso() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const ASESOR     = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR' } };
const SUPERVISOR = { usr_id: 20, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'SUPERVISOR' } };
const JEFE_PAP   = { usr_id: 22, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'JEFE_PAP' } };

const PROPIO      = { prosp_id: 100, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 };
const AJENO       = { prosp_id: 101, prosp_asesor_id: 11, prosp_grupo_id: 1, prosp_area_id: 1 };
const OTRO_GRUPO  = { prosp_id: 200, prosp_asesor_id: 30, prosp_grupo_id: 2, prosp_area_id: 1 };
const PAP         = { prosp_id: 300, prosp_asesor_id: 40, prosp_grupo_id: 3, prosp_area_id: 3 };

beforeEach(() => jest.clearAllMocks());

describe('prospectos.controller.getOne', () => {
  test('asesor sobre su prospecto → 200', async () => {
    prospectos.obtenerCompleto.mockResolvedValue(PROPIO);
    const res = resFalso();
    await ctrl.getOne(reqDe(ASESOR, 100), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: PROPIO });
  });

  test('asesor sobre prospecto ajeno → 403 Fuera de tu alcance', async () => {
    prospectos.obtenerCompleto.mockResolvedValue(AJENO);
    const res = resFalso();
    await ctrl.getOne(reqDe(ASESOR, 101), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
  });

  test('supervisor sobre prospecto de otro grupo → 403 Fuera de tu grupo', async () => {
    prospectos.obtenerCompleto.mockResolvedValue(OTRO_GRUPO);
    const res = resFalso();
    await ctrl.getOne(reqDe(SUPERVISOR, 200), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu grupo' });
  });

  test('JEFE_PAP con usr_grupo_id ≠ PAP sobre prospecto PAP → 200', async () => {
    prospectos.obtenerCompleto.mockResolvedValue(PAP);
    const res = resFalso();
    await ctrl.getOne(reqDe(JEFE_PAP, 300), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('prospecto inexistente → 404', async () => {
    prospectos.obtenerCompleto.mockResolvedValue(null);
    const res = resFalso();
    await ctrl.getOne(reqDe(ASESOR, 999), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'NOT_FOUND', message: 'Prospecto no encontrado' });
  });

  test('error del servicio → la promesa se resuelve y next recibe el error', async () => {
    const err = new Error('ER_LOCK_WAIT_TIMEOUT');
    prospectos.obtenerCompleto.mockRejectedValue(err);
    const next = jest.fn();
    await expect(ctrl.getOne(reqDe(ASESOR, 100), resFalso(), next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledWith(err);
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx jest tests/prospectosGetOne.test.js`
Expected: FAIL en `JEFE_PAP con usr_grupo_id ≠ PAP sobre prospecto PAP → 200` (recibe 403) y en `error del servicio …` (la promesa se rechaza). Las otras cuatro pasan.

- [ ] **Step 3: Reescribir `getOne` con el helper**

En `src/sv/controllers/prospectos.controller.js`, reemplazar la línea 7:

```js
const { grupoIdsAccesibles, areaIdsAccesibles } = require('../utils/acceso');
```

por:

```js
const { grupoIdsAccesibles } = require('../utils/acceso');
const { fueraDeAlcance } = require('../utils/alcanceProspecto');
```

Y reemplazar la función `getOne` completa (líneas 52-65, desde `async function getOne(req, res) {` hasta su `}`) por:

```js
async function getOne(req, res, next) {
  try {
    const p = await prospectos.obtenerCompleto(parseInt(req.params.id));
    if (!p) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Prospecto no encontrado');

    // Regla única de alcance (asesor / grupo / área), ver utils/alcanceProspecto.
    const motivo = fueraDeAlcance(req.user, req.scope, p);
    if (motivo) return fail(res, 403, ERROR_CODES.FORBIDDEN, motivo);

    return ok(res, p);
  } catch (e) {
    return next(e);
  }
}
```

Verificar que `areaIdsAccesibles` ya no aparece en el archivo:

Run: `grep -n "areaIdsAccesibles" src/sv/controllers/prospectos.controller.js`
Expected: sin salida.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npx jest tests/prospectosGetOne.test.js tests/alcanceProspecto.test.js`
Expected: PASS, 2 suites.

- [ ] **Step 5: Commit**

```bash
git add src/sv/controllers/prospectos.controller.js tests/prospectosGetOne.test.js
git commit -m "fix(sv): getOne de prospectos usa la regla única de alcance y reenvía errores

El JEFE_PAP ve los prospectos PAP aunque su usr_grupo_id sea otro, y un
usuario sin alcance definido recibe 403 en vez de ver cualquier prospecto.

Co-Authored-By: <nombre del modelo que hace el commit> <noreply@anthropic.com>"
```

---

### Task 3: Alcance en `POST` y `GET /api/sv/gestiones`

**Files:**
- Modify: `src/sv/services/prospectos.service.js` (agregar `obtenerAlcance` después de `obtenerCompleto`, línea ~193, y exportarla en el `module.exports` de las líneas ~483-487)
- Modify (reescribir): `src/sv/controllers/gestiones.controller.js`
- Test: `tests/prospectosObtenerAlcance.test.js`
- Test: `tests/gestiones.routes.test.js` (se crea aquí; las Tareas 4 y 5 le agregan bloques `describe`)

**Interfaces:**
- Consumes: `fueraDeAlcance(user, scope, prospecto)` (Tarea 1); `gestiones.crear(payload, asesorId)`, `gestiones.historial(prospId, { page, limit })`, `gestiones.resumenDia(asesorId, fecha)` (ya existen).
- Produces:
  - `prospectos.obtenerAlcance(id) → Promise<{ prosp_id, prosp_asesor_id, prosp_grupo_id, prosp_area_id } | null>`.
  - `gestiones.controller`: `create(req, res, next)`, `list(req, res, next)`, `resumenDia(req, res, next)` y el helper interno `prospectoVisible(req, res, prospId)`. En esta tarea `resumenDia` solo recibe el `try/catch`; su alcance lo cierra la Tarea 5.
  - En `tests/gestiones.routes.test.js`, para las Tareas 4 y 5: `app(user)`, `reqDe(user, extra)`, `resFalso()`, las constantes `ASESOR` (usr_id 10, grupo 1), `SUPERVISOR` (usr_id 20, grupo 1), `PROSPECTOS` (100 del asesor 10; 101 del asesor 11 en el grupo 1; 200 del grupo 2), `GESTION` y los módulos simulados `prospectos`, `gestiones`, `SvUsuario`, `ctrl`.

- [ ] **Step 1: Escribir la prueba de `obtenerAlcance` que falla**

Crear `tests/prospectosObtenerAlcance.test.js`:

```js
/**
 * prospectos.service.obtenerAlcance: carga liviana para decidir el alcance.
 */
jest.mock('../src/sv/models', () => ({
  sequelize: {},
  SvProspecto: { findByPk: jest.fn() },
  SvProspectoProducto: {}, SvPersona: {}, SvUsuario: {}, SvEstado: {}, SvFuente: {},
  SvPunto: {}, SvLista: {}, SvGestion: {}, SvResultado: {}, SvEmpresa: {}
}));

const { SvProspecto } = require('../src/sv/models');
const { obtenerAlcance } = require('../src/sv/services/prospectos.service');

test('carga solo los campos del alcance, sin include', async () => {
  const fila = { prosp_id: 5, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 };
  SvProspecto.findByPk.mockResolvedValue(fila);
  await expect(obtenerAlcance(5)).resolves.toBe(fila);
  expect(SvProspecto.findByPk).toHaveBeenCalledWith(5, {
    attributes: ['prosp_id', 'prosp_asesor_id', 'prosp_grupo_id', 'prosp_area_id']
  });
});

test('prospecto inexistente → null', async () => {
  SvProspecto.findByPk.mockResolvedValue(null);
  await expect(obtenerAlcance(999)).resolves.toBeNull();
});
```

- [ ] **Step 2: Escribir la prueba de rutas que falla**

Crear `tests/gestiones.routes.test.js`:

```js
/**
 * /api/sv/gestiones detrás del svAreaGuard real. Sin base de datos: servicios
 * y modelos simulados con jest.mock.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../src/sv/models', () => ({ SvUsuario: { findAll: jest.fn() } }));
jest.mock('../src/sv/services/prospectos.service', () => ({ obtenerAlcance: jest.fn() }));
jest.mock('../src/sv/services/gestiones.service', () => ({
  crear: jest.fn(), historial: jest.fn(), resumenDia: jest.fn()
}));

const { SvUsuario } = require('../src/sv/models');
const prospectos = require('../src/sv/services/prospectos.service');
const gestiones  = require('../src/sv/services/gestiones.service');
const ctrl       = require('../src/sv/controllers/gestiones.controller');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

// Área 1, grupo 1. El asesor 11 es compañero de grupo del asesor 10.
const ASESOR     = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR' } };
const SUPERVISOR = { usr_id: 20, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [], rol: { rol_codigo: 'SUPERVISOR' } };

const PROSPECTOS = {
  100: { prosp_id: 100, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 }, // del asesor 10
  101: { prosp_id: 101, prosp_asesor_id: 11, prosp_grupo_id: 1, prosp_area_id: 1 }, // de otro asesor, mismo grupo
  200: { prosp_id: 200, prosp_asesor_id: 30, prosp_grupo_id: 2, prosp_area_id: 1 }  // de otro grupo
};

const GESTION = { gest_prosp_id: 100, gest_canal: 'llamada', gest_comentario: 'Llamada de seguimiento' };

function app(user) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = user; next(); });
  a.use(svAreaGuard);
  a.use('/api/sv/gestiones', require('../src/sv/routes/gestiones.routes'));
  // eslint-disable-next-line no-unused-vars
  a.use((err, req, res, next) => res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }));
  return a;
}

// req armado a mano para llamar al controlador sin Express.
function reqDe(user, extra = {}) {
  const req = { user, body: {}, query: {}, params: {}, ...extra };
  svAreaGuard(req, {}, () => {});
  return req;
}
function resFalso() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  prospectos.obtenerAlcance.mockImplementation(async (id) => PROSPECTOS[id] || null);
  gestiones.crear.mockResolvedValue({ gest_id: 1 });
  gestiones.historial.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, hasMore: false });
  gestiones.resumenDia.mockResolvedValue({ total: 0, positivas: 0, llamadas: 0, presenciales: 0 });
  SvUsuario.findAll.mockResolvedValue([]);
});

describe('POST /api/sv/gestiones — alcance del prospecto', () => {
  test('asesor sobre su propio prospecto → 201 a nombre suyo', async () => {
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send(GESTION);
    expect(r.status).toBe(201);
    expect(prospectos.obtenerAlcance).toHaveBeenCalledWith(100);
    expect(gestiones.crear).toHaveBeenCalledWith(expect.objectContaining({ gest_prosp_id: 100 }), 10);
  });

  test('asesor sobre el prospecto de otro asesor → 403 y no registra', async () => {
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 101 });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
    expect(gestiones.crear).not.toHaveBeenCalled();
  });

  test('supervisor sobre un prospecto de su grupo → 201 a nombre del supervisor', async () => {
    const r = await request(app(SUPERVISOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 101 });
    expect(r.status).toBe(201);
    expect(gestiones.crear).toHaveBeenCalledWith(expect.objectContaining({ gest_prosp_id: 101 }), 20);
  });

  test('supervisor sobre un prospecto de otro grupo → 403 y no registra', async () => {
    const r = await request(app(SUPERVISOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 200 });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu grupo' });
    expect(gestiones.crear).not.toHaveBeenCalled();
  });

  test('prospecto inexistente → 404 y no registra', async () => {
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_prosp_id: 999 });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: 'NOT_FOUND', message: 'Prospecto no encontrado' });
    expect(gestiones.crear).not.toHaveBeenCalled();
  });
});

describe('GET /api/sv/gestiones — historial', () => {
  test('historial de un prospecto propio → 200', async () => {
    const r = await request(app(ASESOR)).get('/api/sv/gestiones?prosp_id=100');
    expect(r.status).toBe(200);
    expect(gestiones.historial).toHaveBeenCalledWith(100, { page: 1, limit: 20 });
  });

  test('historial de un prospecto ajeno → 403 y no consulta', async () => {
    const r = await request(app(ASESOR)).get('/api/sv/gestiones?prosp_id=101');
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
    expect(gestiones.historial).not.toHaveBeenCalled();
  });

  test('supervisor: historial de otro grupo → 403', async () => {
    const r = await request(app(SUPERVISOR)).get('/api/sv/gestiones?prosp_id=200');
    expect(r.status).toBe(403);
    expect(gestiones.historial).not.toHaveBeenCalled();
  });

  test('historial de un prospecto inexistente → 404', async () => {
    const r = await request(app(ASESOR)).get('/api/sv/gestiones?prosp_id=999');
    expect(r.status).toBe(404);
    expect(gestiones.historial).not.toHaveBeenCalled();
  });
});

describe('errores en POST y GET → next(e), el proceso sigue vivo', () => {
  test('POST: error al registrar → 500 del manejador de errores', async () => {
    gestiones.crear.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send(GESTION);
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('INTERNAL_ERROR');
  });

  test('POST: error al cargar el prospecto → 500', async () => {
    prospectos.obtenerAlcance.mockRejectedValue(new Error('ECONNRESET'));
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send(GESTION);
    expect(r.status).toBe(500);
    expect(gestiones.crear).not.toHaveBeenCalled();
  });

  test('GET: error al leer el historial → 500', async () => {
    gestiones.historial.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(app(ASESOR)).get('/api/sv/gestiones?prosp_id=100');
    expect(r.status).toBe(500);
  });

  test('create: la promesa se resuelve y next recibe el error', async () => {
    const err = new Error('ER_LOCK_WAIT_TIMEOUT');
    gestiones.crear.mockRejectedValue(err);
    const next = jest.fn();
    await expect(ctrl.create(reqDe(ASESOR, { body: { ...GESTION } }), resFalso(), next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledWith(err);
  });

  test('list: la promesa se resuelve y next recibe el error', async () => {
    const err = new Error('ER_LOCK_WAIT_TIMEOUT');
    gestiones.historial.mockRejectedValue(err);
    const next = jest.fn();
    const req = reqDe(ASESOR, { query: { prosp_id: 100, page: 1, limit: 20 } });
    await expect(ctrl.list(req, resFalso(), next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledWith(err);
  });
});
```

- [ ] **Step 3: Correr las pruebas y verificar que fallan**

Run: `npx jest tests/prospectosObtenerAlcance.test.js tests/gestiones.routes.test.js`
Expected: FAIL. `obtenerAlcance is not a function` en la primera suite. En la segunda fallan los casos 403/404 (reciben 201/200), los de error (las peticiones quedan colgadas hasta el timeout de 5 s de Jest y las llamadas directas rechazan su promesa). Pasan solo los casos 201/200 del camino feliz.

- [ ] **Step 4: Agregar `obtenerAlcance` al servicio de prospectos**

En `src/sv/services/prospectos.service.js`, inmediatamente después de la función `obtenerCompleto` (termina con `});` y `}` cerca de la línea 210), agregar:

```js
// Solo los campos que decide el alcance (utils/alcanceProspecto). Sin include:
// lo usan endpoints que no devuelven la ficha, como las gestiones.
async function obtenerAlcance(id) {
  return SvProspecto.findByPk(id, {
    attributes: ['prosp_id', 'prosp_asesor_id', 'prosp_grupo_id', 'prosp_area_id']
  });
}
```

Y en el `module.exports` del final del archivo, agregar `obtenerAlcance` después de `obtenerCompleto`:

```js
module.exports = {
  list, panelDia, agendaMes, obtenerCompleto, obtenerAlcance, crear, actualizar, actualizarProductos,
  reasignar, reasignacionMasiva, prospectosPorAsesor,
  sinAsignar, contadorSinAsignar, buildScopeWhere
};
```

- [ ] **Step 5: Reescribir el controlador de gestiones**

Reemplazar todo `src/sv/controllers/gestiones.controller.js` por:

```js
/**
 * sv/controllers/gestiones.controller.js
 * Registrar una gestión o ver su historial exige que el prospecto esté en el
 * alcance del usuario (utils/alcanceProspecto). Los errores se reenvían con
 * next(e): en Express 4 una promesa rechazada en un handler async no llega al
 * middleware de errores y server.js termina el proceso ante un
 * unhandledRejection.
 */
const gestiones  = require('../services/gestiones.service');
const prospectos = require('../services/prospectos.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');
const { fueraDeAlcance } = require('../utils/alcanceProspecto');

// Carga el prospecto y verifica el alcance. Devuelve el prospecto, o null si
// ya respondió 404 / 403.
async function prospectoVisible(req, res, prospId) {
  const p = await prospectos.obtenerAlcance(prospId);
  if (!p) {
    fail(res, 404, ERROR_CODES.NOT_FOUND, 'Prospecto no encontrado');
    return null;
  }
  const motivo = fueraDeAlcance(req.user, req.scope, p);
  if (motivo) {
    fail(res, 403, ERROR_CODES.FORBIDDEN, motivo);
    return null;
  }
  return p;
}

async function create(req, res, next) {
  try {
    if (!(await prospectoVisible(req, res, req.body.gest_prosp_id))) return;
    const g = await gestiones.crear(req.body, req.user.usr_id);
    return created(res, g);
  } catch (e) {
    return next(e);
  }
}

async function list(req, res, next) {
  try {
    const prospId = parseInt(req.query.prosp_id);
    if (!(await prospectoVisible(req, res, prospId))) return;
    const r = await gestiones.historial(prospId, { page: req.query.page, limit: req.query.limit });
    return ok(res, r);
  } catch (e) {
    return next(e);
  }
}

async function resumenDia(req, res, next) {
  try {
    const asesorId = req.query.asesor_id ? parseInt(req.query.asesor_id) : req.user.usr_id;
    const r = await gestiones.resumenDia(asesorId, req.query.fecha);
    return ok(res, r);
  } catch (e) {
    return next(e);
  }
}

module.exports = { create, list, resumenDia };
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `npx jest tests/prospectosObtenerAlcance.test.js tests/gestiones.routes.test.js tests/prospectosGetOne.test.js tests/alcanceProspecto.test.js`
Expected: PASS, 4 suites.

- [ ] **Step 7: Commit**

```bash
git add src/sv/services/prospectos.service.js src/sv/controllers/gestiones.controller.js tests/prospectosObtenerAlcance.test.js tests/gestiones.routes.test.js
git commit -m "fix(sv): registrar gestiones y ver su historial exige el alcance del prospecto

POST y GET /api/sv/gestiones responden 404 si el prospecto no existe y 403
si está fuera del alcance del usuario. Los handlers reenvían los errores
con next(e) en vez de dejar la promesa rechazada, que tumbaba el proceso.

Co-Authored-By: <nombre del modelo que hace el commit> <noreply@anthropic.com>"
```

---

### Task 4: La gestión queda a nombre de quien la registra (`gest_asesor_id`)

**Files:**
- Modify: `src/sv/validations/crm.validation.js:112` (quitar `gest_asesor_id` de `gestiones.create`)
- Modify: `src/sv/services/gestiones.service.js:19` (`crear` deja de leer `payload.gest_asesor_id`)
- Test: `tests/gestiones.service.test.js`
- Test: `tests/gestiones.routes.test.js` (agregar un `describe` al final)

**Interfaces:**
- Consumes: de `tests/gestiones.routes.test.js` (Tarea 3): `app(user)`, `ASESOR` (usr_id 10), `SUPERVISOR` (usr_id 20), `GESTION`, `gestiones` (servicio simulado).
- Produces: `gestiones.crear(payload, asesorId)` graba siempre `gest_asesor_id = asesorId`.

- [ ] **Step 1: Escribir la prueba del servicio que falla**

Crear `tests/gestiones.service.test.js`:

```js
/**
 * gestiones.service.crear: la gestión queda a nombre de quien la registra.
 * Modelos, transacción y recuperación automática simulados (sin base).
 */
jest.mock('../src/utils/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../src/sv/services/recuperacionAuto.service', () => ({ intentarRecuperacion: jest.fn() }));
jest.mock('../src/sv/models', () => {
  const t = { commit: jest.fn(), rollback: jest.fn() };
  return {
    sequelize:   { transaction: jest.fn(async () => t) },
    SvGestion:   { create: jest.fn(), findByPk: jest.fn() },
    SvProspecto: { findByPk: jest.fn(), update: jest.fn() },
    SvEstado:    { findByPk: jest.fn() },
    SvResultado: {},
    SvUsuario:   {}
  };
});

const { SvGestion } = require('../src/sv/models');
const { crear } = require('../src/sv/services/gestiones.service');

beforeEach(() => {
  jest.clearAllMocks();
  SvGestion.create.mockResolvedValue({ gest_id: 1 });
  SvGestion.findByPk.mockResolvedValue({ gest_id: 1, dataValues: {} });
});

describe('gestiones.service.crear', () => {
  test('ignora gest_asesor_id del payload: queda a nombre de quien registra', async () => {
    await crear({ gest_prosp_id: 5, gest_asesor_id: 99, gest_canal: 'llamada' }, 7);
    expect(SvGestion.create).toHaveBeenCalledTimes(1);
    expect(SvGestion.create.mock.calls[0][0].gest_asesor_id).toBe(7);
  });

  test('sin gest_asesor_id en el payload usa el asesorId recibido', async () => {
    await crear({ gest_prosp_id: 5 }, 7);
    expect(SvGestion.create.mock.calls[0][0].gest_asesor_id).toBe(7);
  });
});
```

- [ ] **Step 2: Agregar la prueba de ruta que falla**

Al final de `tests/gestiones.routes.test.js`, agregar:

```js
describe('POST /api/sv/gestiones — gest_asesor_id', () => {
  test('asesor con gest_asesor_id ajeno: se descarta y la gestión queda a su nombre', async () => {
    const r = await request(app(ASESOR)).post('/api/sv/gestiones').send({ ...GESTION, gest_asesor_id: 11 });
    expect(r.status).toBe(201);
    const [payload, autor] = gestiones.crear.mock.calls[0];
    expect(payload).not.toHaveProperty('gest_asesor_id');
    expect(autor).toBe(10);
  });

  test('supervisor con gest_asesor_id de un asesor: queda a nombre del supervisor', async () => {
    const r = await request(app(SUPERVISOR)).post('/api/sv/gestiones')
      .send({ ...GESTION, gest_prosp_id: 101, gest_asesor_id: 11 });
    expect(r.status).toBe(201);
    const [payload, autor] = gestiones.crear.mock.calls[0];
    expect(payload).not.toHaveProperty('gest_asesor_id');
    expect(autor).toBe(20);
  });
});
```

- [ ] **Step 3: Correr las pruebas y verificar que fallan**

Run: `npx jest tests/gestiones.service.test.js tests/gestiones.routes.test.js`
Expected: FAIL en `ignora gest_asesor_id del payload …` (recibe 99) y en los dos casos nuevos de rutas (el payload todavía trae `gest_asesor_id`). El resto pasa.

- [ ] **Step 4: Quitar `gest_asesor_id` del esquema**

En `src/sv/validations/crm.validation.js`, dentro de `gestiones.create`, borrar la línea:

```js
    gest_asesor_id:       Joi.number().integer(),
```

y dejar en su lugar, justo encima de `gest_resultado_id`, el comentario:

```js
    // gest_asesor_id no se acepta: la gestión queda a nombre de quien la
    // registra (validate usa stripUnknown, así que si llega se descarta).
```

- [ ] **Step 5: El servicio deja de leer `payload.gest_asesor_id`**

En `src/sv/services/gestiones.service.js`, dentro de `crear`, reemplazar:

```js
      gest_asesor_id:       payload.gest_asesor_id || asesorId,
```

por:

```js
      gest_asesor_id:       asesorId, // siempre quien registra; el payload no decide el autor
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `npx jest tests/gestiones.service.test.js tests/gestiones.routes.test.js`
Expected: PASS, 2 suites.

- [ ] **Step 7: Commit**

```bash
git add src/sv/validations/crm.validation.js src/sv/services/gestiones.service.js tests/gestiones.service.test.js tests/gestiones.routes.test.js
git commit -m "fix(sv): la gestión queda siempre a nombre de quien la registra

gest_asesor_id sale del esquema y el servicio deja de leerlo: nadie puede
atribuir una gestión a otro asesor e inflar sus reportes. El frontend no
lo envía, así que no hay cambio visible.

Co-Authored-By: <nombre del modelo que hace el commit> <noreply@anthropic.com>"
```

---

### Task 5: Alcance en `GET /api/sv/gestiones/resumen-dia`

**Files:**
- Modify: `src/sv/controllers/gestiones.controller.js` (import de `usuariosAccesibles`, helper `resolverAsesorResumen` y `resumenDia`)
- Test: `tests/gestiones.routes.test.js` (agregar un `describe` al final)

**Interfaces:**
- Consumes: `usuariosAccesibles(actor) → Promise<number[] | null>` de `src/sv/utils/acceso.js` (consulta `SvUsuario.findAll`; `null` para SUPER_ADMIN; `[usr_id]` para ASESOR/AGENTE_SVC). De `tests/gestiones.routes.test.js`: `app(user)`, `reqDe`, `resFalso`, `ASESOR`, `SUPERVISOR`, `gestiones`, `SvUsuario`, `ctrl`.
- Produces: `resumenDia(req, res, next)` con 403 `Fuera de tu alcance` para un `asesor_id` fuera del alcance.

- [ ] **Step 1: Agregar las pruebas que fallan**

Al final de `tests/gestiones.routes.test.js`, agregar:

```js
describe('GET /api/sv/gestiones/resumen-dia', () => {
  const SUPER_ADMIN = { usr_id: 1, usr_area_id: 1, rol: { rol_codigo: 'SUPER_ADMIN' } };

  test('asesor sin asesor_id → su propio resumen', async () => {
    const r = await request(app(ASESOR)).get('/api/sv/gestiones/resumen-dia');
    expect(r.status).toBe(200);
    expect(gestiones.resumenDia).toHaveBeenCalledWith(10, undefined);
  });

  test('asesor que pide el resumen de otro asesor → recibe el suyo', async () => {
    const r = await request(app(ASESOR)).get('/api/sv/gestiones/resumen-dia?asesor_id=11');
    expect(r.status).toBe(200);
    expect(gestiones.resumenDia).toHaveBeenCalledWith(10, undefined);
    expect(SvUsuario.findAll).not.toHaveBeenCalled();
  });

  test('supervisor con un asesor de su grupo → 200 con el resumen de ese asesor', async () => {
    SvUsuario.findAll.mockResolvedValue([{ usr_id: 10 }, { usr_id: 11 }, { usr_id: 20 }]);
    const r = await request(app(SUPERVISOR)).get('/api/sv/gestiones/resumen-dia?asesor_id=11');
    expect(r.status).toBe(200);
    expect(gestiones.resumenDia).toHaveBeenCalledWith(11, undefined);
  });

  test('supervisor con un asesor fuera de su grupo → 403 y no consulta', async () => {
    SvUsuario.findAll.mockResolvedValue([{ usr_id: 10 }, { usr_id: 11 }, { usr_id: 20 }]);
    const r = await request(app(SUPERVISOR)).get('/api/sv/gestiones/resumen-dia?asesor_id=30');
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ success: false, error: 'FORBIDDEN', message: 'Fuera de tu alcance' });
    expect(gestiones.resumenDia).not.toHaveBeenCalled();
  });

  test('supervisor sin asesor_id → su propio resumen, sin consultar usuarios', async () => {
    const r = await request(app(SUPERVISOR)).get('/api/sv/gestiones/resumen-dia');
    expect(r.status).toBe(200);
    expect(gestiones.resumenDia).toHaveBeenCalledWith(20, undefined);
    expect(SvUsuario.findAll).not.toHaveBeenCalled();
  });

  test('SUPER_ADMIN puede pedir el resumen de cualquier asesor', async () => {
    const r = await request(app(SUPER_ADMIN)).get('/api/sv/gestiones/resumen-dia?asesor_id=30');
    expect(r.status).toBe(200);
    expect(gestiones.resumenDia).toHaveBeenCalledWith(30, undefined);
  });

  test('error del servicio → 500 del manejador de errores', async () => {
    gestiones.resumenDia.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(app(ASESOR)).get('/api/sv/gestiones/resumen-dia');
    expect(r.status).toBe(500);
  });

  test('error al consultar usuarios accesibles → 500', async () => {
    SvUsuario.findAll.mockRejectedValue(new Error('ECONNRESET'));
    const r = await request(app(SUPERVISOR)).get('/api/sv/gestiones/resumen-dia?asesor_id=11');
    expect(r.status).toBe(500);
    expect(gestiones.resumenDia).not.toHaveBeenCalled();
  });

  test('resumenDia: la promesa se resuelve y next recibe el error', async () => {
    const err = new Error('ER_LOCK_WAIT_TIMEOUT');
    gestiones.resumenDia.mockRejectedValue(err);
    const next = jest.fn();
    await expect(ctrl.resumenDia(reqDe(ASESOR), resFalso(), next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledWith(err);
  });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npx jest tests/gestiones.routes.test.js`
Expected: FAIL en `asesor que pide el resumen de otro asesor …` (se llama con 11), `supervisor con un asesor fuera de su grupo …` (recibe 200) y `error al consultar usuarios accesibles …` (recibe 200, todavía no se consulta). El resto pasa.

- [ ] **Step 3: Implementar el alcance en `resumenDia`**

En `src/sv/controllers/gestiones.controller.js`, debajo de la línea
`const { fueraDeAlcance } = require('../utils/alcanceProspecto');`, agregar:

```js
const { usuariosAccesibles } = require('../utils/acceso');
```

Y reemplazar la función `resumenDia` completa por:

```js
// De quién es el resumen que se pide. ASESOR / AGENTE_SVC: siempre el propio
// (se ignora asesor_id, igual que aplicarFiltroAsesor en prospectos). Resto:
// el propio, o el de un asesor que esté en usuariosAccesibles(actor).
// Devuelve null si el asesor pedido está fuera del alcance.
async function resolverAsesorResumen(req) {
  const propio = req.user.usr_id;
  if (req.scope?.asesorId) return propio;
  const pedido = req.query.asesor_id ? parseInt(req.query.asesor_id) : null;
  if (!pedido || pedido === propio) return propio;
  const ids = await usuariosAccesibles(req.user); // null = SUPER_ADMIN, sin filtro
  if (ids === null || ids.map(Number).includes(pedido)) return pedido;
  return null;
}

async function resumenDia(req, res, next) {
  try {
    const asesorId = await resolverAsesorResumen(req);
    if (asesorId === null) return fail(res, 403, ERROR_CODES.FORBIDDEN, 'Fuera de tu alcance');
    const r = await gestiones.resumenDia(asesorId, req.query.fecha);
    return ok(res, r);
  } catch (e) {
    return next(e);
  }
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npx jest tests/gestiones.routes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sv/controllers/gestiones.controller.js tests/gestiones.routes.test.js
git commit -m "fix(sv): el resumen del día solo muestra asesores dentro del alcance

Un ASESOR o AGENTE_SVC ve siempre su propio resumen aunque envíe asesor_id;
los demás roles solo pueden pedir asesores de usuariosAccesibles, si no 403.

Co-Authored-By: <nombre del modelo que hace el commit> <noreply@anthropic.com>"
```

---

### Task 6: Verificación final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Correr las suites nuevas juntas**

Run: `npx jest tests/alcanceProspecto.test.js tests/prospectosGetOne.test.js tests/prospectosObtenerAlcance.test.js tests/gestiones.routes.test.js tests/gestiones.service.test.js`
Expected: PASS, 5 suites, 0 fallos.

- [ ] **Step 2: Correr la suite completa**

Run: `npx jest --silent 2>&1 | grep -E "^(FAIL|Tests:|Test Suites:)"`
Expected: solo fallan las 5 suites conocidas de Global Constraints. Total: 175 suites (170 + 5 nuevas), 5 fallidas, 170 pasan.

- [ ] **Step 3: Confirmar que el árbol queda limpio y en la rama correcta**

Run: `git status --short && git branch --show-current && git log --oneline main..HEAD`
Expected: sin cambios pendientes, rama `fix/permisos-gestiones`, y los commits de spec, plan y tareas 1 a 5.
