# Portería — Fase 2b (puesta en marcha, propios fuera y salida por otra sede) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el día de arranque cada vehículo propio figure dentro de su sede (siembra desde H360), que el guarda vea toda la flota fuera y que una salida por una sede distinta de donde figura el vehículo se trate como inconsistente.

**Architecture:** `por_estado_vehiculo` gana `sembrado_at`: una fila sembrada (sin evento) cuenta como "con historial". Un servicio de siembra, usado por un comando CLI, crea esas filas para los propios activos de H360 que aún no tienen estado, con auditoría `SEMBRAR`. `registrar` agrega la regla `SALIDA_OTRA_SEDE`. Las consultas de estado incluyen las filas sembradas.

**Tech Stack:** Node.js, Express 4, mysql2/promise (`.query()`), Jest 29 + supertest, MySQL 8 (docker 3308).

**Diseño de referencia:** `docs/superpowers/specs/2026-10-29-porteria-design.md` §2 (filas "Fase 2b").

## Global Constraints

- Código en `src/porteria/`. Portería nunca escribe en tablas de H360/Mantix; la siembra solo lee `vehiculos` y `sedes`.
- La siembra no crea eventos (no aparece en reportes de viajes) y nunca pisa un estado existente: un vehículo con fila en `por_estado_vehiculo` se omite. Cada fila sembrada queda en `por_auditoria` (`entidad 'vehiculo'`, `entidad_id` = id del vehículo en H360, `accion 'SEMBRAR'`).
- Una fila con `sembrado_at` no nulo y sin `ultimo_evento_id` es "con historial": dentro de su sede.
- Salida por otra sede: solo si el vehículo figura dentro (`dentro = 1`) de una sede conocida distinta de la del guarda. Un propio sin historial ni siembra sale por cualquier sede sin marca.
- Mensajes en español; contrato de error del módulo. Siempre `.query()`.
- Pruebas de integración solo contra MySQL local `*_test`; Task 1 → placas `B1…`, ids 2900–2949; Task 2 → `B2…`, 2950–2969; Task 3 → `B3S…`, 2970–2989. Cada archivo borra en su `beforeAll` solo las filas de su prefijo.
- Commits con trailer `Co-Authored-By:` del modelo que los escribe.

## Antes de empezar

Rama `feature/porteria` limpia; `npm run porteria:db:test`; línea base `npx jest` (solo las 3 suites preexistentes fallan).

## Mapa de archivos

| Archivo | Cambio |
|---|---|
| `src/porteria/migrations/005_siembra_y_otra_sede.sql` | `sembrado_at`, `SALIDA_OTRA_SEDE`, acción `SEMBRAR` |
| `src/porteria/repositorios/estado.js` | `sembrado_at` en el estado; `sembrar`; `obtener` y `dentroDeSede` incluyen sembrados |
| `src/porteria/services/h360Lectura.service.js` | + `listarVehiculosPropios()` (todos los activos, sin límite) |
| `src/porteria/services/eventos.service.js` | sembrado = con historial; regla `SALIDA_OTRA_SEDE` |
| `src/porteria/services/estado.service.js` | `estado.sembrado` en la sugerencia |
| `src/porteria/routes/estado.routes.js` | `/estado/fuera`: el guarda ve todas las sedes |
| `src/porteria/services/siembra.service.js` | `sembrarPropios({ sedeId, placas, usuario })` |
| `src/porteria/scripts/sembrar.js` | CLI `npm run porteria:sembrar` |
| `package.json` | script `porteria:sembrar` |

---

### Task 1: Migración 005, estado sembrado y lista completa de propios

**Files:**
- Create: `src/porteria/migrations/005_siembra_y_otra_sede.sql`
- Modify: `src/porteria/repositorios/estado.js`
- Modify: `src/porteria/services/h360Lectura.service.js`
- Modify: `src/porteria/__tests__/migraciones.int.test.js` (lista de migraciones)
- Modify: `src/porteria/__tests__/repositorios.int.test.js` (la prueba de `bloquear` compara la fila completa: agregar `sembrado_at: null`)
- Test: `src/porteria/__tests__/siembraEstado.int.test.js`

