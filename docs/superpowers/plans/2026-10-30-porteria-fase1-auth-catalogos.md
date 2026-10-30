# Portería — Fase 1 (autenticación AD + catálogos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un guarda o admin de portería inicie sesión con su usuario del Directorio Activo, elija la sede de su turno y consulte los catálogos que necesita para registrar (sedes, vehículos propios, conductores, asistencias, exequias y motivos).

**Architecture:** Se extrae de `autenticarLDAP` (H360) una `validarCredenciales` que no exige rol de H360, con errores que llevan `codigo`. Portería asigna su rol por CN exacto de grupo, firma un JWT propio (`scope: 'porteria'`) y protege sus rutas con middlewares de autenticación. Toda lectura de tablas de H360/Mantix pasa por `h360Lectura.service.js` (solo SELECT, pool propio). Los conductores salen del AD con caché de 10 minutos. Las rutas se agregan a `crearRouterPorteria` mediante sub-routers con dependencias inyectables.

**Tech Stack:** Node.js, Express 4, mysql2/promise, ldapjs 3, jsonwebtoken 9, express-rate-limit 7, Jest 29 + supertest, MySQL 8 (docker, puerto 3308).

**Diseño de referencia:** `docs/superpowers/specs/2026-10-29-porteria-design.md` (§4 autenticación, §3 lecturas de H360, §8 API).

## Global Constraints

- Código del módulo en `src/porteria/`. El único cambio fuera del módulo es `src/h360/services/ldap.service.js` (Task 1), y no cambia el comportamiento de H360: mismos mensajes, mismo rol, misma forma de respuesta.
- Portería nunca escribe en tablas de H360/Mantix: `h360Lectura.service.js` solo hace SELECT.
- Mensajes al usuario en español. Contrato de error: `{ success:false, error:'POR-XXX-NNN', motivo, message, errors? }`. Éxito: `{ success:true, data }`. Toda ruta empieza con `apiCodigo('POR-…')`.
- Roles: `admin_porteria` (grupo `LDAP_GROUP_PORTERIA_ADMIN` o `LDAP_GROUP_ADMIN`) y `guarda` (grupo `LDAP_GROUP_PORTERIA_GUARDA`). Pertenencia por CN exacto, sin distinguir mayúsculas. Sin ninguno → 403.
- JWT firmado con `PORTERIA_JWT_SECRET` (HS256), `scope: 'porteria'`, `sub` = usuario AD, expira en `PORTERIA_JWT_EXPIRES` (12h por defecto).
- La placa se compara normalizada: mayúsculas, sin espacios ni guiones, en JS y en SQL.
- Asistencias listables: estados `NUEVO` y `ASISTENCIA`. Exequias listables: estado distinto de `REALIZADA`/`CANCELADA` y `fecha` entre ayer y mañana (zona -05:00); primero las asignadas al vehículo de la placa consultada.
- Conductores: miembros de `LDAP_GROUP_ASIST_TANATOLOGO` y `LDAP_GROUP_ASISTENTE`, caché de 10 min. Si el AD falla, se devuelve la última lista buena o `[]`; nunca un error.
- Login: un limitador propio de 10 intentos **fallidos** por IP cada 15 minutos (el módulo está exento del limitador global).
- Las pruebas de integración solo tocan MySQL local con base `*_test`.
- Commits con trailer `Co-Authored-By:` del modelo que los escribe.

## Antes de empezar

1. Rama `feature/porteria` en `/Users/Shared/Files From c.localized/apps/mantix/mantix-git`, sin cambios pendientes (`git status`).
2. Contenedor de pruebas arriba: `npm run porteria:db:test`.
3. Línea base: `npx jest` → solo fallan `tests/afiliadoEmpresaAccess.test.js`, `test/grupoIndivII.test.js` y `tests/invitacion.service.test.js` (preexistentes).

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/h360/services/ldap.service.js` (mod.) | + `validarCredenciales`; `autenticarLDAP` la usa; `withTimeout` limpia su temporizador |
| `src/porteria/utils/placa.js` | `normalizarPlaca`, `placaSql` |
| `src/porteria/utils/texto.js` | `patronContiene` (LIKE escapado) |
| `src/porteria/utils/aw.js` | envoltorio de handlers async |
| `src/porteria/services/auth.service.js` | `ROLES`, `rolDesdeGrupos`, `firmarToken`, `verificarToken`, `usuarioPublico` |
| `src/porteria/middleware/autenticacion.js` | `crearAutenticacion`, `requiereRol`, `requiereSede` |
| `src/porteria/services/h360Lectura.service.js` | lecturas de sedes, vehículos, asistencias, exequias |
| `src/porteria/repositorios/motivos.js` | `listarActivos({ tipoVehiculo, sentido })` |
| `src/porteria/services/conductores.service.js` | lista del AD con caché |
| `src/porteria/routes/auth.routes.js` | `/auth/login`, `/auth/sede`, `/auth/me` |
| `src/porteria/routes/catalogos.routes.js` | `/catalogos/*` |
| `src/porteria/routes/index.js` (mod.) | monta sub-routers, dependencias de producción |
| `src/porteria/testing/bd.js` (mod.) | + `crearBdDePrueba()` |
| `src/porteria/testing/appPrueba.js` | app Express con dependencias falsas + `tokenDe()` |

Códigos de API nuevos: `POR-AUT-001` login, `POR-AUT-002` sede, `POR-AUT-003` me, `POR-CAT-001` sedes, `POR-CAT-002` vehículos propios, `POR-CAT-003` conductores, `POR-CAT-004` asistencias, `POR-CAT-005` exequias, `POR-CAT-006` motivos.

---

### Task 1: `validarCredenciales` en el servicio LDAP de H360

**Files:**
- Modify: `src/h360/services/ldap.service.js` (función `withTimeout`; bloque de `autenticarLDAP`; `module.exports`)
- Test: `src/h360/services/__tests__/ldap.validarCredenciales.test.js`

**Interfaces:**
- Produces: `validarCredenciales(usuarioRaw, password) → Promise<{ usuario, nombre, email, memberOf: string[] }>`. Rechaza con `Error` que lleva `codigo`: `'CREDENCIALES_INVALIDAS'` (vacíos, usuario inexistente, contraseña incorrecta) o `'AD_NO_DISPONIBLE'` (no conecta / falla la búsqueda). Los `message` son exactamente los que ya usaba `autenticarLDAP`.
- `autenticarLDAP` conserva firma, mensajes y resultado `{ usuario, nombre, email, rol, roles }`.

- [ ] **Step 1: Write the failing test**

```js
// src/h360/services/__tests__/ldap.validarCredenciales.test.js
// Primeras pruebas del servicio LDAP: ldapjs se reemplaza por clientes falsos (nada sale a la red).
const { EventEmitter } = require('events');

jest.mock('ldapjs', () => ({ createClient: jest.fn() }));
const ldap = require('ldapjs');
const { validarCredenciales, autenticarLDAP } = require('../ldap.service');

const GRUPOS_H360 = ['LDAP_GROUP_ADMIN', 'LDAP_GROUP_ASESOR', 'LDAP_GROUP_ASISTENTE', 'LDAP_GROUP_TANATOLOGO',
  'LDAP_GROUP_ASIST_TANATOLOGO', 'LDAP_GROUP_SUPERVISORA', 'LDAP_GROUP_COORDINADOR', 'LDAP_GROUP_CONTABILIDAD',
  'LDAP_GROUP_RECEPCION', 'LDAP_GROUP_TRAMITADOR'];

const ENTRADA = {
  dn: 'CN=Juan Pérez,OU=Usuarios,DC=olivos,DC=local',
  attributes: [
    { type: 'sAMAccountName', values: ['jperez'] },
    { type: 'displayName', values: ['Juan Pérez'] },
    { type: 'mail', values: ['jperez@olivos.local'] },
    { type: 'memberOf', values: ['CN=PorteriaGuardas,OU=Grupos,DC=olivos,DC=local'] },
  ],
};

function cliente({ bind = (dn, pw, cb) => cb(null), entradas = [] } = {}) {
  return {
    on: jest.fn(),
    destroy: jest.fn(),
    bind: jest.fn(bind),
    search: jest.fn((base, opciones, cb) => {
      const res = new EventEmitter();
      cb(null, res);
      process.nextTick(() => {
        entradas.forEach((e) => res.emit('searchEntry', e));
        res.emit('end');
      });
    }),
  };
}

/** Primer createClient = cuenta de servicio; segundo = re-bind del usuario. */
function directorio({ svc = cliente({ entradas: [ENTRADA] }), usuario = cliente() } = {}) {
  ldap.createClient.mockReset();
  ldap.createClient.mockReturnValueOnce(svc).mockReturnValueOnce(usuario);
  return { svc, usuario };
}

beforeAll(() => {
  Object.assign(process.env, {
    LDAP_URL: 'ldap://falso', LDAP_BASE_DN: 'DC=olivos,DC=local', LDAP_BIND_USER: 'svc', LDAP_BIND_PASS: 'x',
  });
});
beforeEach(() => {
  for (const g of GRUPOS_H360) delete process.env[g];
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('validarCredenciales', () => {
  test('credenciales válidas → datos y grupos, sin exigir rol de H360', async () => {
    const { usuario } = directorio();
    await expect(validarCredenciales('OLIVOS\\jperez', 'clave')).resolves.toEqual({
      usuario: 'jperez',
      nombre: 'Juan Pérez',
      email: 'jperez@olivos.local',
      memberOf: ['CN=PorteriaGuardas,OU=Grupos,DC=olivos,DC=local'],
    });
    expect(usuario.bind).toHaveBeenCalledWith('jperez@olivos.local', 'clave', expect.any(Function));
  });

  test('contraseña incorrecta → CREDENCIALES_INVALIDAS', async () => {
    directorio({ usuario: cliente({ bind: (dn, pw, cb) => cb(new Error('49 invalid credentials')) }) });
    await expect(validarCredenciales('jperez', 'mala')).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS', message: 'Usuario o contraseña incorrectos',
    });
  });

  test('usuario inexistente → CREDENCIALES_INVALIDAS', async () => {
    directorio({ svc: cliente({ entradas: [] }) });
    await expect(validarCredenciales('nadie', 'x')).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS', message: 'Usuario no encontrado en el directorio',
    });
  });

  test('contraseña vacía se rechaza sin consultar el directorio (evita el bind anónimo)', async () => {
    ldap.createClient.mockReset();
    await expect(validarCredenciales('jperez', '')).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    expect(ldap.createClient).not.toHaveBeenCalled();
  });

  test('directorio caído → AD_NO_DISPONIBLE', async () => {
    directorio({ svc: cliente({ bind: (dn, pw, cb) => cb(new Error('connect ECONNREFUSED')) }) });
    const err = await validarCredenciales('jperez', 'clave').catch((e) => e);
    expect(err.codigo).toBe('AD_NO_DISPONIBLE');
    expect(err.message).toMatch(/^No se pudo conectar al directorio activo/);
  });
});

