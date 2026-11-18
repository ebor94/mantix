# Permisos de `/api/sv/personas` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el alcance de `/api/sv/personas`: las rutas con `:id` exigen relación con la persona, el historial cross-área es solo para nivel ≤ 3, la lista de prospectos cross-área sale recortada y ningún handler tumba el proceso ante un error.

**Architecture:** Una función pura `fueraDeAlcancePersona` (sobre la regla única `fueraDeAlcance` de `fix/permisos-gestiones`) decide la relación con una persona a partir de sus prospectos; `personas.service.alcancesDePersona` los carga con 4 campos; el middleware de ruta `personas.controller.exigirRelacion` une ambos y responde 404/403 antes de los handlers. El historial reutiliza `authorizeLevel(NIVELES.SUPERVISOR)` de `svAuthorize`. Los handlers reenvían errores con `next(e)`.

**Tech Stack:** Node.js, Express 4, Sequelize 6 (MySQL), Joi, Jest 29 + supertest.

**Spec:** `docs/superpowers/specs/2026-11-18-permisos-personas-design.md`

## Global Constraints

- Directorio de trabajo: `/Users/bortega/Shared/Files From c.localized/apps/mantix/mantix-backend/.worktrees/fix-permisos-personas` (rama `fix/permisos-personas`, apilada sobre `fix/permisos-gestiones`). Nunca `cd` al checkout principal de `mantix-backend`; otras sesiones lo usan y pueden resetear `main`.
- Pruebas solo con `jest.mock` y supertest. **Nunca `sequelize.sync` ni conexiones reales**: la única base es la de producción compartida.
- Correr Jest con `npx jest <ruta>` (sin `--coverage`).
- Sin `git push`, sin despliegue, sin `git stash` (la pila de stash es compartida).
- Commits en español, estilo `fix(sv): …` / `feat(sv): …` / `test(sv): …`, terminados en:
  `Co-Authored-By: <tu modelo> <noreply@anthropic.com>` (cada modelo firma con su propio nombre).
- GERENTE_GENERAL y DIRECTOR_COMERCIAL (cross-área) siguen sin restricción.
- Respuestas de error con `fail(res, status, ERROR_CODES.X, mensaje)` de `src/sv/utils/response.js` → `{ success: false, error, message }`.
- Mensajes exactos: `'Sin prospectos de esta persona en tu alcance'` (403 sin relación), `'Persona no encontrada'` (404), `'Nivel insuficiente (requerido: <= 3)'` (403 de `authorizeLevel(3)`, ya existe).
- Suite completa: solo pueden fallar las 5 suites conocidas: `test/grupoIndivII`, `tests/invitacion.service`, `src/masajes/__tests__/adapters` (dos) y `tests/afiliadoEmpresaAccess`.

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/sv/utils/alcancePersona.js` | Crear | Función pura: ¿el usuario tiene relación con la persona dados sus prospectos? |
| `tests/alcancePersona.test.js` | Crear | Matriz de roles sobre la función pura |
| `src/sv/services/personas.service.js` | Modificar | `alcancesDePersona(id)` nuevo; `prospectosActivos` con campos recortados |
| `tests/personas.service.test.js` | Crear | Atributos pedidos por ambas funciones (modelos simulados) |
| `src/sv/controllers/personas.controller.js` | Reescribir | Middleware `exigirRelacion` + handlers con `next(e)` y `req.personaId` |
| `src/sv/routes/personas.routes.js` | Modificar | Cadena de middlewares por ruta |
| `tests/personas.routes.test.js` | Crear | Rutas reales detrás de `svAreaGuard`, servicio simulado |
| `docs/superpowers/specs/2026-11-18-permisos-personas-design.md` | Ya existe | No se toca en las tareas |

---

### Task 1: Relación con la persona (función pura)

**Files:**
- Create: `src/sv/utils/alcancePersona.js`
- Test: `tests/alcancePersona.test.js`

**Interfaces:**
- Consumes: `fueraDeAlcance(user, scope, prospecto) → null | string` de `src/sv/utils/alcanceProspecto.js` (ya existe; no modificar). `scope` lo arma `svAreaGuard` (`src/sv/middleware/svAreaGuard.js`).
- Produces: `fueraDeAlcancePersona(user, scope, prospectos) → null | string` y la constante `SIN_RELACION = 'Sin prospectos de esta persona en tu alcance'`, ambas exportadas de `src/sv/utils/alcancePersona.js`. `prospectos` es un arreglo (o `null`) de objetos `{ prosp_id, prosp_asesor_id, prosp_grupo_id, prosp_area_id }`.

- [ ] **Step 1: Write the failing test**

Crear `tests/alcancePersona.test.js`:

```js
/**
 * Relación de un usuario con una persona (src/sv/utils/alcancePersona.js).
 * El scope se arma con el svAreaGuard real para que la prueba refleje producción.
 */
const { fueraDeAlcancePersona, SIN_RELACION } = require('../src/sv/utils/alcancePersona');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

function scopeDe(user) {
  const req = { user };
  svAreaGuard(req, {}, () => {});
  return req.scope;
}