**Interfaces:**
- Produces:
  - `por_estado_vehiculo.sembrado_at DATETIME NULL`; `por_eventos.inconsistencia_tipo` admite `'SALIDA_OTRA_SEDE'`; `por_auditoria.accion` admite `'SEMBRAR'`.
  - `repoEstado.bloquear(conn, placa)` devuelve además `sembrado_at`.
  - `repoEstado.sembrar(conn, { placa, sedeId }) → boolean` (true si creó la fila; false si la placa ya tenía estado).
  - `repoEstado.obtener(ejecutor, placa)` devuelve también las filas sembradas sin evento: `{ placa, tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id, sembrado_at, desde }` con `desde = COALESCE(registrado_at del último evento, sembrado_at)`.
  - `repoEstado.dentroDeSede(ejecutor, sedeId)` → eventos (forma de `eventoPublico`) con `carga_inicial: false`, más filas sembradas sin evento con forma `{ id: null, placa, tipo_vehiculo: 'PROPIO', sede_id, sentido: null, motivo: null, registrado_at: sembrado_at, carga_inicial: true }`; todo ordenado por `registrado_at` descendente.
  - `h360.listarVehiculosPropios() → [{ id, placa, marca, modelo, tipo }]` (activos, placa normalizada, por placa).

- [ ] **Step 1: Write the failing test**

```js
// src/porteria/__tests__/siembraEstado.int.test.js
// Placas B1…, ids 2900-2949.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const repoEstado = require('../repositorios/estado');
const repoEventos = require('../repositorios/eventos');
const { crearH360Lectura } = require('../services/h360Lectura.service');

let conn;
let bd;
let tanqueo;

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'B1%'`);
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2900 AND 2949`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2901, 'B1A', 'B1 A', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2901, 'B1P-001', 'Ford', 'F', 'CARROZA', 1), (2902, 'B1P002', 'Kia', 'K', 'CARROZA', 0)");
  [[{ id: tanqueo }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'TANQUEO'");
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('la migración 005 está aplicada', async () => {
  const [[col]] = await conn.query(
    "SELECT IS_NULLABLE AS nula FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_estado_vehiculo' AND COLUMN_NAME = 'sembrado_at'",
  );
  expect(col).toEqual({ nula: 'YES' });
  const [[tipo]] = await conn.query(
    "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_eventos' AND COLUMN_NAME = 'inconsistencia_tipo'",
  );
  expect(tipo.t).toContain("'SALIDA_OTRA_SEDE'");
  const [[accion]] = await conn.query(
    "SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_auditoria' AND COLUMN_NAME = 'accion'",
  );
  expect(accion.t).toContain("'SEMBRAR'");
});

test('sembrar crea la fila una sola vez y cuenta como estado', async () => {
  expect(await repoEstado.sembrar(conn, { placa: 'B1P001', sedeId: 2901 })).toBe(true);
  expect(await repoEstado.sembrar(conn, { placa: 'B1P001', sedeId: 2901 })).toBe(false);
  expect(await repoEstado.obtener(conn, 'B1P001')).toMatchObject({
    placa: 'B1P001', tipo_vehiculo: 'PROPIO', sede_id: 2901, dentro: 1, ultimo_evento_id: null,
    sembrado_at: expect.any(Date), desde: expect.any(Date),
  });
  await conn.beginTransaction();
  const bloqueada = await repoEstado.bloquear(conn, 'B1P001');
  await conn.commit();
  expect(bloqueada).toMatchObject({ sede_id: 2901, dentro: 1, sembrado_at: expect.any(Date) });
});

test('dentro de la sede incluye los sembrados como carga inicial', async () => {
  const ingreso = await repoEventos.insertar(conn, {
    sede_id: 2901, sentido: 'INGRESO', tipo_vehiculo: 'PROVEEDOR', placa: 'B1V001', motivo_id: tanqueo,
    conductor_nombre: 'Ana', conductor_otro: false, inconsistente: 0, registrado_por: 'g',
  });
  await repoEstado.bloquear(conn, 'B1V001');
  await repoEstado.guardar(conn, { placa: 'B1V001', tipo_vehiculo: 'PROVEEDOR', sede_id: 2901, dentro: 1, ultimo_evento_id: ingreso, salida_abierta_id: null });

  const dentro = (await repoEstado.dentroDeSede(conn, 2901)).filter((e) => e.placa.startsWith('B1'));
  expect(dentro.find((e) => e.placa === 'B1P001')).toEqual({
    id: null, placa: 'B1P001', tipo_vehiculo: 'PROPIO', sede_id: 2901, sentido: null, motivo: null,
    registrado_at: expect.any(Date), carga_inicial: true,
  });
  expect(dentro.find((e) => e.placa === 'B1V001')).toMatchObject({ id: ingreso, carga_inicial: false, motivo: { codigo: 'TANQUEO' } });
});

test('listarVehiculosPropios trae todos los activos, sin límite y normalizados', async () => {
  const h360 = crearH360Lectura(bd);
  const placas = (await h360.listarVehiculosPropios()).map((v) => v.placa);
  expect(placas).toContain('B1P001');
  expect(placas).not.toContain('B1P002');
});
```