describe('autenticarLDAP (H360) conserva su comportamiento', () => {
  test('sin grupo de H360 sigue rechazando con el mismo mensaje', async () => {
    directorio();
    await expect(autenticarLDAP('jperez', 'clave'))
      .rejects.toThrow('Tu usuario no tiene rol asignado en Homenajes360. Contacta a TI.');
  });

  test('con grupo de H360 devuelve rol y roles', async () => {
    process.env.LDAP_GROUP_ASISTENTE = 'PorteriaGuardas';
    directorio();
    await expect(autenticarLDAP('jperez', 'clave')).resolves.toEqual({
      usuario: 'jperez', nombre: 'Juan Pérez', email: 'jperez@olivos.local', rol: 'asistente', roles: ['asistente'],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/h360/services/__tests__/ldap.validarCredenciales.test.js`
Expected: FAIL — `validarCredenciales is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `src/h360/services/ldap.service.js`, reemplazar `withTimeout` (el temporizador quedaba vivo 8 s después de cada operación exitosa):

```js
// Promise que rechaza automáticamente después de N ms (y limpia su temporizador al terminar)
function withTimeout(promise, ms, msg) {
  let temporizador
  const limite = new Promise((_, rej) => {
    temporizador = setTimeout(() => rej(new Error(msg || `Timeout después de ${ms}ms`)), ms)
  })
  return Promise.race([promise, limite]).finally(() => clearTimeout(temporizador))
}
```

Reemplazar el bloque completo desde el comentario `/** Autentica un usuario contra el AD olivos.local.` hasta el cierre de `autenticarLDAP` por:

```js
/** Error del directorio con un código estable para quien llama; el mensaje es el de siempre. */
function errorDirectorio(message, codigo) {
  const err = new Error(message)
  err.codigo = codigo
  return err
}

// Aceptar "bortega", "bortega@olivos.local" o "OLIVOS\bortega"
function normalizarUsuario(usuarioRaw) {
  const usuario = String(usuarioRaw ?? '').trim()
  if (usuario.includes('@')) return usuario.split('@')[0]
  if (usuario.includes('\\')) return usuario.split('\\')[1]
  return usuario
}

/**
 * Verifica usuario y contraseña contra el AD olivos.local, sin exigir rol de ninguna aplicación.
 * Patrón: bind con cuenta de servicio → busca usuario → re-bind con sus credenciales.
 * Retorna { usuario, nombre, email, memberOf }. Los errores llevan `codigo`:
 * CREDENCIALES_INVALIDAS (vacías, usuario inexistente o contraseña incorrecta) o AD_NO_DISPONIBLE.
 */
async function validarCredenciales(usuarioRaw, password) {
  const usuario = normalizarUsuario(usuarioRaw)
  // Un bind con contraseña vacía es anónimo y el AD lo acepta: nunca puede valer como login.
  if (!usuario || !password) throw errorDirectorio('Usuario o contraseña incorrectos', 'CREDENCIALES_INVALIDAS')

  console.log(`[LDAP] Autenticando usuario: ${usuario}`)

  // --- Paso 1: bind como cuenta de servicio ---
  const svcClient = createClient()
  try {
    await bindAsync(svcClient, process.env.LDAP_BIND_USER, process.env.LDAP_BIND_PASS)
    console.log('[LDAP] Paso 1 OK — bind svc')
  } catch (err) {
    svcClient.destroy()
    throw errorDirectorio('No se pudo conectar al directorio activo: ' + err.message, 'AD_NO_DISPONIBLE')
  }

  // --- Paso 2: buscar usuario por sAMAccountName ---
  let entries
  try {
    const filter = `(&${USER_FILTER}(sAMAccountName=${escapeFilter(usuario)}))`
    entries = await searchAsync(svcClient, process.env.LDAP_BASE_DN, filter,
      ['dn', 'sAMAccountName', 'displayName', 'mail', 'memberOf'])
    console.log(`[LDAP] Paso 2 OK — ${entries.length} resultado(s)`)
  } catch (err) {
    throw errorDirectorio('Error al buscar usuario en el directorio: ' + err.message, 'AD_NO_DISPONIBLE')
  } finally {
    svcClient.destroy()
  }

  if (!entries.length) {
    throw errorDirectorio('Usuario no encontrado en el directorio', 'CREDENCIALES_INVALIDAS')
  }

  const { dn: userDN, sam, displayName, mail, memberOf } = extraerAtributos(entries[0])
  console.log(`[LDAP] Usuario: ${sam}, DN: ${userDN}`)

  // --- Paso 3: re-bind con credenciales del usuario (verifica contraseña) ---
  const upn        = sam ? `${sam}@olivos.local` : `${usuario}@olivos.local`
  const userClient = createClient()
  try {
    try {
      await bindAsync(userClient, upn, password)
      console.log(`[LDAP] Paso 3 OK — bind usuario con UPN: ${upn}`)
    } catch (e1) {
      console.log(`[LDAP] UPN bind falló (${e1.message}), intentando DN`)
      await bindAsync(userClient, userDN, password)
      console.log('[LDAP] Paso 3 OK — bind usuario con DN')
    }
  } catch {
    throw errorDirectorio('Usuario o contraseña incorrectos', 'CREDENCIALES_INVALIDAS')
  } finally {
    userClient.destroy()
  }

  return { usuario: sam || usuario, nombre: displayName || usuario, email: mail || '', memberOf }
}

/**
 * Autentica para H360: credenciales válidas + al menos un rol de H360.
 * Retorna { usuario, nombre, email, rol, roles }.
 */
async function autenticarLDAP(usuarioRaw, password) {
  const datos = await validarCredenciales(usuarioRaw, password)

  // --- Paso 4: determinar roles por membresía de grupos ---
  const roles = detectarRoles(datos.memberOf)
  console.log(`[LDAP] Paso 4 — roles: ${roles.join(', ') || 'ninguno'}, grupos: ${datos.memberOf.length}`)

  if (!roles.length) {
    throw new Error('Tu usuario no tiene rol asignado en Homenajes360. Contacta a TI.')
  }

  return {
    usuario: datos.usuario,
    nombre:  datos.nombre,
    email:   datos.email,
    // `rol` es el activo; `roles` son todos los que puede usar. Si hay más de
    // uno, la pantalla de ingreso le pregunta con cuál entra.
    rol:   roles[0],
    roles,
  }
}
```

Y el export:

```js
module.exports = { autenticarLDAP, validarCredenciales, listarMiembrosGrupo, buscarUsuarioPorSam, detectarRoles }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/h360/services/__tests__/ldap.validarCredenciales.test.js`
Expected: PASS (7 pruebas), sin advertencias de handles abiertos.

- [ ] **Step 5: Commit**

```bash
git add src/h360/services/ldap.service.js src/h360/services/__tests__/ldap.validarCredenciales.test.js
git commit -m "feat(h360): validarCredenciales sin exigir rol de H360 (la usa Portería)"
```

---

### Task 2: Placa, búsqueda y servicio de autenticación de Portería

**Files:**
- Create: `src/porteria/utils/placa.js`
- Create: `src/porteria/utils/texto.js`
- Create: `src/porteria/services/auth.service.js`
- Test: `src/porteria/__tests__/placa.test.js`
- Test: `src/porteria/__tests__/auth.service.test.js`

**Interfaces:**
- Consumes: `PorteriaError(statusCode, motivo, message, errors?)` (`src/porteria/utils/PorteriaError.js`).
- Produces:
  - `normalizarPlaca(placa) → string`; `placaSql(columna) → string` (expresión SQL equivalente).
  - `patronContiene(texto) → string` (`%texto%` con `\`, `%`, `_` escapados).
  - `ROLES = { ADMIN: 'admin_porteria', GUARDA: 'guarda' }`
  - `rolDesdeGrupos(memberOf: string[], grupos: { guarda, admin, adminGeneral }) → 'admin_porteria' | 'guarda' | null`
  - `firmarToken({ usuario, nombre, rol, sede: {id, nombre} | null }, { jwtSecret, jwtExpires }) → string`
  - `verificarToken(token, jwtSecret) → { usuario, nombre, rol, sede_id, sede_nombre }` o lanza `PorteriaError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida')`
  - `usuarioPublico({ usuario, nombre, rol, sede_id, sede_nombre }) → { usuario, nombre, rol, sede: {id, nombre} | null }`

- [ ] **Step 1: Write the failing tests**

```js
// src/porteria/__tests__/placa.test.js
const { normalizarPlaca, placaSql } = require('../utils/placa');
const { patronContiene } = require('../utils/texto');

test.each([
  ['abc-123', 'ABC123'],
  [' abc 12d ', 'ABC12D'],
  ['ABC123', 'ABC123'],
  [null, ''],
  [undefined, ''],
])('normalizarPlaca(%p) → %p', (entrada, esperado) => {
  expect(normalizarPlaca(entrada)).toBe(esperado);
});

test('placaSql aplica la misma normalización a una columna', () => {
  expect(placaSql('v.placa')).toBe("UPPER(REPLACE(REPLACE(v.placa, ' ', ''), '-', ''))");
});

test('patronContiene escapa los comodines de LIKE', () => {
  expect(patronContiene('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  expect(patronContiene('maría')).toBe('%maría%');
});
```

```js
// src/porteria/__tests__/auth.service.test.js
const jwt = require('jsonwebtoken');
const {
  ROLES, rolDesdeGrupos, firmarToken, verificarToken, usuarioPublico,
} = require('../services/auth.service');

const GRUPOS = { guarda: 'PorteriaGuardas', admin: 'PorteriaAdmins', adminGeneral: 'Admins' };
const dn = (cn) => `CN=${cn},OU=Grupos,DC=olivos,DC=local`;
const CONFIG = { jwtSecret: 'secreto-de-prueba-porteria-0123456789abcdef', jwtExpires: '12h' };
/** El error que lanza fn (o undefined si no lanza). */
const errorDe = (fn) => { try { fn(); return undefined; } catch (e) { return e; } };

describe('rolDesdeGrupos', () => {
  test.each([
    [[dn('PorteriaGuardas')], 'guarda'],
    [[dn('PorteriaAdmins')], 'admin_porteria'],
    [[dn('Admins')], 'admin_porteria'],
    [[dn('PorteriaGuardas'), dn('PorteriaAdmins')], 'admin_porteria'],
    [['cn=porteriaguardas,OU=Grupos,DC=olivos,DC=local'], 'guarda'],
    [[dn('PorteriaGuardasViejos')], null],
    [[dn('OtroGrupo')], null],
    [[], null],
  ])('%p → %p', (memberOf, esperado) => {
    expect(rolDesdeGrupos(memberOf, GRUPOS)).toBe(esperado);
  });

  test('sin LDAP_GROUP_ADMIN configurado no hay admin general', () => {
    expect(rolDesdeGrupos([dn('Admins')], { ...GRUPOS, adminGeneral: null })).toBeNull();
  });
});

describe('tokens', () => {
  test('ida y vuelta con sede', () => {
    const token = firmarToken({ usuario: 'jperez', nombre: 'Juan', rol: ROLES.GUARDA, sede: { id: 3, nombre: 'Norte' } }, CONFIG);
    expect(verificarToken(token, CONFIG.jwtSecret)).toEqual({
      usuario: 'jperez', nombre: 'Juan', rol: 'guarda', sede_id: 3, sede_nombre: 'Norte',
    });
  });

  test('ida y vuelta sin sede', () => {
    const token = firmarToken({ usuario: 'ana', nombre: 'Ana', rol: ROLES.ADMIN, sede: null }, CONFIG);
    expect(verificarToken(token, CONFIG.jwtSecret)).toEqual({
      usuario: 'ana', nombre: 'Ana', rol: 'admin_porteria', sede_id: null, sede_nombre: null,
    });
  });

  test('otro secreto → 401 NO_AUTENTICADO', () => {
    const token = firmarToken({ usuario: 'ana', nombre: 'Ana', rol: ROLES.ADMIN, sede: null }, CONFIG);
    expect(errorDe(() => verificarToken(token, 'otro-secreto'))).toMatchObject({
      statusCode: 401, motivo: 'NO_AUTENTICADO', message: 'Sesión inválida o vencida',
    });
  });

  test('token sin scope de portería (p. ej. de otro módulo con el mismo secreto) → 401', () => {
    const token = jwt.sign({ rol: 'guarda' }, CONFIG.jwtSecret, { subject: 'x' });
    expect(errorDe(() => verificarToken(token, CONFIG.jwtSecret))).toMatchObject({ statusCode: 401 });
  });

  test('rol desconocido → 401', () => {
    const token = jwt.sign({ scope: 'porteria', rol: 'superusuario' }, CONFIG.jwtSecret, { subject: 'x' });
    expect(errorDe(() => verificarToken(token, CONFIG.jwtSecret))).toMatchObject({ statusCode: 401 });
  });

  test('token vencido → 401', () => {
    const token = jwt.sign(
      { scope: 'porteria', rol: 'guarda', exp: Math.floor(Date.now() / 1000) - 10 }, CONFIG.jwtSecret, { subject: 'x' },
    );
    expect(errorDe(() => verificarToken(token, CONFIG.jwtSecret))).toMatchObject({ statusCode: 401 });
  });
});

test('usuarioPublico arma la sede solo si hay una', () => {
  expect(usuarioPublico({ usuario: 'a', nombre: 'A', rol: 'guarda', sede_id: 2, sede_nombre: 'Sur' }))
    .toEqual({ usuario: 'a', nombre: 'A', rol: 'guarda', sede: { id: 2, nombre: 'Sur' } });
  expect(usuarioPublico({ usuario: 'a', nombre: 'A', rol: 'guarda', sede_id: null, sede_nombre: null }))
    .toEqual({ usuario: 'a', nombre: 'A', rol: 'guarda', sede: null });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/porteria/__tests__/placa.test.js src/porteria/__tests__/auth.service.test.js`
Expected: FAIL — `Cannot find module '../utils/placa'` y `Cannot find module '../services/auth.service'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/porteria/utils/placa.js
/** Placa comparable: mayúsculas, sin espacios ni guiones ("abc-123 " → "ABC123"). */
function normalizarPlaca(placa) {
  return String(placa ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/** La misma normalización en SQL, para columnas que Portería no controla (p. ej. vehiculos.placa de H360). */
const placaSql = (columna) => `UPPER(REPLACE(REPLACE(${columna}, ' ', ''), '-', ''))`;

module.exports = { normalizarPlaca, placaSql };
```

```js
// src/porteria/utils/texto.js
/** Patrón LIKE de "contiene" con los comodines del usuario escapados. */
function patronContiene(texto) {
  return `%${String(texto).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

module.exports = { patronContiene };
```

```js
// src/porteria/services/auth.service.js
// Roles de Portería por grupo del AD y JWT propio del módulo (scope 'porteria').
const jwt = require('jsonwebtoken');
const PorteriaError = require('../utils/PorteriaError');

const ROLES = Object.freeze({ ADMIN: 'admin_porteria', GUARDA: 'guarda' });
const SCOPE = 'porteria';

// memberOf trae DNs ("CN=PorteriaGuardas,OU=Grupos,DC=olivos,DC=local"). Se compara el CN exacto:
// con "contiene", un grupo "Porteria" coincidiría también con "PorteriaAdmins".
const esDelGrupo = (dn, grupo) => String(dn).toLowerCase().startsWith(`cn=${String(grupo).toLowerCase()},`);

/** El rol de más alcance que le dan sus grupos, o null si no tiene acceso a Portería. */
function rolDesdeGrupos(memberOf, grupos) {
  const pertenece = (grupo) => Boolean(grupo) && memberOf.some((dn) => esDelGrupo(dn, grupo));
  if (pertenece(grupos.admin) || pertenece(grupos.adminGeneral)) return ROLES.ADMIN;
  if (pertenece(grupos.guarda)) return ROLES.GUARDA;
  return null;
}

function firmarToken({ usuario, nombre, rol, sede }, { jwtSecret, jwtExpires }) {
  return jwt.sign(
    { scope: SCOPE, nombre, rol, sede_id: sede ? sede.id : null, sede_nombre: sede ? sede.nombre : null },
    jwtSecret,
    { subject: usuario, expiresIn: jwtExpires, algorithm: 'HS256' },
  );
}

const sesionInvalida = () => new PorteriaError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida');

function verificarToken(token, jwtSecret) {
  let p;
  try {
    p = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw sesionInvalida();
  }
  if (p.scope !== SCOPE || !p.sub || !Object.values(ROLES).includes(p.rol)) throw sesionInvalida();
  return { usuario: p.sub, nombre: p.nombre, rol: p.rol, sede_id: p.sede_id ?? null, sede_nombre: p.sede_nombre ?? null };
}

/** Lo que el front recibe del usuario en sesión. */
function usuarioPublico({ usuario, nombre, rol, sede_id, sede_nombre }) {
  return { usuario, nombre, rol, sede: sede_id ? { id: sede_id, nombre: sede_nombre } : null };
}

module.exports = { ROLES, rolDesdeGrupos, firmarToken, verificarToken, usuarioPublico };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/porteria/__tests__/placa.test.js src/porteria/__tests__/auth.service.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/utils/placa.js src/porteria/utils/texto.js src/porteria/services/auth.service.js src/porteria/__tests__/placa.test.js src/porteria/__tests__/auth.service.test.js
git commit -m "feat(porteria): roles por grupo del AD, JWT del módulo y normalización de placa"
```

---

### Task 3: Middlewares de autenticación y handler async

**Files:**
- Create: `src/porteria/middleware/autenticacion.js`
- Create: `src/porteria/utils/aw.js`
- Test: `src/porteria/__tests__/autenticacion.test.js`

**Interfaces:**
- Consumes: `verificarToken`, `firmarToken`, `ROLES` (Task 2); `apiCodigo`, `porteriaErrorHandler`, `PorteriaError` (Fase 0).
- Produces:
  - `crearAutenticacion(obtenerConfig: () => { jwtSecret }) → middleware` que fija `req.porUsuario = { usuario, nombre, rol, sede_id, sede_nombre }` o pasa `PorteriaError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida')`.
  - `requiereRol(...roles) → middleware`: 403 `SIN_PERMISO`, `'No tienes permiso para esta acción'`.
  - `requiereSede` (middleware): 403 `SEDE_REQUERIDA`, `'Elige la sede de tu turno para continuar'`.
  - `aw(fn) → middleware` que pasa a `next` cualquier rechazo de `fn`.

- [ ] **Step 1: Write the failing test**

```js
// src/porteria/__tests__/autenticacion.test.js
const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const apiCodigo = require('../middleware/apiCodigo');
const { porteriaErrorHandler } = require('../middleware/errorHandler');
const { crearAutenticacion, requiereRol, requiereSede } = require('../middleware/autenticacion');
const { firmarToken, ROLES } = require('../services/auth.service');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');

afterEach(cerrarServidores);

const CONFIG = { jwtSecret: 'secreto-de-prueba-porteria-0123456789abcdef', jwtExpires: '12h' };
const token = (extra = {}) => firmarToken({ usuario: 'jperez', nombre: 'Juan', rol: ROLES.GUARDA, sede: null, ...extra }, CONFIG);

function app() {
  const a = express();
  const autenticar = crearAutenticacion(() => CONFIG);
  const eco = (req, res) => res.json({ success: true, data: req.porUsuario });
  a.get('/abierta', apiCodigo('POR-TST-001'), autenticar, eco);
  a.get('/admin', apiCodigo('POR-TST-002'), autenticar, requiereRol(ROLES.ADMIN), eco);
  a.get('/con-sede', apiCodigo('POR-TST-003'), autenticar, requiereSede, eco);
  a.get('/async', apiCodigo('POR-TST-004'), aw(async () => { throw new PorteriaError(409, 'CONFLICTO', 'Choque'); }));
  a.use(porteriaErrorHandler);
  return a;
}

test('sin token → 401 NO_AUTENTICADO', async () => {
  const r = await request(await servir(app())).get('/abierta');
  expect(r.status).toBe(401);
  expect(r.body).toEqual({ success: false, error: 'POR-TST-001', motivo: 'NO_AUTENTICADO', message: 'Sesión inválida o vencida' });
});

test('token de otro secreto → 401', async () => {
  const ajeno = firmarToken({ usuario: 'x', nombre: 'X', rol: ROLES.GUARDA, sede: null }, { ...CONFIG, jwtSecret: 'otro' });
  const r = await request(await servir(app())).get('/abierta').set('Authorization', `Bearer ${ajeno}`);
  expect(r.status).toBe(401);
});

test('token válido deja el usuario en req.porUsuario', async () => {
  const r = await request(await servir(app())).get('/abierta').set('Authorization', `Bearer ${token()}`);
  expect(r.status).toBe(200);
  expect(r.body.data).toEqual({ usuario: 'jperez', nombre: 'Juan', rol: 'guarda', sede_id: null, sede_nombre: null });
});

test('requiereRol: un guarda no entra a una ruta de admin', async () => {
  const r = await request(await servir(app())).get('/admin').set('Authorization', `Bearer ${token()}`);
  expect(r.status).toBe(403);
  expect(r.body).toMatchObject({ motivo: 'SIN_PERMISO', message: 'No tienes permiso para esta acción' });
  const ok = await request(await servir(app())).get('/admin').set('Authorization', `Bearer ${token({ rol: ROLES.ADMIN })}`);
  expect(ok.status).toBe(200);
});

test('requiereSede exige haber elegido sede', async () => {
  const sin = await request(await servir(app())).get('/con-sede').set('Authorization', `Bearer ${token()}`);
  expect(sin.status).toBe(403);
  expect(sin.body).toMatchObject({ motivo: 'SEDE_REQUERIDA', message: 'Elige la sede de tu turno para continuar' });
  const con = await request(await servir(app()))
    .get('/con-sede').set('Authorization', `Bearer ${token({ sede: { id: 4, nombre: 'Sur' } })}`);
  expect(con.status).toBe(200);
  expect(con.body.data.sede_id).toBe(4);
});

test('aw lleva los errores async al manejador del módulo', async () => {
  const r = await request(await servir(app())).get('/async');
  expect(r.status).toBe(409);
  expect(r.body).toEqual({ success: false, error: 'POR-TST-004', motivo: 'CONFLICTO', message: 'Choque' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/porteria/__tests__/autenticacion.test.js`
Expected: FAIL — `Cannot find module '../middleware/autenticacion'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/porteria/utils/aw.js
/** Envuelve un handler async: cualquier rechazo va a next (Express 4 no lo hace solo). */
const aw = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);

module.exports = aw;
```

```js
// src/porteria/middleware/autenticacion.js
const PorteriaError = require('../utils/PorteriaError');
const { verificarToken } = require('../services/auth.service');

/** `obtenerConfig()` se llama en cada request: el secreto es el del entorno vigente. */
function crearAutenticacion(obtenerConfig) {
  return (req, res, next) => {
    const encontrado = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    if (!encontrado) return next(new PorteriaError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida'));
    try {
      req.porUsuario = verificarToken(encontrado[1], obtenerConfig().jwtSecret);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requiereRol(...roles) {
  return (req, res, next) => (roles.includes(req.porUsuario && req.porUsuario.rol)
    ? next()
    : next(new PorteriaError(403, 'SIN_PERMISO', 'No tienes permiso para esta acción')));
}

/** Las rutas que registran o consultan la operación de una sede exigen haberla elegido. */
function requiereSede(req, res, next) {
  return req.porUsuario && req.porUsuario.sede_id
    ? next()
    : next(new PorteriaError(403, 'SEDE_REQUERIDA', 'Elige la sede de tu turno para continuar'));
}

module.exports = { crearAutenticacion, requiereRol, requiereSede };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/porteria/__tests__/autenticacion.test.js`
Expected: PASS (6 pruebas).

- [ ] **Step 5: Commit**

```bash
git add src/porteria/middleware/autenticacion.js src/porteria/utils/aw.js src/porteria/__tests__/autenticacion.test.js
git commit -m "feat(porteria): middlewares de sesión, rol y sede"
```

---

### Task 4: Lecturas de H360/Mantix y repositorio de motivos

**Files:**
- Create: `src/porteria/services/h360Lectura.service.js`
- Create: `src/porteria/repositorios/motivos.js`
- Modify: `src/porteria/testing/bd.js` (agregar `crearBdDePrueba` y exportarla)
- Test: `src/porteria/__tests__/h360Lectura.int.test.js`
- Test: `src/porteria/__tests__/motivos.int.test.js`

**Interfaces:**
- Consumes: `normalizarPlaca`, `placaSql` (Task 2), `patronContiene` (Task 2), `crearBdPerezosa` (Fase 0), `validarBdPrueba(env)` y `abrirConexion()` (`testing/bd.js`).
- Produces:
  - `crearH360Lectura(bd: { obtener() }) →`
    - `listarSedes() → [{ id, codigo, nombre, ciudad }]` (activas, por nombre)
    - `obtenerSede(id) → { id, codigo, nombre, ciudad } | null` (solo activa)
    - `buscarVehiculosPropios(q?) → [{ id, placa, marca, modelo, tipo }]` (activos, placa normalizada, máx. 30)
    - `obtenerVehiculoPropioPorPlaca(placa) → {…} | null`
    - `buscarAsistencias(q?) → [{ id, codigo, nombre_ser_querido, contrato, estado, created_at }]` (NUEVO/ASISTENCIA, recientes primero, máx. 30)
    - `obtenerAsistenciaVigente(id) → {…} | null`
    - `buscarExequias({ q?, placa? }) → [{ id, tipo, fecha:'YYYY-MM-DD', hora:'HH:MM'|null, lugar, estado, asistencia_codigo, nombre_ser_querido, vehiculo_placa, es_de_la_placa: boolean }]`
    - `obtenerExequiaVigente(id) → {…} | null` (no terminal, sin ventana de fechas; lo usa la Fase 2)
  - `crearRepositorioMotivos(bd) → { listarActivos({ tipoVehiculo?, sentido? }) → [{ id, codigo, nombre, descripcion, tipo_referencia, referencia_obligatoria: boolean }] }`; `TIPOS_VEHICULO`, `SENTIDOS` (arrays de valores válidos).
  - `crearBdDePrueba() → bd` (pool perezoso contra la base de pruebas, con la misma guarda que `abrirConexion`).

- [ ] **Step 1: Add the test helper**

En `src/porteria/testing/bd.js` agregar (después de `abrirConexion`) y exportar junto a lo existente:

```js
const { crearBdPerezosa } = require('../db');

/** Pool perezoso del módulo contra la base de pruebas (cerrar con bd.cerrar()). */
function crearBdDePrueba() {
  validarBdPrueba(process.env);
  return crearBdPerezosa(() => ({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  }));
}
```

(Pon el `require` arriba con los demás y agrega `crearBdDePrueba` al `module.exports`.)

- [ ] **Step 2: Write the failing integration tests**

```js
// src/porteria/__tests__/h360Lectura.int.test.js
// Datos propios con ids 1101-1199 (otras pruebas usan otros rangos sobre la misma base).
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');

let conn;
let bd;
let h360;
const propios = (filas) => filas.filter((f) => f.id >= 1100 && f.id < 1200);

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  h360 = crearH360Lectura(bd);
  for (const tabla of ['exequias', 'asistencias', 'vehiculos', 'sedes']) {
    await conn.query(`DELETE FROM ${tabla} WHERE id BETWEEN 1100 AND 1199`);
  }
  await conn.query(`INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES
    (1101, 'S1101', 'Sede Norte', 'Cúcuta', 1), (1102, 'S1102', 'Sede Cerrada', 'Cúcuta', 0)`);
  await conn.query(`INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES
    (1101, 'abc-110', 'Ford', 'F1', 'CARROZA', 1),
    (1102, 'XYZ 110', 'Kia', 'K2', 'CARROZA', 1),
    (1103, 'OFF110', 'Kia', 'K3', 'CARROZA', 0)`);
  await conn.query(`INSERT INTO asistencias (id, codigo, nombre_ser_querido, contrato, estado, created_at) VALUES
    (1101, 'H360-2026-1101', 'María Gómez', 'C-77', 'NUEVO', '2026-10-30 08:00:00'),
    (1102, 'H360-2026-1102', 'Pedro Ruiz', 'C-78', 'ASISTENCIA', '2026-10-30 09:00:00'),
    (1103, 'H360-2026-1103', 'Ana Cerrada', 'C-79', 'CERRADO', '2026-10-30 10:00:00')`);
  await conn.query(`INSERT INTO exequias (id, asistencia_id, tipo, fecha, hora, lugar, vehiculo_id, estado) VALUES
    (1101, 1101, 'Misa', CURDATE(), '10:00:00', 'Parroquia A', 1102, 'PROGRAMADA'),
    (1102, 1102, 'Cremación', CURDATE() + INTERVAL 1 DAY, '08:00:00', 'Crematorio', 1101, 'PENDIENTE_VEHICULO'),
    (1103, 1101, 'Misa', CURDATE() - INTERVAL 1 DAY, '15:00:00', 'Parroquia B', NULL, 'PENDIENTE_CONFIRMAR'),
    (1104, 1102, 'Misa', CURDATE(), '11:00:00', 'Parroquia C', 1101, 'REALIZADA'),
    (1105, 1102, 'Misa', CURDATE() + INTERVAL 2 DAY, '09:00:00', 'Parroquia D', 1101, 'PROGRAMADA')`);
});

afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('sedes: solo activas', async () => {
  const ids = (await h360.listarSedes()).map((s) => s.id);
  expect(ids).toContain(1101);
  expect(ids).not.toContain(1102);
  expect(await h360.obtenerSede(1101)).toEqual({ id: 1101, codigo: 'S1101', nombre: 'Sede Norte', ciudad: 'Cúcuta' });
  expect(await h360.obtenerSede(1102)).toBeNull();
});

test('vehículos propios: búsqueda por placa normalizada, solo activos', async () => {
  expect(propios(await h360.buscarVehiculosPropios('abc 11'))).toEqual([
    { id: 1101, placa: 'ABC110', marca: 'Ford', modelo: 'F1', tipo: 'CARROZA' },
  ]);
  expect(propios(await h360.buscarVehiculosPropios('off'))).toEqual([]);
  expect(await h360.obtenerVehiculoPropioPorPlaca('xyz-110')).toEqual(
    { id: 1102, placa: 'XYZ110', marca: 'Kia', modelo: 'K2', tipo: 'CARROZA' },
  );
  expect(await h360.obtenerVehiculoPropioPorPlaca('OFF110')).toBeNull();
});

test('asistencias: solo NUEVO y ASISTENCIA, recientes primero', async () => {
  expect(propios(await h360.buscarAsistencias('C-7')).map((a) => a.id)).toEqual([1102, 1101]);
  expect(propios(await h360.buscarAsistencias('maria')).map((a) => a.id)).toEqual([1101]);
  expect(propios(await h360.buscarAsistencias()).map((a) => a.id)).toEqual([1102, 1101]);
  expect(await h360.obtenerAsistenciaVigente(1103)).toBeNull();
  expect(await h360.obtenerAsistenciaVigente(1101)).toMatchObject({ codigo: 'H360-2026-1101', estado: 'NUEVO' });
});

test('exequias: no terminales entre ayer y mañana, primero las de la placa', async () => {
  const conPlaca = propios(await h360.buscarExequias({ placa: 'abc 110' }));
  expect(conPlaca.map((e) => e.id)).toEqual([1102, 1103, 1101]);
  expect(conPlaca[0]).toMatchObject({
    tipo: 'Cremación', hora: '08:00', estado: 'PENDIENTE_VEHICULO', asistencia_codigo: 'H360-2026-1102',
    nombre_ser_querido: 'Pedro Ruiz', vehiculo_placa: 'ABC110', es_de_la_placa: true,
  });
  expect(conPlaca[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(conPlaca[1].es_de_la_placa).toBe(false);

  expect(propios(await h360.buscarExequias({})).map((e) => e.id)).toEqual([1103, 1101, 1102]);
  expect(propios(await h360.buscarExequias({ q: 'pedro' })).map((e) => e.id)).toEqual([1102]);
});

test('exequia vigente: sin ventana de fechas, excluye terminales', async () => {
  expect(await h360.obtenerExequiaVigente(1105)).toMatchObject({ id: 1105, estado: 'PROGRAMADA' });
  expect(await h360.obtenerExequiaVigente(1104)).toBeNull();
});
```

```js
// src/porteria/__tests__/motivos.int.test.js
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearRepositorioMotivos } = require('../repositorios/motivos');

let conn;
let bd;
let motivos;
const codigos = (lista) => lista.map((m) => m.codigo);

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  motivos = crearRepositorioMotivos(bd);
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('filtra por tipo de vehículo y sentido, en orden', async () => {
  expect(codigos(await motivos.listarActivos({ tipoVehiculo: 'PROPIO', sentido: 'INGRESO' }))).toEqual([
    'SERES_QUERIDOS', 'EXEQUIAS', 'TRASLADOS', 'RECOGIDA_COFRES', 'EQUIPOS_VELACION', 'TANQUEO', 'LAVADO', 'MANTENIMIENTO',
  ]);
  expect(codigos(await motivos.listarActivos({ tipoVehiculo: 'PROVEEDOR' })))
    .toEqual(['ENTREGA_MERCANCIA', 'MANTENIMIENTO_SERVICIO', 'OTRO']);
  expect(codigos(await motivos.listarActivos({ tipoVehiculo: 'PROVEEDOR_ASISTENCIA', sentido: 'SALIDA' })))
    .toEqual(['SERES_QUERIDOS_TERCERIZADA', 'OTRO']);
});

test('devuelve la referencia que exige cada motivo', async () => {
  const [otro] = (await motivos.listarActivos({ tipoVehiculo: 'PROVEEDOR' })).filter((m) => m.codigo === 'OTRO');
  expect(otro).toMatchObject({ nombre: 'Otro', tipo_referencia: 'TEXTO', referencia_obligatoria: true });
  expect(Object.keys(otro).sort()).toEqual(['codigo', 'descripcion', 'id', 'nombre', 'referencia_obligatoria', 'tipo_referencia']);
});

test('omite los inactivos', async () => {
  await conn.query("UPDATE por_motivos SET activo = 0 WHERE codigo = 'LAVADO'");
  try {
    expect(codigos(await motivos.listarActivos({ tipoVehiculo: 'PROPIO' }))).not.toContain('LAVADO');
  } finally {
    await conn.query("UPDATE por_motivos SET activo = 1 WHERE codigo = 'LAVADO'");
  }
});

test('un tipo o sentido desconocido es un error de programación', async () => {
  await expect(motivos.listarActivos({ tipoVehiculo: 'CAMION' })).rejects.toThrow('Tipo de vehículo inválido');
  await expect(motivos.listarActivos({ sentido: 'ARRIBA' })).rejects.toThrow('Sentido inválido');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run porteria:db:test && npm run test:porteria:int`
Expected: FAIL — `Cannot find module '../services/h360Lectura.service'` y `'../repositorios/motivos'`.

- [ ] **Step 4: Write minimal implementation**

```js
// src/porteria/services/h360Lectura.service.js
// Lecturas (solo SELECT) de las tablas de H360 (vehiculos, asistencias, exequias) y de Mantix (sedes).
// Es el único archivo del módulo que conoce esas tablas: si algún día Portería se separa, solo cambia este.
const { normalizarPlaca, placaSql } = require('../utils/placa');
const { patronContiene } = require('../utils/texto');

const LIMITE = 30;
const ESTADOS_ASISTENCIA = ['NUEVO', 'ASISTENCIA'];
const ESTADOS_EXEQUIA_TERMINALES = ['REALIZADA', 'CANCELADA'];

const COLUMNAS_SEDE = 'id, codigo, nombre, ciudad';
const COLUMNAS_VEHICULO = 'id, placa, marca, modelo, tipo';
const COLUMNAS_ASISTENCIA = 'id, codigo, nombre_ser_querido, contrato, estado, created_at';
// fecha y hora como texto: un DATE convertido a Date de JS cambia de día según la zona del proceso.
const SELECT_EXEQUIA = `
  SELECT e.id, e.tipo, DATE_FORMAT(e.fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(e.hora, '%H:%i') AS hora,
         e.lugar, e.estado, a.codigo AS asistencia_codigo, a.nombre_ser_querido, v.placa AS vehiculo_placa`;
const FROM_EXEQUIA = `
    FROM exequias e
    JOIN asistencias a ON a.id = e.asistencia_id
    LEFT JOIN vehiculos v ON v.id = e.vehiculo_id`;

const conPlacaNormalizada = (v) => (v ? { ...v, placa: normalizarPlaca(v.placa) } : null);
const exequiaPublica = ({ es_de_la_placa: deLaPlaca, ...e }) => ({
  ...e,
  vehiculo_placa: e.vehiculo_placa ? normalizarPlaca(e.vehiculo_placa) : null,
  ...(deLaPlaca === undefined ? {} : { es_de_la_placa: Number(deLaPlaca) === 1 }),
});

function crearH360Lectura(bd) {
  const consultar = async (sql, params = []) => {
    const [filas] = await bd.obtener().query(sql, params);
    return filas;
  };
  const primera = async (sql, params) => (await consultar(sql, params))[0] || null;

  return {
    listarSedes: () => consultar(`SELECT ${COLUMNAS_SEDE} FROM sedes WHERE activo = 1 ORDER BY nombre`),

    obtenerSede: (id) => primera(`SELECT ${COLUMNAS_SEDE} FROM sedes WHERE id = ? AND activo = 1`, [id]),

    async buscarVehiculosPropios(q) {
      const filtro = q ? `AND ${placaSql('placa')} LIKE ?` : '';
      const filas = await consultar(
        `SELECT ${COLUMNAS_VEHICULO} FROM vehiculos WHERE activo = 1 ${filtro} ORDER BY placa LIMIT ${LIMITE}`,
        q ? [patronContiene(normalizarPlaca(q))] : [],
      );
      return filas.map(conPlacaNormalizada);
    },

    async obtenerVehiculoPropioPorPlaca(placa) {
      return conPlacaNormalizada(await primera(
        `SELECT ${COLUMNAS_VEHICULO} FROM vehiculos WHERE activo = 1 AND ${placaSql('placa')} = ? LIMIT 1`,
        [normalizarPlaca(placa)],
      ));
    },

    buscarAsistencias(q) {
      const filtro = q ? 'AND (codigo LIKE ? OR nombre_ser_querido LIKE ? OR contrato LIKE ?)' : '';
      const patron = patronContiene(q ?? '');
      return consultar(
        `SELECT ${COLUMNAS_ASISTENCIA} FROM asistencias WHERE estado IN (?) ${filtro}
          ORDER BY created_at DESC, id DESC LIMIT ${LIMITE}`,
        q ? [ESTADOS_ASISTENCIA, patron, patron, patron] : [ESTADOS_ASISTENCIA],
      );
    },

    obtenerAsistenciaVigente: (id) => primera(
      `SELECT ${COLUMNAS_ASISTENCIA} FROM asistencias WHERE id = ? AND estado IN (?)`, [id, ESTADOS_ASISTENCIA],
    ),

    async buscarExequias({ q, placa } = {}) {
      const placaNormalizada = placa ? normalizarPlaca(placa) : null;
      const filtro = q ? 'AND (a.codigo LIKE ? OR a.nombre_ser_querido LIKE ?)' : '';
      const patron = patronContiene(q ?? '');
      const filas = await consultar(
        `${SELECT_EXEQUIA},
                COALESCE(? IS NOT NULL AND ${placaSql('v.placa')} = ?, 0) AS es_de_la_placa
         ${FROM_EXEQUIA}
          WHERE e.estado NOT IN (?)
            AND e.fecha BETWEEN CURDATE() - INTERVAL 1 DAY AND CURDATE() + INTERVAL 1 DAY
            ${filtro}
          ORDER BY es_de_la_placa DESC, e.fecha, e.hora, e.id
          LIMIT ${LIMITE}`,
        [placaNormalizada, placaNormalizada, ESTADOS_EXEQUIA_TERMINALES, ...(q ? [patron, patron] : [])],
      );
      return filas.map(exequiaPublica);
    },

    async obtenerExequiaVigente(id) {
      const fila = await primera(
        `${SELECT_EXEQUIA} ${FROM_EXEQUIA} WHERE e.id = ? AND e.estado NOT IN (?)`, [id, ESTADOS_EXEQUIA_TERMINALES],
      );
      return fila ? exequiaPublica(fila) : null;
    },
  };
}

module.exports = { crearH360Lectura, ESTADOS_ASISTENCIA, ESTADOS_EXEQUIA_TERMINALES };
```

```js
// src/porteria/repositorios/motivos.js
// Lectura de por_motivos. Las columnas se eligen de un mapa cerrado: nunca se interpola texto del usuario.
const COLUMNA_TIPO = {
  PROPIO: 'aplica_propio',
  PROVEEDOR_ASISTENCIA: 'aplica_proveedor_asistencia',
  PROVEEDOR: 'aplica_proveedor',
};
const COLUMNA_SENTIDO = { INGRESO: 'aplica_ingreso', SALIDA: 'aplica_salida' };

function crearRepositorioMotivos(bd) {
  async function listarActivos({ tipoVehiculo, sentido } = {}) {
    const condiciones = ['activo = 1'];
    if (tipoVehiculo) {
      if (!COLUMNA_TIPO[tipoVehiculo]) throw new Error(`Tipo de vehículo inválido: ${tipoVehiculo}`);
      condiciones.push(`${COLUMNA_TIPO[tipoVehiculo]} = 1`);
    }
    if (sentido) {
      if (!COLUMNA_SENTIDO[sentido]) throw new Error(`Sentido inválido: ${sentido}`);
      condiciones.push(`${COLUMNA_SENTIDO[sentido]} = 1`);
    }
    const [filas] = await bd.obtener().query(
      `SELECT id, codigo, nombre, descripcion, tipo_referencia, referencia_obligatoria
         FROM por_motivos WHERE ${condiciones.join(' AND ')} ORDER BY orden, nombre`,
    );
    return filas.map((m) => ({ ...m, referencia_obligatoria: m.referencia_obligatoria === 1 }));
  }

  return { listarActivos };
}

module.exports = {
  crearRepositorioMotivos,
  TIPOS_VEHICULO: Object.keys(COLUMNA_TIPO),
  SENTIDOS: Object.keys(COLUMNA_SENTIDO),
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:porteria:int`
Expected: PASS (todas las suites de integración, incluidas las de la Fase 0).

Run: `npx jest src/porteria`
Expected: PASS (unitarias).

- [ ] **Step 6: Commit**

```bash
git add src/porteria/services/h360Lectura.service.js src/porteria/repositorios/motivos.js src/porteria/testing/bd.js src/porteria/__tests__/h360Lectura.int.test.js src/porteria/__tests__/motivos.int.test.js
git commit -m "feat(porteria): lecturas de H360 (sedes, vehículos, asistencias, exequias) y motivos activos"
```

---

### Task 5: Conductores del AD con caché

**Files:**
- Create: `src/porteria/services/conductores.service.js`
- Test: `src/porteria/__tests__/conductores.service.test.js`

**Interfaces:**
- Consumes: `listarMiembrosGrupo(grupo) → Promise<[{ usuario, nombre, mail, telefono }]>` (H360, inyectado).
- Produces: `crearConductores({ listarMiembrosGrupo, grupos: () => (string|undefined)[], ttlMs = 600000, ahora = Date.now, log }) → { listar() → Promise<[{ usuario, nombre }]>, existe(usuario) → Promise<boolean> }`.
  - Une los grupos en orden; si alguien está en dos, queda una vez. Ordena por nombre (`es`).
  - Solo guarda en caché una lectura completa (sin fallos). Si algún grupo falla: devuelve la última lista buena si existe; si no, lo que sí pudo leer. Nunca rechaza.

- [ ] **Step 1: Write the failing test**

```js
// src/porteria/__tests__/conductores.service.test.js
const { crearConductores } = require('../services/conductores.service');

const A = [{ usuario: 'zuleta', nombre: 'Zuleta Ana', mail: 'z@x', telefono: '1' }, { usuario: 'perez', nombre: 'Pérez Juan', mail: '', telefono: '' }];
const B = [{ usuario: 'perez', nombre: 'Pérez Juan (B)', mail: '', telefono: '' }, { usuario: 'baez', nombre: 'Báez Luis', mail: '', telefono: '' }];

function preparar({ fallan = [] } = {}) {
  let reloj = 1000;
  const log = { warn: jest.fn() };
  const listarMiembrosGrupo = jest.fn(async (grupo) => {
    if (fallan.includes(grupo)) throw new Error(`no se pudo leer ${grupo}`);
    return grupo === 'GA' ? A : B;
  });
  const conductores = crearConductores({
    listarMiembrosGrupo, grupos: () => ['GA', undefined, 'GB'], ttlMs: 600000, ahora: () => reloj, log,
  });
  return { conductores, listarMiembrosGrupo, log, avanzar: (ms) => { reloj += ms; }, fallan };
}

test('une los grupos sin duplicados, ordenados por nombre, solo usuario y nombre', async () => {
  const { conductores, listarMiembrosGrupo } = preparar();
  expect(await conductores.listar()).toEqual([
    { usuario: 'baez', nombre: 'Báez Luis' },
    { usuario: 'perez', nombre: 'Pérez Juan' },
    { usuario: 'zuleta', nombre: 'Zuleta Ana' },
  ]);
  expect(listarMiembrosGrupo.mock.calls.map(([g]) => g)).toEqual(['GA', 'GB']);
});

test('usa la caché durante 10 minutos', async () => {
  const { conductores, listarMiembrosGrupo, avanzar } = preparar();
  await conductores.listar();
  avanzar(599999);
  await conductores.listar();
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(2);
  avanzar(2);
  await conductores.listar();
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(4);
});

test('si un grupo falla sin caché previa devuelve lo que pudo leer y no lo guarda', async () => {
  const { conductores, listarMiembrosGrupo, log } = preparar({ fallan: ['GB'] });
  expect((await conductores.listar()).map((c) => c.usuario)).toEqual(['perez', 'zuleta']);
  expect(log.warn).toHaveBeenCalledWith('porteria: no se pudo leer un grupo de conductores', { grupo: 'GB' });
  await conductores.listar();
  expect(listarMiembrosGrupo).toHaveBeenCalledTimes(4);
});

test('si el AD falla después, conserva la última lista buena', async () => {
  const p = preparar();
  const buena = await p.conductores.listar();
  p.avanzar(600001);
  p.fallan.push('GA', 'GB');
  expect(await p.conductores.listar()).toEqual(buena);
});

test('existe consulta la lista', async () => {
  const { conductores } = preparar();
  expect(await conductores.existe('baez')).toBe(true);
  expect(await conductores.existe('nadie')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/porteria/__tests__/conductores.service.test.js`
Expected: FAIL — `Cannot find module '../services/conductores.service'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/porteria/services/conductores.service.js
// Conductores de vehículos propios: miembros de los grupos del AD que conducen (los mismos que usa H360).
// Caché en memoria; si el AD falla nunca se bloquea la portería (el front ofrece "otro" con nombre libre).
const DIEZ_MINUTOS = 10 * 60 * 1000;

function crearConductores({ listarMiembrosGrupo, grupos, ttlMs = DIEZ_MINUTOS, ahora = Date.now, log }) {
  let cache = null; // { lista, vence }

  async function leerDelDirectorio() {
    const porUsuario = new Map();
    let completo = true;
    for (const grupo of grupos().filter(Boolean)) {
      try {
        for (const m of await listarMiembrosGrupo(grupo)) {
          // Si alguien está en dos grupos queda con el primero.
          if (!porUsuario.has(m.usuario)) porUsuario.set(m.usuario, { usuario: m.usuario, nombre: m.nombre });
        }
      } catch {
        completo = false;
        log.warn('porteria: no se pudo leer un grupo de conductores', { grupo });
      }
    }
    const lista = [...porUsuario.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { lista, completo };
  }

  async function listar() {
    if (cache && ahora() < cache.vence) return cache.lista;
    const { lista, completo } = await leerDelDirectorio();
    if (completo) {
      cache = { lista, vence: ahora() + ttlMs };
      return lista;
    }
    return cache ? cache.lista : lista;
  }

  return {
    listar,
    async existe(usuario) {
      return (await listar()).some((c) => c.usuario === usuario);
    },
  };
}

module.exports = { crearConductores };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/porteria/__tests__/conductores.service.test.js`
Expected: PASS (5 pruebas).

- [ ] **Step 5: Commit**

```bash
git add src/porteria/services/conductores.service.js src/porteria/__tests__/conductores.service.test.js
git commit -m "feat(porteria): conductores del AD con caché de 10 minutos"
```

---

### Task 6: Rutas de autenticación

**Files:**
- Create: `src/porteria/routes/auth.routes.js`
- Create: `src/porteria/testing/appPrueba.js`
- Modify: `src/porteria/routes/index.js` (firma de `crearRouterPorteria`, montaje de `/auth`, dependencias de producción)
- Test: `src/porteria/__tests__/auth.routes.test.js`

**Interfaces:**
- Consumes: `rolDesdeGrupos`, `firmarToken`, `usuarioPublico` (Task 2); `crearAutenticacion`, `aw` (Task 3); `crearH360Lectura`, `crearRepositorioMotivos` (Task 4); `crearConductores` (Task 5); `validarCredenciales`, `listarMiembrosGrupo` (Task 1 / H360).
- Produces:
  - `crearRouterAuth({ obtenerConfig, directorio, h360, autenticar }) → express.Router` montado en `/auth`:
    - `POST /login { usuario, password }` → `{ token, user, sedes }` (`POR-AUT-001`)
    - `POST /sede { sede_id }` → `{ token, user }` (`POR-AUT-002`)
    - `GET /me` → `{ user }` (`POR-AUT-003`)
  - `crearRouterPorteria({ bd, obtenerConfig, directorio, conductores, h360?, motivos? })` (nueva firma; `h360` y `motivos` por defecto se crean desde `bd`).
  - `crearAppPrueba(deps?) → { app, deps }`, `tokenDe({ usuario?, nombre?, rol?, sede? }) → string`, `CONFIG` (`testing/appPrueba.js`).

- [ ] **Step 1: Create the test app helper**

```js
// src/porteria/testing/appPrueba.js
// App Express mínima con el router de Portería y dependencias falsas (jest.fn), reemplazables por prueba.
const express = require('express');
const { crearRouterPorteria } = require('../routes');
const { firmarToken } = require('../services/auth.service');

const CONFIG = Object.freeze({
  jwtSecret: 'secreto-de-prueba-porteria-0123456789abcdef',
  jwtExpires: '12h',
  grupos: { guarda: 'PorteriaGuardas', admin: 'PorteriaAdmins', adminGeneral: 'Admins' },
});

function crearAppPrueba(deps = {}) {
  const todas = {
    bd: { ping: async () => {} },
    obtenerConfig: () => CONFIG,
    directorio: { validarCredenciales: jest.fn() },
    conductores: { listar: jest.fn(async () => []), existe: jest.fn(async () => false) },
    h360: {
      listarSedes: jest.fn(async () => []),
      obtenerSede: jest.fn(async () => null),
      buscarVehiculosPropios: jest.fn(async () => []),
      buscarAsistencias: jest.fn(async () => []),
      buscarExequias: jest.fn(async () => []),
    },
    motivos: { listarActivos: jest.fn(async () => []) },
    ...deps,
  };
  const app = express();
  app.use(express.json());
  app.use('/api/porteria/v1', crearRouterPorteria(todas));
  return { app, deps: todas };
}

const tokenDe = ({ usuario = 'guarda1', nombre = 'Guarda Uno', rol = 'guarda', sede = null } = {}) =>
  firmarToken({ usuario, nombre, rol, sede }, CONFIG);

module.exports = { crearAppPrueba, tokenDe, CONFIG };
```

- [ ] **Step 2: Write the failing test**

```js
// src/porteria/__tests__/auth.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe, CONFIG } = require('../testing/appPrueba');
const { verificarToken } = require('../services/auth.service');

afterEach(cerrarServidores);

const DN_GUARDA = 'CN=PorteriaGuardas,OU=Grupos,DC=olivos,DC=local';
const errorDirectorio = (codigo, message) => Object.assign(new Error(message), { codigo });
const SEDES = [{ id: 1, codigo: 'S1', nombre: 'Norte', ciudad: 'Cúcuta' }];

function app() {
  const prueba = crearAppPrueba();
  prueba.deps.directorio.validarCredenciales.mockResolvedValue({
    usuario: 'jperez', nombre: 'Juan Pérez', email: 'j@x', memberOf: [DN_GUARDA],
  });
  prueba.deps.h360.listarSedes.mockResolvedValue(SEDES);
  return prueba;
}

describe('POST /auth/login', () => {
  test('guarda válido → token sin sede, usuario y sedes', async () => {
    const { app: a, deps } = app();
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send({ usuario: 'OLIVOS\\jperez', password: 'clave' });
    expect(r.status).toBe(200);
    expect(r.headers['x-por-api']).toBe('POR-AUT-001');
    expect(r.body.data.user).toEqual({ usuario: 'jperez', nombre: 'Juan Pérez', rol: 'guarda', sede: null });
    expect(r.body.data.sedes).toEqual(SEDES);
    expect(verificarToken(r.body.data.token, CONFIG.jwtSecret)).toMatchObject({ usuario: 'jperez', rol: 'guarda', sede_id: null });
    expect(deps.directorio.validarCredenciales).toHaveBeenCalledWith('OLIVOS\\jperez', 'clave');
  });

  test('el grupo de admin general entra como admin_porteria', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockResolvedValue({ usuario: 'ana', nombre: 'Ana', email: '', memberOf: ['CN=Admins,DC=olivos,DC=local'] });
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send({ usuario: 'ana', password: 'x' });
    expect(r.body.data.user.rol).toBe('admin_porteria');
  });

  test.each([
    [{}],
    [{ usuario: 'jperez' }],
    [{ usuario: '  ', password: 'x' }],
    [{ usuario: 'jperez', password: 123 }],
    [{ usuario: 'x'.repeat(101), password: 'x' }],
  ])('cuerpo inválido %p → 400 sin consultar el AD', async (cuerpo) => {
    const { app: a, deps } = app();
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send(cuerpo);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: 'POR-AUT-001', motivo: 'VALIDACION', message: 'Usuario y contraseña son obligatorios' });
    expect(deps.directorio.validarCredenciales).not.toHaveBeenCalled();
  });

  test('usuario inexistente o clave mala → 401 con el mismo mensaje', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockRejectedValue(errorDirectorio('CREDENCIALES_INVALIDAS', 'Usuario no encontrado en el directorio'));
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send({ usuario: 'nadie', password: 'x' });
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, error: 'POR-AUT-001', motivo: 'CREDENCIALES_INVALIDAS', message: 'Usuario o contraseña incorrectos' });
  });

  test('AD caído → 503 DIRECTORIO_NO_DISPONIBLE', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockRejectedValue(errorDirectorio('AD_NO_DISPONIBLE', 'No se pudo conectar al directorio activo: x'));
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send({ usuario: 'jperez', password: 'x' });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ motivo: 'DIRECTORIO_NO_DISPONIBLE', message: 'No se pudo validar con el directorio activo. Intenta de nuevo.' });
  });

  test('sin grupo de portería → 403 SIN_ROL_PORTERIA', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockResolvedValue({ usuario: 'x', nombre: 'X', email: '', memberOf: ['CN=Otro,DC=olivos,DC=local'] });
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/login').send({ usuario: 'x', password: 'x' });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ motivo: 'SIN_ROL_PORTERIA', message: 'Tu usuario no tiene acceso a Portería. Contacta a TI.' });
  });

  test('10 intentos fallidos por IP → el 11.º responde 429', async () => {
    const { app: a, deps } = app();
    deps.directorio.validarCredenciales.mockRejectedValue(errorDirectorio('CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos'));
    const servidor = await servir(a);
    for (let i = 0; i < 10; i++) {
      const r = await request(servidor).post('/api/porteria/v1/auth/login').send({ usuario: 'x', password: 'mala' });
      expect(r.status).toBe(401);
    }
    const r = await request(servidor).post('/api/porteria/v1/auth/login').send({ usuario: 'x', password: 'mala' });
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ error: 'POR-AUT-001', motivo: 'DEMASIADOS_INTENTOS' });
  });

  test('los logins exitosos no cuentan para el límite', async () => {
    const { app: a } = app();
    const servidor = await servir(a);
    for (let i = 0; i < 12; i++) {
      const r = await request(servidor).post('/api/porteria/v1/auth/login').send({ usuario: 'jperez', password: 'clave' });
      expect(r.status).toBe(200);
    }
  });
});

describe('POST /auth/sede', () => {
  test('sin sesión → 401', async () => {
    const { app: a } = app();
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/sede').send({ sede_id: 1 });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('POR-AUT-002');
  });

  test('elige una sede activa → token nuevo con la sede', async () => {
    const { app: a, deps } = app();
    deps.h360.obtenerSede.mockResolvedValue({ id: 1, codigo: 'S1', nombre: 'Norte', ciudad: 'Cúcuta' });
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/sede')
      .set('Authorization', `Bearer ${tokenDe()}`).send({ sede_id: '1' });
    expect(r.status).toBe(200);
    expect(r.body.data.user).toEqual({ usuario: 'guarda1', nombre: 'Guarda Uno', rol: 'guarda', sede: { id: 1, nombre: 'Norte' } });
    expect(verificarToken(r.body.data.token, CONFIG.jwtSecret)).toMatchObject({ sede_id: 1, sede_nombre: 'Norte' });
    expect(deps.h360.obtenerSede).toHaveBeenCalledWith(1);
  });

  test.each([[{}], [{ sede_id: 'abc' }], [{ sede_id: 0 }], [{ sede_id: 1.5 }]])('sede_id inválido %p → 400', async (cuerpo) => {
    const { app: a } = app();
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/sede')
      .set('Authorization', `Bearer ${tokenDe()}`).send(cuerpo);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ motivo: 'VALIDACION', message: 'Indica la sede' });
  });

  test('sede inexistente o inactiva → 404', async () => {
    const { app: a } = app();
    const r = await request(await servir(a)).post('/api/porteria/v1/auth/sede')
      .set('Authorization', `Bearer ${tokenDe()}`).send({ sede_id: 99 });
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ motivo: 'SEDE_NO_ENCONTRADA', message: 'La sede no existe o está inactiva' });
  });
});

test('GET /auth/me devuelve el usuario de la sesión', async () => {
  const { app: a } = app();
  const token = tokenDe({ rol: 'admin_porteria', sede: { id: 2, nombre: 'Sur' } });
  const r = await request(await servir(a)).get('/api/porteria/v1/auth/me').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.headers['x-por-api']).toBe('POR-AUT-003');
  expect(r.body).toEqual({ success: true, data: { user: { usuario: 'guarda1', nombre: 'Guarda Uno', rol: 'admin_porteria', sede: { id: 2, nombre: 'Sur' } } } });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/porteria/__tests__/auth.routes.test.js`
Expected: FAIL — 404 en `/auth/login` (o `crearRouterPorteria` ignora las dependencias).

- [ ] **Step 4: Write the auth router**

```js
// src/porteria/routes/auth.routes.js
// Login con el Directorio Activo, elección de sede de turno y sesión actual.
const express = require('express');
const rateLimit = require('express-rate-limit');
const apiCodigo = require('../middleware/apiCodigo');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');
const { rolDesdeGrupos, firmarToken, usuarioPublico } = require('../services/auth.service');

const textoValido = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;

function crearRouterAuth({ obtenerConfig, directorio, h360, autenticar }) {
  const router = express.Router();

  // Las casetas de una sede comparten IP: solo cuentan los intentos fallidos.
  const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(new PorteriaError(
      429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
    )),
  });

  router.post('/login', apiCodigo('POR-AUT-001'), limitadorLogin, aw(async (req, res) => {
    const { usuario, password } = req.body || {};
    if (!textoValido(usuario, 100) || !textoValido(password, 200)) {
      throw new PorteriaError(400, 'VALIDACION', 'Usuario y contraseña son obligatorios');
    }

    let datos;
    try {
      datos = await directorio.validarCredenciales(usuario, password);
    } catch (err) {
      if (err.codigo === 'CREDENCIALES_INVALIDAS') {
        // El mismo mensaje para usuario inexistente y clave mala: no revela qué usuarios existen.
        throw new PorteriaError(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos');
      }
      req.porLog.warn('porteria: el directorio activo no respondió al login', { codigo: err.codigo || null });
      throw new PorteriaError(503, 'DIRECTORIO_NO_DISPONIBLE', 'No se pudo validar con el directorio activo. Intenta de nuevo.');
    }

    const config = obtenerConfig();
    const rol = rolDesdeGrupos(datos.memberOf, config.grupos);
    if (!rol) throw new PorteriaError(403, 'SIN_ROL_PORTERIA', 'Tu usuario no tiene acceso a Portería. Contacta a TI.');

    const sesion = { usuario: datos.usuario, nombre: datos.nombre, rol, sede: null };
    const sedes = await h360.listarSedes();
    res.json({
      success: true,
      data: { token: firmarToken(sesion, config), user: { ...sesion }, sedes },
    });
  }));

  router.post('/sede', apiCodigo('POR-AUT-002'), autenticar, aw(async (req, res) => {
    const sedeId = Number(req.body && req.body.sede_id);
    if (!Number.isInteger(sedeId) || sedeId <= 0) throw new PorteriaError(400, 'VALIDACION', 'Indica la sede');

    const sede = await h360.obtenerSede(sedeId);
    if (!sede) throw new PorteriaError(404, 'SEDE_NO_ENCONTRADA', 'La sede no existe o está inactiva');

    const { usuario, nombre, rol } = req.porUsuario;
    const token = firmarToken({ usuario, nombre, rol, sede: { id: sede.id, nombre: sede.nombre } }, obtenerConfig());
    res.json({
      success: true,
      data: { token, user: usuarioPublico({ usuario, nombre, rol, sede_id: sede.id, sede_nombre: sede.nombre }) },
    });
  }));

  router.get('/me', apiCodigo('POR-AUT-003'), autenticar, (req, res) => {
    res.json({ success: true, data: { user: usuarioPublico(req.porUsuario) } });
  });

  return router;
}

module.exports = { crearRouterAuth };
```

- [ ] **Step 5: Update `src/porteria/routes/index.js`**

Reemplazar la fábrica y la construcción de producción (mantén intactos el guardián `router`, `avisado` y el `module.exports`):

```js
const express = require('express');
const logger = require('../../utils/logger');
const ldapService = require('../../h360/services/ldap.service');
const { leerEntorno } = require('../config/entorno');
const { crearBdPerezosa } = require('../db');
const apiCodigo = require('../middleware/apiCodigo');
const { porteriaErrorHandler } = require('../middleware/errorHandler');
const { crearAutenticacion } = require('../middleware/autenticacion');
const { errorParaLog } = require('../utils/errorSeguro');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearConductores } = require('../services/conductores.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRouterAuth } = require('./auth.routes');

/**
 * Fábrica inyectable (tests). `bd` = { ping(), obtener() }; `obtenerConfig()` devuelve leerEntorno().config;
 * `directorio` = { validarCredenciales }; `conductores` = { listar(), existe() }.
 */
function crearRouterPorteria({
  bd, obtenerConfig, directorio, conductores, h360 = crearH360Lectura(bd), motivos = crearRepositorioMotivos(bd),
}) {
  const router = express.Router();
  const autenticar = crearAutenticacion(obtenerConfig);

  router.get('/health', apiCodigo('POR-SIS-001'), async (req, res) => {
    try {
      await bd.ping();
      res.json({ success: true, data: { estado: 'ok', bd: 'ok' } });
    } catch (err) {
      req.porLog.error('porteria: falló el ping a la BD', errorParaLog(err));
      res.status(503).json({ success: false, message: 'La base de datos no responde' });
    }
  });

  router.use('/auth', crearRouterAuth({ obtenerConfig, directorio, h360, autenticar }));

  router.use(apiCodigo('POR-SIS-002'), (req, res) => res.status(404).json({ success: false, message: 'Ruta no encontrada' }));

  router.use(porteriaErrorHandler);
  return router;
}

// Producción: el router se construye UNA vez al cargar (express-rate-limit exige crear los limitadores aquí).
// Nada aquí toca la red ni lanza si faltan variables: el pool se crea al primer uso.
const bd = crearBdPerezosa(() => {
  const e = leerEntorno();
  if (!e.ok) throw new Error(`Portería sin configuración válida: ${e.motivo}`);
  return e.config.db;
});
const real = crearRouterPorteria({
  bd,
  // Solo se llama detrás del guardián, cuando la configuración ya es válida.
  obtenerConfig: () => leerEntorno().config,
  directorio: ldapService,
  conductores: crearConductores({
    listarMiembrosGrupo: ldapService.listarMiembrosGrupo,
    grupos: () => [process.env.LDAP_GROUP_ASIST_TANATOLOGO, process.env.LDAP_GROUP_ASISTENTE],
    log: logger,
  }),
});
```

`motivos` y `conductores` todavía no se usan en esta fábrica; los monta la Task 7.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/porteria`
Expected: PASS (incluye `health.test.js` y `montaje.test.js` de la Fase 0 sin cambios).

- [ ] **Step 7: Commit**

```bash
git add src/porteria/routes/auth.routes.js src/porteria/routes/index.js src/porteria/testing/appPrueba.js src/porteria/__tests__/auth.routes.test.js
git commit -m "feat(porteria): login con el AD, sede de turno y sesión (/auth)"
```

---

### Task 7: Rutas de catálogos y montaje completo

**Files:**
- Create: `src/porteria/routes/catalogos.routes.js`
- Modify: `src/porteria/routes/index.js` (montar `/catalogos`)
- Modify: `src/porteria/__tests__/montaje.test.js` (dos pruebas nuevas al final)
- Test: `src/porteria/__tests__/catalogos.routes.test.js`

**Interfaces:**
- Consumes: `autenticar` (Task 3), `h360` (Task 4), `motivos` + `TIPOS_VEHICULO` + `SENTIDOS` (Task 4), `conductores` (Task 5), `crearAppPrueba`/`tokenDe` (Task 6), `aw`.
- Produces: `crearRouterCatalogos({ autenticar, h360, conductores, motivos }) → express.Router` montado en `/catalogos`. Todas las rutas exigen sesión (cualquier rol), no exigen sede:
  - `GET /sedes` (`POR-CAT-001`) → `h360.listarSedes()`
  - `GET /vehiculos-propios?q=` (`POR-CAT-002`) → `h360.buscarVehiculosPropios(q)`
  - `GET /conductores` (`POR-CAT-003`) → `conductores.listar()`
  - `GET /asistencias?q=` (`POR-CAT-004`) → `h360.buscarAsistencias(q)`
  - `GET /exequias?q=&placa=` (`POR-CAT-005`) → `h360.buscarExequias({ q, placa })`
  - `GET /motivos?tipo_vehiculo=&sentido=` (`POR-CAT-006`) → `motivos.listarActivos({ tipoVehiculo, sentido })`
  - Parámetros de texto: opcionales, recortados; vacío → `undefined`; más de 50 caracteres → 400 `VALIDACION` `'La búsqueda es demasiado larga'`. `tipo_vehiculo`/`sentido` fuera de los valores válidos → 400 `VALIDACION` `'Tipo de vehículo o sentido inválido'`.

- [ ] **Step 1: Write the failing tests**

```js
// src/porteria/__tests__/catalogos.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const BASE = '/api/porteria/v1/catalogos';
const RUTAS = [
  ['/sedes', 'POR-CAT-001'],
  ['/vehiculos-propios', 'POR-CAT-002'],
  ['/conductores', 'POR-CAT-003'],
  ['/asistencias', 'POR-CAT-004'],
  ['/exequias', 'POR-CAT-005'],
  ['/motivos', 'POR-CAT-006'],
];

async function get(ruta, deps) {
  const { app } = deps ? { app: deps.app } : crearAppPrueba();
  return request(await servir(app)).get(`${BASE}${ruta}`).set('Authorization', `Bearer ${tokenDe()}`);
}

test.each(RUTAS)('%s exige sesión (%s)', async (ruta, codigo) => {
  const { app } = crearAppPrueba();
  const r = await request(await servir(app)).get(`${BASE}${ruta}`);
  expect(r.status).toBe(401);
  expect(r.body.error).toBe(codigo);
});

test('sedes', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.h360.listarSedes.mockResolvedValue([{ id: 1, codigo: 'S1', nombre: 'Norte', ciudad: 'Cúcuta' }]);
  const r = await get('/sedes', prueba);
  expect(r.status).toBe(200);
  expect(r.headers['x-por-api']).toBe('POR-CAT-001');
  expect(r.body).toEqual({ success: true, data: [{ id: 1, codigo: 'S1', nombre: 'Norte', ciudad: 'Cúcuta' }] });
});

test('vehículos propios pasa la búsqueda recortada', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.h360.buscarVehiculosPropios.mockResolvedValue([{ id: 1, placa: 'ABC123' }]);
  const r = await get('/vehiculos-propios?q=%20abc%20', prueba);
  expect(r.body.data).toEqual([{ id: 1, placa: 'ABC123' }]);
  expect(prueba.deps.h360.buscarVehiculosPropios).toHaveBeenCalledWith('abc');
});

test('búsqueda vacía se pasa como undefined', async () => {
  const prueba = crearAppPrueba();
  await get('/asistencias?q=', prueba);
  expect(prueba.deps.h360.buscarAsistencias).toHaveBeenCalledWith(undefined);
});

test('búsqueda de más de 50 caracteres → 400', async () => {
  const r = await get(`/asistencias?q=${'a'.repeat(51)}`);
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ error: 'POR-CAT-004', motivo: 'VALIDACION', message: 'La búsqueda es demasiado larga' });
});

test('conductores', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.conductores.listar.mockResolvedValue([{ usuario: 'baez', nombre: 'Báez Luis' }]);
  const r = await get('/conductores', prueba);
  expect(r.body.data).toEqual([{ usuario: 'baez', nombre: 'Báez Luis' }]);
});

test('exequias recibe búsqueda y placa', async () => {
  const prueba = crearAppPrueba();
  await get('/exequias?placa=abc-123', prueba);
  expect(prueba.deps.h360.buscarExequias).toHaveBeenCalledWith({ q: undefined, placa: 'abc-123' });
});

test('motivos filtra por tipo y sentido', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.motivos.listarActivos.mockResolvedValue([{ id: 1, codigo: 'TANQUEO' }]);
  const r = await get('/motivos?tipo_vehiculo=PROPIO&sentido=SALIDA', prueba);
  expect(r.body.data).toEqual([{ id: 1, codigo: 'TANQUEO' }]);
  expect(prueba.deps.motivos.listarActivos).toHaveBeenCalledWith({ tipoVehiculo: 'PROPIO', sentido: 'SALIDA' });
});

test.each(['?tipo_vehiculo=CAMION', '?sentido=ARRIBA'])('motivos con %s → 400', async (query) => {
  const prueba = crearAppPrueba();
  const r = await get(`/motivos${query}`, prueba);
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ motivo: 'VALIDACION', message: 'Tipo de vehículo o sentido inválido' });
  expect(prueba.deps.motivos.listarActivos).not.toHaveBeenCalled();
});

test('un fallo de la BD responde 500 genérico', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.h360.listarSedes.mockRejectedValue(Object.assign(new Error("Unknown column 'x'"), { code: 'ER_BAD_FIELD_ERROR' }));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const r = await get('/sedes', prueba);
  expect(r.status).toBe(500);
  expect(r.body).toEqual({ success: false, error: 'POR-CAT-001', motivo: 'ERROR_INTERNO', message: 'Error interno del servidor' });
  jest.restoreAllMocks();
});
```

Agregar al final de `src/porteria/__tests__/montaje.test.js` (usa el helper `completas()` que ya existe en ese archivo):

```js
test('las rutas de la Fase 1 están montadas en la app real', async () => {
  completas();
  const login = await request(await servir(app)).post('/api/porteria/v1/auth/login').send({});
  expect(login.status).toBe(400);
  expect(login.body.error).toBe('POR-AUT-001');
  const sedes = await request(await servir(app)).get('/api/porteria/v1/catalogos/sedes');
  expect(sedes.status).toBe(401);
  expect(sedes.body.error).toBe('POR-CAT-001');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/porteria/__tests__/catalogos.routes.test.js src/porteria/__tests__/montaje.test.js`
Expected: FAIL — 404 `POR-SIS-002` en `/catalogos/*`.

- [ ] **Step 3: Write the catalog router**

```js
// src/porteria/routes/catalogos.routes.js
// Listas que el guarda usa para registrar. Solo lectura; exigen sesión pero no sede.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');
const { TIPOS_VEHICULO, SENTIDOS } = require('../repositorios/motivos');

/** Texto opcional de la query: recortado, vacío → undefined, máximo 50 caracteres. */
function textoOpcional(valor) {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string') throw new PorteriaError(400, 'VALIDACION', 'La búsqueda es demasiado larga');
  const texto = valor.trim();
  if (texto.length > 50) throw new PorteriaError(400, 'VALIDACION', 'La búsqueda es demasiado larga');
  return texto === '' ? undefined : texto;
}

function crearRouterCatalogos({ autenticar, h360, conductores, motivos }) {
  const router = express.Router();
  const ruta = (path, codigo, obtener) => router.get(path, apiCodigo(codigo), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await obtener(req) });
  }));

  ruta('/sedes', 'POR-CAT-001', () => h360.listarSedes());
  ruta('/vehiculos-propios', 'POR-CAT-002', (req) => h360.buscarVehiculosPropios(textoOpcional(req.query.q)));
  ruta('/conductores', 'POR-CAT-003', () => conductores.listar());
  ruta('/asistencias', 'POR-CAT-004', (req) => h360.buscarAsistencias(textoOpcional(req.query.q)));
  ruta('/exequias', 'POR-CAT-005', (req) => h360.buscarExequias({
    q: textoOpcional(req.query.q), placa: textoOpcional(req.query.placa),
  }));
  ruta('/motivos', 'POR-CAT-006', (req) => {
    const tipoVehiculo = textoOpcional(req.query.tipo_vehiculo);
    const sentido = textoOpcional(req.query.sentido);
    if ((tipoVehiculo && !TIPOS_VEHICULO.includes(tipoVehiculo)) || (sentido && !SENTIDOS.includes(sentido))) {
      throw new PorteriaError(400, 'VALIDACION', 'Tipo de vehículo o sentido inválido');
    }
    return motivos.listarActivos({ tipoVehiculo, sentido });
  });

  return router;
}