const P = (asesor, grupo, area) => ({
  prosp_id: 1, prosp_asesor_id: asesor, prosp_grupo_id: grupo, prosp_area_id: area
});

const asesor      = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR' } };
const supervisor  = { usr_id: 20, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [], rol: { rol_codigo: 'SUPERVISOR' } };
const adminArea   = { usr_id: 30, usr_area_id: 1, areasExtra: [], rol: { rol_codigo: 'ADMIN_AREA' } };
// JEFE_PAP con usr_grupo_id 1: svAreaGuard le fija grupoId = 3 (PAP).
const jefePap     = { usr_id: 22, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'JEFE_PAP' } };
const gerente     = { usr_id: 2,  usr_area_id: 1, rol: { rol_codigo: 'GERENTE_GENERAL' } };
const desconocido = { usr_id: 50, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'OTRO' } };

const NO = 'Sin prospectos de esta persona en tu alcance';

describe('fueraDeAlcancePersona', () => {
  test('exporta el mensaje del 403', () => {
    expect(SIN_RELACION).toBe(NO);
  });

  test.each([
    ['cross-área sin prospectos',                     gerente,     [],                                      null],
    ['cross-área con prospectos ajenos',              gerente,     [P(99, 9, 9)],                           null],
    ['ASESOR con uno propio entre ajenos',            asesor,      [P(11, 1, 1), P(10, 1, 1), P(30, 2, 2)], null],
    ['ASESOR solo con prospectos ajenos',             asesor,      [P(11, 1, 1), P(30, 2, 2)],              NO],
    ['SUPERVISOR con uno de su grupo',                supervisor,  [P(30, 2, 1), P(11, 1, 1)],              null],
    ['SUPERVISOR solo con prospectos de otro grupo',  supervisor,  [P(30, 2, 1)],                           NO],
    ['ADMIN_AREA con uno de su área',                 adminArea,   [P(40, 7, 3), P(41, 5, 1)],              null],
    ['ADMIN_AREA solo con prospectos de otra área',   adminArea,   [P(40, 7, 3)],                           NO],
    ['JEFE_PAP con uno del grupo PAP',                jefePap,     [P(60, 3, 3)],                           null],
    ['JEFE_PAP fuera de PAP y de su grupo',           jefePap,     [P(60, 4, 2)],                           NO],
    ['lista vacía sin cross-área',                    supervisor,  [],                                      NO],
    ['rol sin alcance definido',                      desconocido, [P(10, 1, 1)],                           NO]
  ])('%s', (_, user, prospectos, esperado) => {
    expect(fueraDeAlcancePersona(user, scopeDe(user), prospectos)).toBe(esperado);
  });

  test('lista null se trata como vacía', () => {
    expect(fueraDeAlcancePersona(asesor, scopeDe(asesor), null)).toBe(NO);
  });

  test('scope ausente falla cerrado', () => {
    expect(fueraDeAlcancePersona(asesor, undefined, [P(10, 1, 1)])).toBe(NO);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/alcancePersona.test.js`
Expected: FAIL con `Cannot find module '../src/sv/utils/alcancePersona'`.

- [ ] **Step 3: Write minimal implementation**

Crear `src/sv/utils/alcancePersona.js`:

```js
/**
 * sv/utils/alcancePersona.js
 * Relación de un usuario con una persona: la tiene si es cross-área o si al
 * menos uno de los prospectos de la persona está en su alcance según la regla
 * única de utils/alcanceProspecto. Función pura: no consulta la base.
 *
 * fueraDeAlcancePersona(user, scope, prospectos) → null si hay relación, o el
 * mensaje para responder 403. Una lista vacía sin crossArea se niega (falla
 * cerrado): también cubre a la persona inexistente.
 */
const { fueraDeAlcance } = require('./alcanceProspecto');

const SIN_RELACION = 'Sin prospectos de esta persona en tu alcance';

function fueraDeAlcancePersona(user, scope, prospectos) {
  if (scope?.crossArea) return null;
  const alguno = (prospectos || []).some(p => fueraDeAlcance(user, scope, p) === null);
  return alguno ? null : SIN_RELACION;
}

module.exports = { fueraDeAlcancePersona, SIN_RELACION };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/alcancePersona.test.js tests/alcanceProspecto.test.js`
Expected: PASS (ambas suites).

- [ ] **Step 5: Commit**

```bash
git add src/sv/utils/alcancePersona.js tests/alcancePersona.test.js
git commit -m "feat(sv): relación de un usuario con una persona a partir de sus prospectos"
```

(con la línea `Co-Authored-By` de las Global Constraints en el mensaje)

---

### Task 2: Servicio — carga de alcances y recorte de la lista cross-área

**Files:**
- Modify: `src/sv/services/personas.service.js` (cabecera 1-13, `prospectosActivos` 31-56, `module.exports` 152-156)
- Test: `tests/personas.service.test.js`

**Interfaces:**
- Consumes: nada de la Task 1.
- Produces:
  - `personas.service.alcancesDePersona(personaId: number) → Promise<Array<{ prosp_id, prosp_asesor_id, prosp_grupo_id, prosp_area_id }>>` (la usa la Task 3).
  - `personas.service.prospectosActivos(personaId)` mantiene firma y orden; cambia solo los campos devueltos.

- [ ] **Step 1: Write the failing test**

Crear `tests/personas.service.test.js`:

```js
/**
 * personas.service: consultas de alcance y de la lista cross-área. Modelos
 * simulados con jest.mock: nunca toca la base.
 */
jest.mock('../src/sv/models', () => ({
  SvPersona:   { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  SvProspecto: { findAll: jest.fn() },
  SvGestion:   { findAll: jest.fn() },
  SvArea: {}, SvGrupo: {}, SvEstado: {}, SvUsuario: {},
  SvResultado: {}, SvFuente: {}, SvEmpresa: {}
}));

const { Op } = require('sequelize');
const { SvProspecto } = require('../src/sv/models');
const personas = require('../src/sv/services/personas.service');

beforeEach(() => {
  jest.clearAllMocks();
  SvProspecto.findAll.mockResolvedValue([]);
});

describe('alcancesDePersona', () => {
  test('titular o contacto, activos e inactivos, solo los 4 campos del alcance', async () => {
    const filas = [{ prosp_id: 1, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 }];
    SvProspecto.findAll.mockResolvedValue(filas);

    await expect(personas.alcancesDePersona(7)).resolves.toBe(filas);

    expect(SvProspecto.findAll).toHaveBeenCalledTimes(1);
    const opts = SvProspecto.findAll.mock.calls[0][0];
    expect(opts.where[Op.or]).toEqual([{ prosp_persona_id: 7 }, { prosp_contacto_empresa_id: 7 }]);
    expect(opts.where).not.toHaveProperty('prosp_activo');
    expect(opts.attributes).toEqual(['prosp_id', 'prosp_asesor_id', 'prosp_grupo_id', 'prosp_area_id']);
    expect(opts.include).toBeUndefined();
  });
});

describe('prospectosActivos: solo los campos que pinta el aviso cross-área', () => {
  test('mismo filtro y orden, atributos del prospecto recortados', async () => {
    await personas.prospectosActivos(7);

    const opts = SvProspecto.findAll.mock.calls[0][0];
    expect(opts.where.prosp_activo).toBe(1);
    expect(opts.where[Op.or]).toEqual([{ prosp_persona_id: 7 }, { prosp_contacto_empresa_id: 7 }]);
    expect(opts.order).toEqual([['prosp_updated_at', 'DESC']]);
    expect(opts.attributes).toEqual([
      'prosp_id', 'prosp_area_id', 'prosp_grupo_id', 'prosp_estado_id',
      'prosp_asesor_id', 'prosp_empresa_id', 'prosp_subproceso',
      'prosp_prox_gestion_fecha', 'prosp_prox_gestion_hora', 'prosp_updated_at'
    ]);
  });

  test('asesor sin correo, empresa sin NIT y sin fuente', async () => {
    await personas.prospectosActivos(7);

    const { include } = SvProspecto.findAll.mock.calls[0][0];
    const porAlias = Object.fromEntries(include.map(i => [i.as, i]));
    expect(Object.keys(porAlias).sort()).toEqual(['area', 'asesor', 'empresa', 'estado', 'grupo']);
    expect(porAlias.asesor.attributes).toEqual(['usr_id', 'usr_nombre', 'usr_apellido']);
    expect(porAlias.empresa.attributes).toEqual(['empresa_id', 'empresa_razon_social']);
    expect(porAlias.area.attributes).toEqual(['area_id', 'area_codigo', 'area_nombre', 'area_color_hex', 'area_icono']);
    expect(porAlias.grupo.attributes).toEqual(['grupo_id', 'grupo_codigo', 'grupo_nombre']);
    expect(porAlias.estado.attributes).toEqual([
      'estado_id', 'estado_codigo', 'estado_nombre', 'estado_color_hex', 'estado_es_final', 'estado_es_ganado'
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/personas.service.test.js`
Expected: FAIL — `personas.alcancesDePersona is not a function`, y en `prospectosActivos` `opts.attributes` es `undefined` y los alias incluyen `fuente`.

- [ ] **Step 3: Write minimal implementation**

En `src/sv/services/personas.service.js`:

3a. Reemplazar la cabecera y el `require` de modelos (líneas 1-13) por:

```js
/**
 * sv/services/personas.service.js
 * CRUD + anti-duplicados de personas naturales.
 * El UNIQUE real es sobre persona_telefono_norm.
 *
 * Cross-área:
 * - prospectosActivos(personaId): prospectos activos del cliente en todas las
 *   áreas, solo con los campos que pinta el aviso cross-área
 * - historialCompleto(personaId): timeline cronológico de todas las gestiones cross-área
 * - alcancesDePersona(personaId): carga liviana para decidir si un usuario
 *   tiene relación con la persona (utils/alcancePersona)
 */
const {
  SvPersona, SvProspecto, SvGestion, SvArea, SvGrupo, SvEstado,
  SvUsuario, SvResultado, SvEmpresa
} = require('../models');
```

(`SvFuente` sale del `require`: era su único uso.)

3b. Reemplazar el bloque de `prospectosActivos` (comentario + función, líneas 31-56) por:

```js
// Campos que pintan los consumidores del aviso cross-área (ProspectosCrossArea,
// HistorialClienteCompleto, NuevoProspecto). Quedan fuera la nota inicial, el
// contrato SAP, las fechas de convenio, la prioridad, la zona PAP, la fuente,
// el correo del asesor y el NIT de la empresa.
const ATRIBUTOS_CROSS_AREA = [
  'prosp_id', 'prosp_area_id', 'prosp_grupo_id', 'prosp_estado_id',
  'prosp_asesor_id', 'prosp_empresa_id', 'prosp_subproceso',
  'prosp_prox_gestion_fecha', 'prosp_prox_gestion_hora', 'prosp_updated_at'
];

/**
 * Prospectos activos del cliente en cualquier área: aviso cross-área de la
 * ficha, de /personas/buscar y del 409 por teléfono duplicado.
 */
async function prospectosActivos(personaId) {
  // Incluye prospectos donde la persona es persona_id O contacto_empresa_id
  const { Op } = require('sequelize');
  return SvProspecto.findAll({
    where: {
      prosp_activo: 1,
      [Op.or]: [
        { prosp_persona_id: personaId },
        { prosp_contacto_empresa_id: personaId }
      ]
    },
    attributes: ATRIBUTOS_CROSS_AREA,
    include: [
      { model: SvArea,    as: 'area',    attributes: ['area_id','area_codigo','area_nombre','area_color_hex','area_icono'] },
      { model: SvGrupo,   as: 'grupo',   attributes: ['grupo_id','grupo_codigo','grupo_nombre'] },
      { model: SvEstado,  as: 'estado',  attributes: ['estado_id','estado_codigo','estado_nombre','estado_color_hex','estado_es_final','estado_es_ganado'] },
      { model: SvUsuario, as: 'asesor',  attributes: ['usr_id','usr_nombre','usr_apellido'] },
      { model: SvEmpresa, as: 'empresa', attributes: ['empresa_id','empresa_razon_social'] }
    ],
    order: [['prosp_updated_at', 'DESC']]
  });
}

/**
 * Prospectos de la persona como titular o como contacto de empresa, activos e
 * inactivos, con los 4 campos de la regla de alcance. Los inactivos cuentan:
 * quien abre la ficha de su prospecto cerrado conserva el aviso cross-área.
 */
async function alcancesDePersona(personaId) {
  const { Op } = require('sequelize');
  return SvProspecto.findAll({
    where: {
      [Op.or]: [
        { prosp_persona_id: personaId },
        { prosp_contacto_empresa_id: personaId }
      ]
    },
    attributes: ['prosp_id', 'prosp_asesor_id', 'prosp_grupo_id', 'prosp_area_id']
  });
}
```

3c. Reemplazar `module.exports` (al final del archivo) por:

```js
module.exports = {
  buscarPorTelefono, crear, actualizar, obtener,
  prospectosActivos, historialCompleto, alcancesDePersona,
  DuplicateError
};
```

No tocar `historialCompleto`, `crear`, `actualizar`, `obtener` ni `buscarPorTelefono`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/personas.service.test.js`
Expected: PASS (3 tests).

Run: `grep -n "SvFuente" src/sv/services/personas.service.js`
Expected: sin resultados.

- [ ] **Step 5: Commit**

```bash
git add src/sv/services/personas.service.js tests/personas.service.test.js
git commit -m "fix(sv): la lista cross-área de prospectos solo expone lo que pinta el aviso"
```

(con la línea `Co-Authored-By` de las Global Constraints en el mensaje)

---

### Task 3: Controlador y rutas — relación, nivel y `next(e)`

**Files:**
- Modify (reescritura completa): `src/sv/controllers/personas.controller.js`
- Modify: `src/sv/routes/personas.routes.js`
- Test: `tests/personas.routes.test.js`

**Interfaces:**
- Consumes:
  - `fueraDeAlcancePersona(user, scope, prospectos) → null | string` de `src/sv/utils/alcancePersona.js` (Task 1).
  - `personas.service.alcancesDePersona(personaId) → Promise<Array<{ prosp_id, prosp_asesor_id, prosp_grupo_id, prosp_area_id }>>` (Task 2).
  - `authorizeLevel(nivelMaximo)` de `src/sv/middleware/svAuthorize.js` (ya existe: compara `req.user.rol.rol_nivel ?? 99` contra el máximo y responde 403 `'Nivel insuficiente (requerido: <= N)'`).
  - `NIVELES.SUPERVISOR` (= 3) de `src/sv/config/constants.js`.
  - Servicio existente: `buscarPorTelefono(tel)`, `obtener(id)`, `prospectosActivos(id)`, `historialCompleto(id)` (→ `null` si no existe), `crear(payload)`, `actualizar(id, payload)` (lanza errores con `code` `'DUPLICATE_PHONE'` + `persona` + `prospectos_activos`, `'NOT_FOUND'` o `'VALIDATION_ERROR'`).
- Produces: `personas.controller` exporta `{ exigirRelacion, buscar, getOne, prospectosActivos, historialCompleto, create, update }`. `exigirRelacion` deja `req.personaId` (number).

- [ ] **Step 1: Write the failing test**

Crear `tests/personas.routes.test.js`:

```js
/**
 * /api/sv/personas detrás del svAreaGuard real. Sin base de datos: el
 * servicio de personas se simula con jest.mock.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../src/sv/services/personas.service', () => ({
  buscarPorTelefono: jest.fn(),
  obtener:           jest.fn(),
  prospectosActivos: jest.fn(),
  historialCompleto: jest.fn(),
  crear:             jest.fn(),
  actualizar:        jest.fn(),
  alcancesDePersona: jest.fn()
}));

const personas = require('../src/sv/services/personas.service');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');

// Área 1, grupo 1. rol_nivel como en sv_org_roles (lo usa authorizeLevel).
const ASESOR     = { usr_id: 10, usr_area_id: 1, usr_grupo_id: 1, rol: { rol_codigo: 'ASESOR', rol_nivel: 4 } };
const SUPERVISOR = { usr_id: 20, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [], rol: { rol_codigo: 'SUPERVISOR', rol_nivel: 3 } };
const ADMIN_AREA = { usr_id: 30, usr_area_id: 1, areasExtra: [], rol: { rol_codigo: 'ADMIN_AREA', rol_nivel: 2 } };
const GERENTE    = { usr_id: 2,  usr_area_id: 1, rol: { rol_codigo: 'GERENTE_GENERAL', rol_nivel: 2 } };

// Prospectos de cada persona, como los devolvería alcancesDePersona.
// La persona 999 no existe: no tiene prospectos.
const ALCANCES = {
  1: [{ prosp_id: 100, prosp_asesor_id: 10, prosp_grupo_id: 1, prosp_area_id: 1 }], // del asesor 10, grupo 1
  2: [{ prosp_id: 200, prosp_asesor_id: 30, prosp_grupo_id: 2, prosp_area_id: 1 }], // otro grupo, misma área
  3: [{ prosp_id: 300, prosp_asesor_id: 40, prosp_grupo_id: 7, prosp_area_id: 3 }]  // otra área
};

const PERSONA = { persona_id: 1, persona_nombre: 'Ana' };
const SIN_RELACION = { success: false, error: 'FORBIDDEN', message: 'Sin prospectos de esta persona en tu alcance' };

function app(user) {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = user; next(); });
  a.use(svAreaGuard);
  a.use('/api/sv/personas', require('../src/sv/routes/personas.routes'));
  // eslint-disable-next-line no-unused-vars
  a.use((err, req, res, next) => res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }));
  return a;
}

beforeEach(() => {
  jest.clearAllMocks();
  personas.alcancesDePersona.mockImplementation(async (id) => ALCANCES[id] || []);
  personas.obtener.mockImplementation(async (id) => (id === 999 ? null : { ...PERSONA, persona_id: id }));
  personas.prospectosActivos.mockResolvedValue([]);
  personas.historialCompleto.mockImplementation(async (id) => (
    id === 999 ? null : { persona: { persona_id: id }, prospectos: [], gestiones: [] }
  ));
  personas.actualizar.mockImplementation(async (id, body) => ({ persona_id: id, ...body }));
  personas.buscarPorTelefono.mockResolvedValue(PERSONA);
  personas.crear.mockResolvedValue(PERSONA);
});

describe('GET /:id, GET /:id/prospectos-activos y PUT /:id exigen relación', () => {
  // [nombre, método, ruta, cuerpo, función del servicio que lee o escribe]
  const RUTAS = [
    ['GET /:id',                     'get', (id) => `/api/sv/personas/${id}`,                     undefined,                       'obtener'],
    ['GET /:id/prospectos-activos',  'get', (id) => `/api/sv/personas/${id}/prospectos-activos`,  undefined,                       'prospectosActivos'],
    ['PUT /:id',                     'put', (id) => `/api/sv/personas/${id}`,                     { persona_nombre: 'Ana María' }, 'actualizar']
  ];

  describe.each(RUTAS)('%s', (_, metodo, ruta, cuerpo, servicio) => {
    const llamar = (user, id) => {
      const r = request(app(user))[metodo](ruta(id));
      return cuerpo ? r.send(cuerpo) : r;
    };

    test('asesor con un prospecto propio de la persona → 200', async () => {
      const r = await llamar(ASESOR, 1);
      expect(r.status).toBe(200);
      expect(personas.alcancesDePersona).toHaveBeenCalledWith(1);
      expect(personas[servicio]).toHaveBeenCalledTimes(1);
      expect(personas[servicio].mock.calls[0][0]).toBe(1);
    });

    test('asesor sin prospectos propios de la persona → 403 y no lee ni escribe', async () => {
      const r = await llamar(ASESOR, 2);
      expect(r.status).toBe(403);
      expect(r.body).toEqual(SIN_RELACION);
      expect(personas[servicio]).not.toHaveBeenCalled();
    });

    test('supervisor con un prospecto de la persona en su grupo → 200', async () => {
      const r = await llamar(SUPERVISOR, 1);
      expect(r.status).toBe(200);
    });

    test('supervisor con prospectos de la persona solo en otro grupo → 403', async () => {
      const r = await llamar(SUPERVISOR, 2);
      expect(r.status).toBe(403);
      expect(r.body).toEqual(SIN_RELACION);
      expect(personas[servicio]).not.toHaveBeenCalled();
    });

    test('GERENTE_GENERAL → 200 sin consultar la relación', async () => {
      const r = await llamar(GERENTE, 3);
      expect(r.status).toBe(200);
      expect(personas.alcancesDePersona).not.toHaveBeenCalled();
    });

    test('persona inexistente sin cross-área → 403, no 404', async () => {
      const r = await llamar(SUPERVISOR, 999);
      expect(r.status).toBe(403);
      expect(r.body).toEqual(SIN_RELACION);
    });

    test('id no numérico → 404 sin consultar', async () => {
      const r = await llamar(SUPERVISOR, 'abc');
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ success: false, error: 'NOT_FOUND', message: 'Persona no encontrada' });
      expect(personas.alcancesDePersona).not.toHaveBeenCalled();
      expect(personas[servicio]).not.toHaveBeenCalled();
    });

    test('error al consultar la relación → 500 vía next(e)', async () => {
      personas.alcancesDePersona.mockRejectedValue(new Error('ECONNRESET'));
      const r = await llamar(ASESOR, 1);
      expect(r.status).toBe(500);
      expect(personas[servicio]).not.toHaveBeenCalled();
    });

    test('error del servicio de datos → 500 vía next(e)', async () => {
      personas[servicio].mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
      const r = await llamar(ASESOR, 1);
      expect(r.status).toBe(500);
    });
  });

  test('GET /:id: GERENTE_GENERAL y persona inexistente → 404', async () => {
    const r = await request(app(GERENTE)).get('/api/sv/personas/999');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: 'NOT_FOUND', message: 'Persona no encontrada' });
  });

  test('PUT /:id sin relación → 403 antes de validar el cuerpo', async () => {
    const r = await request(app(ASESOR)).put('/api/sv/personas/2').send({});
    expect(r.status).toBe(403);
    expect(r.body).toEqual(SIN_RELACION);
  });

  test('PUT /:id con teléfono duplicado → 409 con la persona y sus prospectos', async () => {
    const e = Object.assign(new Error('DUPLICATE_PHONE'), {
      code: 'DUPLICATE_PHONE', persona: { persona_id: 5 }, prospectos_activos: [{ prosp_id: 500 }]
    });
    personas.actualizar.mockRejectedValue(e);
    const r = await request(app(ASESOR)).put('/api/sv/personas/1').send({ persona_telefono_principal: '3001234567' });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      success: false, error: 'DUPLICATE_PHONE', message: 'Teléfono ya existe',
      errors: { persona: { persona_id: 5 }, prospectos_activos: [{ prosp_id: 500 }] }
    });
  });

  test('PUT /:id con persona borrada entre la verificación y la escritura → 404', async () => {
    personas.actualizar.mockRejectedValue(Object.assign(new Error('Persona no encontrada'), { code: 'NOT_FOUND' }));
    const r = await request(app(GERENTE)).put('/api/sv/personas/1').send({ persona_nombre: 'Ana María' });
    expect(r.status).toBe(404);
  });
});

describe('GET /:id/historial-completo: supervisión con relación', () => {
  const url = (id) => `/api/sv/personas/${id}/historial-completo`;
  const NIVEL = { success: false, error: 'FORBIDDEN', message: 'Nivel insuficiente (requerido: <= 3)' };

  test('asesor, aun con un prospecto propio → 403 sin consultar la base', async () => {
    const r = await request(app(ASESOR)).get(url(1));
    expect(r.status).toBe(403);
    expect(r.body).toEqual(NIVEL);
    expect(personas.alcancesDePersona).not.toHaveBeenCalled();
    expect(personas.historialCompleto).not.toHaveBeenCalled();
  });

  test('rol sin rol_nivel → 403 (falla cerrado)', async () => {
    const sinNivel = { ...SUPERVISOR, rol: { rol_codigo: 'SUPERVISOR' } };
    const r = await request(app(sinNivel)).get(url(1));
    expect(r.status).toBe(403);
    expect(r.body).toEqual(NIVEL);
  });

  test('supervisor con un prospecto de la persona en su grupo → 200 con la vista completa', async () => {
    const r = await request(app(SUPERVISOR)).get(url(1));
    expect(r.status).toBe(200);
    expect(personas.historialCompleto).toHaveBeenCalledWith(1);
    expect(r.body).toEqual({ success: true, data: { persona: { persona_id: 1 }, prospectos: [], gestiones: [] } });
  });

  test('supervisor con prospectos de la persona solo en otro grupo → 403', async () => {
    const r = await request(app(SUPERVISOR)).get(url(2));
    expect(r.status).toBe(403);
    expect(r.body).toEqual(SIN_RELACION);
    expect(personas.historialCompleto).not.toHaveBeenCalled();
  });

  test('ADMIN_AREA con un prospecto de la persona en su área → 200', async () => {
    const r = await request(app(ADMIN_AREA)).get(url(2));
    expect(r.status).toBe(200);
  });

  test('ADMIN_AREA con prospectos de la persona solo en otra área → 403', async () => {
    const r = await request(app(ADMIN_AREA)).get(url(3));
    expect(r.status).toBe(403);
    expect(r.body).toEqual(SIN_RELACION);
  });

  test('GERENTE_GENERAL → 200 sin consultar la relación', async () => {
    const r = await request(app(GERENTE)).get(url(3));
    expect(r.status).toBe(200);
    expect(personas.alcancesDePersona).not.toHaveBeenCalled();
  });

  test('GERENTE_GENERAL y persona inexistente → 404', async () => {
    const r = await request(app(GERENTE)).get(url(999));
    expect(r.status).toBe(404);
  });

  test('error del servicio → 500 vía next(e)', async () => {
    personas.historialCompleto.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(app(SUPERVISOR)).get(url(1));
    expect(r.status).toBe(500);
  });
});

describe('buscar y create: anti-duplicado del alta, sin exigir relación', () => {
  test('buscar devuelve persona y prospectos activos a un asesor sin relación', async () => {
    personas.prospectosActivos.mockResolvedValue([{ prosp_id: 200 }]);
    const r = await request(app(ASESOR)).get('/api/sv/personas/buscar').query({ telefono: '3001234567' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ persona: PERSONA, prospectos_activos: [{ prosp_id: 200 }] });
    expect(personas.prospectosActivos).toHaveBeenCalledWith(1);
    expect(personas.alcancesDePersona).not.toHaveBeenCalled();
  });

  test('buscar sin coincidencia → 404', async () => {
    personas.buscarPorTelefono.mockResolvedValue(null);
    const r = await request(app(ASESOR)).get('/api/sv/personas/buscar').query({ telefono: '3001234567' });
    expect(r.status).toBe(404);
  });

  test('buscar: error del servicio → 500 vía next(e)', async () => {
    personas.buscarPorTelefono.mockRejectedValue(new Error('ECONNRESET'));
    const r = await request(app(ASESOR)).get('/api/sv/personas/buscar').query({ telefono: '3001234567' });
    expect(r.status).toBe(500);
  });

  const NUEVA = { persona_nombre: 'Ana', persona_telefono_principal: '3001234567' };

  test('create → 201', async () => {
    const r = await request(app(ASESOR)).post('/api/sv/personas').send(NUEVA);
    expect(r.status).toBe(201);
  });

  test('create con teléfono duplicado → 409', async () => {
    personas.crear.mockRejectedValue(Object.assign(new Error('DUPLICATE_PHONE'), {
      code: 'DUPLICATE_PHONE', persona: PERSONA, prospectos_activos: []
    }));
    const r = await request(app(ASESOR)).post('/api/sv/personas').send(NUEVA);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('DUPLICATE_PHONE');
  });

  test('create: error inesperado → 500 vía next(e)', async () => {
    personas.crear.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));
    const r = await request(app(ASESOR)).post('/api/sv/personas').send(NUEVA);
    expect(r.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/personas.routes.test.js`
Expected: FAIL. Entre otros: el asesor sin relación recibe 200 en vez de 403, el asesor en historial recibe 200, y los casos de error terminan en timeout o en un rechazo sin manejar en vez de 500 (el controlador actual no llama `next(e)`). Si Jest reporta un `unhandledRejection` o un timeout, también es la falla esperada.

- [ ] **Step 3: Write the controller**

Reemplazar todo `src/sv/controllers/personas.controller.js` por:

```js
/**
 * sv/controllers/personas.controller.js
 * Leer o modificar una persona exige relación con ella: ser cross-área o
 * tener al menos un prospecto suyo en el alcance (utils/alcancePersona). El
 * historial cross-área además exige nivel ≤ 3 (authorizeLevel en la ruta).
 * buscar y create no exigen relación: son el anti-duplicado del alta.
 *
 * Los errores se reenvían con next(e): en Express 4 una promesa rechazada en
 * un handler async no llega al middleware de errores y server.js termina el
 * proceso ante un unhandledRejection.
 */
const personas = require('../services/personas.service');
const { ok, created, fail } = require('../utils/response');
const { ERROR_CODES } = require('../config/constants');
const { fueraDeAlcancePersona } = require('../utils/alcancePersona');

/**
 * Middleware de ruta para /:id. Valida el id, verifica la relación del usuario
 * con la persona y deja el id numérico en req.personaId. Para quien no es
 * cross-área, una persona inexistente responde 403 (no tiene prospectos) y no
 * 404: el código no revela qué ids existen.
 */
async function exigirRelacion(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
  }
  req.personaId = id;
  if (req.scope?.crossArea) return next();

  let prospectos;
  try {
    prospectos = await personas.alcancesDePersona(id);
  } catch (e) {
    return next(e);
  }
  const motivo = fueraDeAlcancePersona(req.user, req.scope, prospectos);
  if (motivo) return fail(res, 403, ERROR_CODES.FORBIDDEN, motivo);
  return next();
}

async function buscar(req, res, next) {
  try {
    const { telefono } = req.query;
    const persona = await personas.buscarPorTelefono(telefono);
    if (!persona) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
    // Cross-área: prospectos activos del cliente (campos recortados) para que
    // el frontend muestre el aviso antes de crear otro.
    const prospectos = await personas.prospectosActivos(persona.persona_id);
    return ok(res, { persona, prospectos_activos: prospectos });
  } catch (e) {
    return next(e);
  }
}

async function getOne(req, res, next) {
  try {
    const persona = await personas.obtener(req.personaId);
    if (!persona) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
    return ok(res, persona);
  } catch (e) {
    return next(e);
  }
}

async function prospectosActivos(req, res, next) {
  try {
    const p = await personas.prospectosActivos(req.personaId);
    return ok(res, p);
  } catch (e) {
    return next(e);
  }
}

async function historialCompleto(req, res, next) {
  try {
    const r = await personas.historialCompleto(req.personaId);
    if (!r) return fail(res, 404, ERROR_CODES.NOT_FOUND, 'Persona no encontrada');
    return ok(res, r);
  } catch (e) {
    return next(e);
  }
}

async function create(req, res, next) {
  try {
    const persona = await personas.crear(req.body);
    return created(res, persona);
  } catch (e) {
    if (e.code === 'DUPLICATE_PHONE') {
      return fail(res, 409, ERROR_CODES.DUPLICATE_PHONE, 'Teléfono ya existe', {
        persona: e.persona,
        prospectos_activos: e.prospectos_activos || []
      });
    }
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    return next(e);
  }
}

async function update(req, res, next) {
  try {
    const persona = await personas.actualizar(req.personaId, req.body);
    return ok(res, persona);
  } catch (e) {
    if (e.code === 'DUPLICATE_PHONE') {
      return fail(res, 409, ERROR_CODES.DUPLICATE_PHONE, 'Teléfono ya existe', {
        persona: e.persona,
        prospectos_activos: e.prospectos_activos || []
      });
    }
    if (e.code === 'NOT_FOUND')        return fail(res, 404, ERROR_CODES.NOT_FOUND, e.message);
    if (e.code === 'VALIDATION_ERROR') return fail(res, 422, ERROR_CODES.VALIDATION_ERROR, e.message);
    return next(e);
  }
}

module.exports = { exigirRelacion, buscar, getOne, prospectosActivos, historialCompleto, create, update };
```

- [ ] **Step 4: Write the routes**

Reemplazar todo `src/sv/routes/personas.routes.js` por:

```js
/**
 * sv/routes/personas.routes.js
 * Montado en /api/sv/personas detrás de svAuth + svAreaGuard (routes/index.js).
 * Las rutas con :id exigen relación con la persona (ctrl.exigirRelacion); el
 * historial cross-área además exige nivel ≤ 3, igual que la pantalla del
 * frontend. En PUT la relación se verifica antes de validar el cuerpo.
 */
const router = require('express').Router();
const ctrl = require('../controllers/personas.controller');
const v    = require('../validations/crm.validation');
const { validate } = require('../middleware/validate');
const { authorizeLevel } = require('../middleware/svAuthorize');
const { NIVELES } = require('../config/constants');

router.get ('/buscar',                 validate(v.personas.buscar, 'query'), ctrl.buscar);
router.get ('/:id',                    ctrl.exigirRelacion, ctrl.getOne);
router.get ('/:id/prospectos-activos', ctrl.exigirRelacion, ctrl.prospectosActivos);
router.get ('/:id/historial-completo', authorizeLevel(NIVELES.SUPERVISOR), ctrl.exigirRelacion, ctrl.historialCompleto);
router.post('/',                       validate(v.personas.create), ctrl.create);
router.put ('/:id',                    ctrl.exigirRelacion, validate(v.personas.update), ctrl.update);

module.exports = router;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/personas.routes.test.js tests/personas.service.test.js tests/alcancePersona.test.js`
Expected: PASS en las tres suites, sin advertencias de `unhandledRejection` ni de handles abiertos.

- [ ] **Step 6: Commit**

```bash
git add src/sv/controllers/personas.controller.js src/sv/routes/personas.routes.js tests/personas.routes.test.js
git commit -m "fix(sv): leer o modificar una persona exige relación y el historial cross-área es de supervisión"
```

(con la línea `Co-Authored-By` de las Global Constraints en el mensaje)

---

## Verificación final (la hace el controlador, no un subagente)

- [ ] Suite completa: `npx jest 2>&1 | tail -40`. Esperado: solo fallan las 5 suites conocidas (`test/grupoIndivII`, `tests/invitacion.service`, `src/masajes/__tests__/adapters` ×2, `tests/afiliadoEmpresaAccess`); las 3 suites nuevas pasan.
- [ ] `git log --oneline fix/permisos-gestiones..HEAD` muestra los commits de spec, plan y las 3 tareas; `git status` limpio.
- [ ] Revisión final de código sobre `git diff fix/permisos-gestiones..HEAD -- src tests`.
- [ ] Nota de entrega en la carpeta compartida de la sesión.