En `migraciones.int.test.js`, agregar `'005_siembra_y_otra_sede.sql'` al final de la lista esperada de la primera prueba. En `repositorios.int.test.js`, en la prueba "bloquear crea la fila provisional…", el `toEqual` pasa a incluir `sembrado_at: null`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:porteria:int` → FAIL (columna `sembrado_at` inexistente; `repoEstado.sembrar is not a function`).

- [ ] **Step 3: Write the implementation**

```sql
-- src/porteria/migrations/005_siembra_y_otra_sede.sql
-- Puesta en marcha: un propio sembrado figura dentro de su sede sin haber registrado eventos.
ALTER TABLE por_estado_vehiculo ADD COLUMN sembrado_at DATETIME NULL AFTER salida_abierta_id;
-- Salida registrada en una sede distinta de donde figuraba el vehículo.
ALTER TABLE por_eventos MODIFY inconsistencia_tipo
  ENUM('INGRESO_ESTANDO_DENTRO','SALIDA_ESTANDO_FUERA','SALIDA_OTRA_SEDE') NULL;
ALTER TABLE por_auditoria MODIFY accion ENUM('CREAR','CORREGIR','ANULAR','FORZAR','SEMBRAR') NOT NULL;
```

En `src/porteria/repositorios/estado.js`:
- Cambiar el comentario de cabecera: "Una fila con ultimo_evento_id NULL y sin sembrado_at es provisional (solo existe para bloquear); con sembrado_at es una carga inicial."
- `const COLUMNAS_ESTADO = 'placa, tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id, sembrado_at';`
- Reemplazar `obtener` y `dentroDeSede`, y agregar `sembrar`:

```js
/** Carga inicial de un propio dentro de una sede. false si la placa ya tenía estado (nunca se pisa). */
async function sembrar(conn, { placa, sedeId }) {
  try {
    await conn.query(
      `INSERT INTO por_estado_vehiculo (placa, tipo_vehiculo, sede_id, dentro, sembrado_at)
       VALUES (?, 'PROPIO', ?, 1, NOW())`,
      [placa, sedeId],
    );
    return true;
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return false;
    throw err;
  }
}

async function obtener(ejecutor, placa) {
  const [[fila]] = await ejecutor.query(
    `SELECT s.placa, s.tipo_vehiculo, s.sede_id, s.dentro, s.ultimo_evento_id, s.salida_abierta_id, s.sembrado_at,
            COALESCE(e.registrado_at, s.sembrado_at) AS desde
       FROM por_estado_vehiculo s LEFT JOIN por_eventos e ON e.id = s.ultimo_evento_id
      WHERE s.placa = ? AND (s.ultimo_evento_id IS NOT NULL OR s.sembrado_at IS NOT NULL)`,
    [placa],
  );
  return fila || null;
}