module.exports = { crearRouterCatalogos };
```

En `src/porteria/routes/index.js`: agregar `const { crearRouterCatalogos } = require('./catalogos.routes');` junto a los demás `require`, y debajo de `router.use('/auth', …)`:

```js
  router.use('/catalogos', crearRouterCatalogos({ autenticar, h360, conductores, motivos }));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/porteria`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/routes/catalogos.routes.js src/porteria/routes/index.js src/porteria/__tests__/catalogos.routes.test.js src/porteria/__tests__/montaje.test.js
git commit -m "feat(porteria): catálogos de sedes, vehículos, conductores, asistencias, exequias y motivos"
```

---

### Task 8: Verificación de cierre de la Fase 1

- [ ] **Step 1: Pruebas**

Run: `npx jest src/porteria src/h360/services` → PASS.
Run: `npm run test:porteria:int` → PASS (Fase 0 + Fase 1).
Run: `npx jest` → solo fallan las 3 suites de la línea base.

- [ ] **Step 2: Variables de ejemplo**

Agregar al final de `src/porteria/porteria.env.example`:

```
# El login y los conductores reutilizan la conexión al AD de H360:
# LDAP_URL, LDAP_BASE_DN, LDAP_BIND_USER, LDAP_BIND_PASS, LDAP_GROUP_ASIST_TANATOLOGO, LDAP_GROUP_ASISTENTE
```

```bash
git add src/porteria/porteria.env.example
git commit -m "docs(porteria): variables del AD que reutiliza el módulo"
```

- [ ] **Step 3: Revisión**

`superpowers:requesting-code-review` sobre el diff de la fase y `superpowers:verification-before-completion`.

- [ ] **Step 4: Chequeos contra `serfuweb` (los hace una persona con acceso; no bloquean el merge de la rama, sí el despliegue)**

Ejecutar en la base real (solo lectura) y anotar el resultado en el PR:

```sql
SELECT @@global.time_zone, @@system_time_zone;
SHOW CREATE TABLE sedes;
SHOW CREATE TABLE vehiculos;
SHOW CREATE TABLE asistencias;
SHOW CREATE TABLE exequias;
SHOW GRANTS FOR CURRENT_USER();
SELECT COLUMN_NAME, COLLATION_NAME FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'placa';
```

Si las columnas o la collation difieren de `src/porteria/testing/sql/h360_minimo.sql`, se ajusta ese archivo y se vuelven a correr las pruebas de integración. Si el usuario no tiene `CREATE VIEW` o `REFERENCES`, la migración se ejecuta con un usuario que sí los tenga.