async function dentroDeSede(ejecutor, sedeId) {
  const [conEvento] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${DESDE_ULTIMO_EVENTO} WHERE s.sede_id = ? AND s.dentro = 1`, [sedeId],
  );
  const [sembrados] = await ejecutor.query(
    `SELECT placa, sede_id, sembrado_at FROM por_estado_vehiculo
      WHERE sede_id = ? AND dentro = 1 AND ultimo_evento_id IS NULL AND sembrado_at IS NOT NULL`,
    [sedeId],
  );
  return [
    ...conEvento.map((f) => ({ ...eventoPublico(f), carga_inicial: false })),
    ...sembrados.map((s) => ({
      id: null, placa: s.placa, tipo_vehiculo: 'PROPIO', sede_id: s.sede_id, sentido: null, motivo: null,
      registrado_at: s.sembrado_at, carga_inicial: true,
    })),
  ].sort((a, b) => b.registrado_at - a.registrado_at);
}
```

`module.exports = { bloquear, guardar, borrar, sembrar, obtener, dentroDeSede, propiosFuera };`

En `src/porteria/services/h360Lectura.service.js`, agregar al objeto devuelto (junto a `buscarVehiculosPropios`):

```js
    /** Todos los propios activos (para la siembra de la puesta en marcha). */
    async listarVehiculosPropios() {
      const filas = await consultar(`SELECT ${COLUMNAS_VEHICULO} FROM vehiculos WHERE activo = 1 ORDER BY placa, id`);
      return filas.map(conPlacaNormalizada);
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:porteria:int` → PASS. Run: `npx jest src/porteria` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/migrations/005_siembra_y_otra_sede.sql src/porteria/repositorios/estado.js src/porteria/services/h360Lectura.service.js src/porteria/__tests__/siembraEstado.int.test.js src/porteria/__tests__/migraciones.int.test.js src/porteria/__tests__/repositorios.int.test.js
git commit -m "feat(porteria): estado sembrado para la puesta en marcha y lista completa de propios"
```

---

### Task 2: Reglas de registro y sugerencia con sembrados y salida por otra sede

**Files:**
- Modify: `src/porteria/services/eventos.service.js` (`registrar`)
- Modify: `src/porteria/services/estado.service.js` (`sugerir`)
- Test: `src/porteria/__tests__/otraSede.int.test.js`

**Interfaces:**
- Consumes: Task 1 (`bloquear` con `sembrado_at`, `sembrar`, `obtener`).
- Produces:
  - En `registrar`: `conHistoria = ultimo_evento_id !== null || sembrado_at !== null`. `otraSede = !esIngreso && dentro && estado.sede_id !== null && estado.sede_id !== sesion.sede_id`. `incoherente = (esIngreso === dentro) || otraSede`. Con `otraSede` el 409 dice `'Este vehículo figura dentro de otra sede. Para registrar la salida igual, confírmalo y escribe una observación.'` y el forzado queda `inconsistencia_tipo = 'SALIDA_OTRA_SEDE'`.
  - `errors.estado` del 409 = `{ dentro, sede_id, desde, sin_historial, otra_sede }` (`desde` = registrado_at del último evento o `sembrado_at`).
  - En `sugerir`: `estado` = `{ dentro, sede_id, desde, sembrado }` (`sembrado` = fila sembrada sin eventos).

- [ ] **Step 1: Write the failing test**

```js
// src/porteria/__tests__/otraSede.int.test.js
// Placas B2…, ids 2950-2969.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const repoEstado = require('../repositorios/estado');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');
const { crearServicioEstado } = require('../services/estado.service');

let conn;
let bd;
let eventos;
let estado;
let lavado;
const sedeA = { usuario: 'guardaA', nombre: 'A', rol: 'guarda', sede_id: 2951, sede_nombre: 'A' };
const sedeB = { usuario: 'guardaB', nombre: 'B', rol: 'guarda', sede_id: 2952, sede_nombre: 'B' };
const errorDe = (p) => p.then(() => undefined, (e) => e);
const salida = (placa, extra = {}) => ({ sentido: 'SALIDA', placa, motivo_id: lavado, conductor_otro: true, conductor_nombre: 'Pedro', ...extra });

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo']) await conn.query(`DELETE FROM ${t} WHERE placa IN ('B2P051', 'B2P052', 'B2P053')`);
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2950 AND 2969`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2951, 'B2SA', 'A', 'Cúcuta', 1), (2952, 'B2SB', 'B', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2951, 'B2P051', 'F', 'F', 'CARROZA', 1), (2952, 'B2P052', 'F', 'F', 'CARROZA', 1), (2953, 'B2P053', 'F', 'F', 'CARROZA', 1)");
  [[{ id: lavado }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'LAVADO'");
  const h360 = crearH360Lectura(bd);
  const vehiculosExternos = crearRepositorioVehiculosExternos(bd);
  const conductores = { buscar: async () => ({ conductor: null, listaCompleta: true }) };
  eventos = crearServicioEventos({ bd, h360, conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos });
  estado = crearServicioEstado({ bd, h360, vehiculosExternos });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('un propio sembrado en A: salir por A es normal; ingresar estando dentro es incoherente', async () => {
  await repoEstado.sembrar(conn, { placa: 'B2P051', sedeId: 2951 });
  expect(await estado.sugerir('B2P051')).toMatchObject({
    sentido_sugerido: 'SALIDA', estado: { dentro: true, sede_id: 2951, desde: expect.any(Date), sembrado: true },
  });
  const err = await errorDe(eventos.registrar({ ...salida('B2P051'), sentido: 'INGRESO' }, sedeA));
  expect(err).toMatchObject({ statusCode: 409, errors: { estado: { dentro: true, sede_id: 2951, sin_historial: false, otra_sede: false, desde: expect.any(Date) } } });
  const ev = await eventos.registrar(salida('B2P051'), sedeA);
  expect(ev).toMatchObject({ inconsistente: false, sede_id: 2951 });
  expect((await estado.sugerir('B2P051')).estado).toMatchObject({ dentro: false, sembrado: false });
});

test('salir por B estando dentro de A: 409 otra sede; forzado queda SALIDA_OTRA_SEDE', async () => {
  await repoEstado.sembrar(conn, { placa: 'B2P052', sedeId: 2951 });
  const err = await errorDe(eventos.registrar(salida('B2P052'), sedeB));
  expect(err).toMatchObject({
    statusCode: 409, motivo: 'SENTIDO_INCOHERENTE',
    message: 'Este vehículo figura dentro de otra sede. Para registrar la salida igual, confírmalo y escribe una observación.',
    errors: { estado: { dentro: true, sede_id: 2951, otra_sede: true } },
  });
  const ev = await eventos.registrar(salida('B2P052', { forzar: true, observaciones: 'Lo movieron sin registrar' }), sedeB);
  expect(ev).toMatchObject({ inconsistente: true, inconsistencia_tipo: 'SALIDA_OTRA_SEDE', sede_id: 2952 });
});

test('un propio sin historial ni siembra sale por cualquier sede sin marca', async () => {
  const ev = await eventos.registrar(salida('B2P053'), sedeB);
  expect(ev).toMatchObject({ inconsistente: false, inconsistencia_tipo: null });
});

test('tras un ingreso por B, salir por A es otra sede', async () => {
  await eventos.registrar({ ...salida('B2P053'), sentido: 'INGRESO' }, sedeB);
  expect(await errorDe(eventos.registrar(salida('B2P053'), sedeA))).toMatchObject({ statusCode: 409, errors: { estado: { otra_sede: true, sede_id: 2952 } } });
  expect(await eventos.registrar(salida('B2P053'), sedeB)).toMatchObject({ inconsistente: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:porteria:int` → FAIL (el ingreso de un sembrado no da 409 porque la siembra no cuenta como historial; la salida por B no da 409).

- [ ] **Step 3: Write the implementation**

En `eventos.service.js`, dentro de `registrar`, reemplazar desde `const conHistoria = …` hasta el `throw` del 409 por:

```js
      const estado = await repoEstado.bloquear(conn, entrada.placa);
      // Un vehículo sembrado en la puesta en marcha también tiene historial (figura dentro de su sede).
      const conHistoria = estado.ultimo_evento_id !== null || estado.sembrado_at !== null;
      // Sin historial, un propio está en la sede (su primer movimiento es salir) y un proveedor está fuera.
      const dentro = conHistoria ? estado.dentro === 1 : tipo === 'PROPIO';
      const esIngreso = entrada.sentido === 'INGRESO';
      // Salir por una sede distinta de la que figura: hubo movimientos sin registrar.
      const otraSede = !esIngreso && dentro && estado.sede_id !== null && estado.sede_id !== sesion.sede_id;
      const incoherente = esIngreso === dentro || otraSede;

      if (incoherente && !entrada.forzar) {
        const ultimo = estado.ultimo_evento_id !== null ? await repoEventos.obtener(conn, estado.ultimo_evento_id) : null;
        let mensaje = 'Este vehículo figura fuera. Para registrar la salida igual, confírmalo y escribe una observación.';
        if (otraSede) mensaje = 'Este vehículo figura dentro de otra sede. Para registrar la salida igual, confírmalo y escribe una observación.';
        else if (dentro) mensaje = 'Este vehículo figura dentro. Para registrar el ingreso igual, confírmalo y escribe una observación.';
        throw new PorteriaError(409, 'SENTIDO_INCOHERENTE', mensaje, {
          estado: {
            dentro,
            sede_id: estado.sede_id,
            desde: ultimo ? ultimo.registrado_at : estado.sembrado_at,
            sin_historial: !conHistoria,
            otra_sede: otraSede,
          },
        });
      }
```

y en el objeto que se inserta, la línea de `inconsistencia_tipo`:

```js
        inconsistencia_tipo: !incoherente ? null
          : otraSede ? 'SALIDA_OTRA_SEDE'
            : esIngreso ? 'INGRESO_ESTANDO_DENTRO' : 'SALIDA_ESTANDO_FUERA',
```

Nota: `estado.sembrado_at` es `null` (no `undefined`) para filas provisionales nuevas; el `desde` del 409 queda `null` sin historial, como antes.

En `estado.service.js` (`sugerir`), la línea de `estado` del objeto devuelto pasa a:

```js
      estado: estado
        ? { dentro: estado.dentro === 1, sede_id: estado.sede_id, desde: estado.desde, sembrado: estado.ultimo_evento_id === null }
        : null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:porteria:int` → PASS (también las suites de las Fases 0–2: revisa que ninguna aserción de `errors.estado` con `toEqual` se rompa; si alguna usa `toEqual` exacto, agrega `otra_sede: false`). Run: `npx jest src/porteria` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/services/eventos.service.js src/porteria/services/estado.service.js src/porteria/__tests__/otraSede.int.test.js
git commit -m "feat(porteria): los sembrados cuentan como historial y la salida por otra sede es inconsistente"
```

---

### Task 3: Propios fuera para el guarda, servicio de siembra y comando

**Files:**
- Modify: `src/porteria/routes/estado.routes.js` (`/fuera`)
- Modify: `src/porteria/__tests__/estado.routes.test.js` (prueba de `/fuera`)
- Create: `src/porteria/services/siembra.service.js`
- Create: `src/porteria/scripts/sembrar.js`
- Modify: `package.json` (script)
- Test: `src/porteria/__tests__/siembra.int.test.js`, `src/porteria/__tests__/sembrarArgs.test.js`

**Interfaces:**
- Consumes: `repoEstado.sembrar` (Task 1), `h360.listarVehiculosPropios`, `h360.obtenerSede`, `registrarAuditoria`, `conTransaccion`, `normalizarPlaca`, `ROLES`.
- Produces:
  - `GET /estado/fuera`: guarda → `estado.fuera(null)`; admin → `sedeDeConsulta(req, { todasParaAdmin: true })` como hoy.
  - `crearServicioSiembra({ bd, h360 }) → { sembrarPropios({ sedeId, placas = null, usuario }) → { sembrados: string[], omitidos: [{ placa, razon }] } }`. Sede inexistente o inactiva → `PorteriaError(404, 'SEDE_NO_ENCONTRADA', 'La sede no existe o está inactiva')`. Razones: `'ya tiene estado'`, `'no es un vehículo activo de la empresa'` (placa pedida que no está entre los propios activos).
  - `leerArgumentos(argv) → { sedeId, placas }` en `scripts/sembrar.js` (exportada): `--sede <id>` obligatorio (entero > 0), `--placas a,b` opcional (normalizadas); si falta o es inválido lanza `Error('Uso: npm run porteria:sembrar -- --sede <id> [--placas ABC123,XYZ789]')`.

- [ ] **Step 1: Write the failing tests**

En `src/porteria/__tests__/estado.routes.test.js`, reemplazar la prueba de `/fuera` por:

```js
test('fuera: el guarda ve toda la flota; el admin puede filtrar por sede', async () => {
  const prueba = crearAppPrueba();
  await get(prueba, '/fuera?sede_id=9', tokenDe({ sede: { id: 3, nombre: 'N' } }));
  expect(prueba.deps.estado.fuera).toHaveBeenLastCalledWith(null);
  await get(prueba, '/fuera', tokenDe({ rol: 'admin_porteria' }));
  expect(prueba.deps.estado.fuera).toHaveBeenLastCalledWith(null);
  await get(prueba, '/fuera?sede_id=9', tokenDe({ rol: 'admin_porteria' }));
  expect(prueba.deps.estado.fuera).toHaveBeenLastCalledWith(9);
});
```

```js
// src/porteria/__tests__/sembrarArgs.test.js
const { leerArgumentos } = require('../scripts/sembrar');

const USO = 'Uso: npm run porteria:sembrar -- --sede <id> [--placas ABC123,XYZ789]';

test('sede obligatoria y placas opcionales normalizadas', () => {
  expect(leerArgumentos(['--sede', '3'])).toEqual({ sedeId: 3, placas: null });
  expect(leerArgumentos(['--sede', '3', '--placas', 'abc-123, xyz 789'])).toEqual({ sedeId: 3, placas: ['ABC123', 'XYZ789'] });
});

test.each([[[]], [['--sede']], [['--sede', 'x']], [['--sede', '0']], [['--placas', 'A1']]])('%p → error de uso', (argv) => {
  expect(() => leerArgumentos(argv)).toThrow(USO);
});
```

```js
// src/porteria/__tests__/siembra.int.test.js
// Placas B3S…, ids 2970-2989.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearServicioSiembra } = require('../services/siembra.service');

let conn;
let bd;
let siembra;

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  await conn.query("DELETE FROM por_estado_vehiculo WHERE placa LIKE 'B3S%'");
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2970 AND 2989`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2971, 'B3S', 'B3S', 'Cúcuta', 1), (2972, 'B3SX', 'Cerrada', 'Cúcuta', 0)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2971, 'B3S-001', 'F', 'F', 'CARROZA', 1), (2972, 'B3S002', 'F', 'F', 'CARROZA', 1), (2973, 'B3S003', 'F', 'F', 'CARROZA', 0)");
  siembra = crearServicioSiembra({ bd, h360: crearH360Lectura(bd) });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('con placas: siembra las pedidas y reporta las que no son propios activos', async () => {
  const r = await siembra.sembrarPropios({ sedeId: 2971, placas: ['B3S001', 'B3S003', 'B3S999'], usuario: 'carga-inicial' });
  expect(r.sembrados).toEqual(['B3S001']);
  expect(r.omitidos).toEqual([
    { placa: 'B3S003', razon: 'no es un vehículo activo de la empresa' },
    { placa: 'B3S999', razon: 'no es un vehículo activo de la empresa' },
  ]);
  const [[fila]] = await conn.query("SELECT * FROM por_estado_vehiculo WHERE placa = 'B3S001'");
  expect(fila).toMatchObject({ tipo_vehiculo: 'PROPIO', sede_id: 2971, dentro: 1, ultimo_evento_id: null });
  const [[aud]] = await conn.query("SELECT * FROM por_auditoria WHERE accion = 'SEMBRAR' AND entidad = 'vehiculo' AND entidad_id = 2971 ORDER BY id DESC LIMIT 1");
  expect(aud).toMatchObject({ usuario: 'carga-inicial' });
  expect(aud.despues).toEqual({ placa: 'B3S001', sede_id: 2971 });
});

test('sin placas: siembra todos los propios activos sin estado y nunca pisa uno existente', async () => {
  const r = await siembra.sembrarPropios({ sedeId: 2971, usuario: 'carga-inicial' });
  expect(r.sembrados).toContain('B3S002');
  expect(r.sembrados).not.toContain('B3S001');
  expect(r.omitidos).toContainEqual({ placa: 'B3S001', razon: 'ya tiene estado' });
  const otra = await siembra.sembrarPropios({ sedeId: 2971, placas: ['B3S002'], usuario: 'x' });
  expect(otra).toEqual({ sembrados: [], omitidos: [{ placa: 'B3S002', razon: 'ya tiene estado' }] });
});

test('sede inexistente o inactiva → 404', async () => {
  await expect(siembra.sembrarPropios({ sedeId: 2972, usuario: 'x' }))
    .rejects.toMatchObject({ statusCode: 404, motivo: 'SEDE_NO_ENCONTRADA', message: 'La sede no existe o está inactiva' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/porteria/__tests__/estado.routes.test.js src/porteria/__tests__/sembrarArgs.test.js` → FAIL. Run: `npm run test:porteria:int` → FAIL (`Cannot find module '../services/siembra.service'`).

- [ ] **Step 3: Write the implementation**

En `src/porteria/routes/estado.routes.js`, agregar `const { ROLES } = require('../services/auth.service');` y reemplazar la ruta `/fuera`:

```js
  // El guarda ve toda la flota fuera (sabe qué vehículo puede llegar); el admin puede filtrar por sede de salida.
  router.get('/fuera', apiCodigo('POR-EST-002'), autenticar, aw(async (req, res) => {
    const sede = req.porUsuario.rol === ROLES.ADMIN ? sedeDeConsulta(req, { todasParaAdmin: true }) : null;
    res.json({ success: true, data: await estado.fuera(sede) });
  }));
```

```js
// src/porteria/services/siembra.service.js
// Puesta en marcha: marca como dentro de una sede a los propios activos de H360 que aún no tienen estado.
// No crea eventos y nunca pisa un estado existente; cada fila sembrada queda auditada.
const PorteriaError = require('../utils/PorteriaError');
const { conTransaccion } = require('../utils/transaccion');
const repoEstado = require('../repositorios/estado');
const { registrarAuditoria } = require('../repositorios/auditoria');

function crearServicioSiembra({ bd, h360 }) {
  async function sembrarPropios({ sedeId, placas = null, usuario }) {
    const sede = await h360.obtenerSede(sedeId);
    if (!sede) throw new PorteriaError(404, 'SEDE_NO_ENCONTRADA', 'La sede no existe o está inactiva');

    const propios = await h360.listarVehiculosPropios();
    const porPlaca = new Map(propios.map((v) => [v.placa, v]));
    const omitidos = [];
    let objetivo = propios;
    if (placas) {
      objetivo = [];
      for (const placa of placas) {
        if (porPlaca.has(placa)) objetivo.push(porPlaca.get(placa));
        else omitidos.push({ placa, razon: 'no es un vehículo activo de la empresa' });
      }
    }

    const sembrados = [];
    for (const vehiculo of objetivo) {
      const creado = await conTransaccion(bd, async (conn) => {
        if (!(await repoEstado.sembrar(conn, { placa: vehiculo.placa, sedeId: sede.id }))) return false;
        await registrarAuditoria(conn, {
          usuario, entidad: 'vehiculo', entidadId: vehiculo.id, accion: 'SEMBRAR',
          despues: { placa: vehiculo.placa, sede_id: sede.id },
        });
        return true;
      });
      if (creado) sembrados.push(vehiculo.placa);
      else omitidos.push({ placa: vehiculo.placa, razon: 'ya tiene estado' });
    }
    return { sembrados, omitidos };
  }

  return { sembrarPropios };
}

module.exports = { crearServicioSiembra };
```

```js
// src/porteria/scripts/sembrar.js
// npm run porteria:sembrar -- --sede <id> [--placas ABC123,XYZ789]
// Puesta en marcha: marca como dentro de la sede a los propios activos sin estado. Se puede correr varias veces
// (por ejemplo, una por sede con --placas) sin duplicar ni pisar estados.
const { normalizarPlaca } = require('../utils/placa');

const USO = 'Uso: npm run porteria:sembrar -- --sede <id> [--placas ABC123,XYZ789]';

function leerArgumentos(argv) {
  const valor = (nombre) => {
    const i = argv.indexOf(nombre);
    return i === -1 ? undefined : argv[i + 1];
  };
  const sede = valor('--sede');
  if (typeof sede !== 'string' || !/^\d{1,9}$/.test(sede) || Number(sede) <= 0) throw new Error(USO);
  const lista = valor('--placas');
  if (argv.includes('--placas') && typeof lista !== 'string') throw new Error(USO);
  const placas = lista === undefined ? null : lista.split(',').map(normalizarPlaca).filter(Boolean);
  return { sedeId: Number(sede), placas };
}

async function main() {
  require('dotenv').config();
  const { leerConexion } = require('../config/entorno');
  const { crearBdPerezosa } = require('../db');
  const { crearH360Lectura } = require('../services/h360Lectura.service');
  const { crearServicioSiembra } = require('../services/siembra.service');

  const { sedeId, placas } = leerArgumentos(process.argv.slice(2));
  const conexion = leerConexion();
  if (!conexion.ok) throw new Error(conexion.motivo);
  const bd = crearBdPerezosa(() => conexion.db);
  try {
    const { sembrados, omitidos } = await crearServicioSiembra({ bd, h360: crearH360Lectura(bd) })
      .sembrarPropios({ sedeId, placas, usuario: 'carga-inicial' });
    console.log(`Sembrados en la sede ${sedeId}: ${sembrados.length}${sembrados.length ? ` (${sembrados.join(', ')})` : ''}`);
    for (const { placa, razon } of omitidos) console.log(`Omitido ${placa}: ${razon}`);
  } finally {
    await bd.cerrar();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`porteria:sembrar — ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { leerArgumentos };
```

En `package.json`, después de `"porteria:migrate"`, agregar `"porteria:sembrar": "node src/porteria/scripts/sembrar.js"` (con la coma correspondiente).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/porteria` → PASS. Run: `npm run test:porteria:int` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/routes/estado.routes.js src/porteria/__tests__/estado.routes.test.js src/porteria/services/siembra.service.js src/porteria/scripts/sembrar.js src/porteria/__tests__/siembra.int.test.js src/porteria/__tests__/sembrarArgs.test.js package.json
git commit -m "feat(porteria): siembra de propios para la puesta en marcha y propios fuera para el guarda"
```

---

### Task 4: Verificación de cierre

- [ ] **Step 1:** `npx jest src/porteria src/h360/services` → PASS; `npm run test:porteria:int` → PASS dos veces seguidas; `npx jest` → solo las 3 suites de la línea base.
- [ ] **Step 2:** En `docs/superpowers/plans/2026-10-30-porteria-00-indice.md`, sección Fase 5, agregar: "Antes del piloto: `npm run porteria:migrate` (hasta 005) y `npm run porteria:sembrar -- --sede <id> [--placas …]` por sede con la flota que pernocta en cada una." Commit `docs(porteria): siembra en el checklist de despliegue`.
- [ ] **Step 3:** `superpowers:requesting-code-review` y `superpowers:verification-before-completion`.
