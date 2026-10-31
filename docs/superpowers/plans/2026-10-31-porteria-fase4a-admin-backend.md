# Portería — Fase 4a (backend de administración) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al administrador lo que necesita el front de la Fase 4b: CRUD de motivos, reporte Excel de movimientos, consulta de todas las sedes, auditoría completa de los catálogos e idempotencia del registro.

**Architecture:** Un router nuevo `/admin` (solo `admin_porteria`) monta los motivos y el reporte. Los motivos se editan con un servicio transaccional que audita cada cambio. El reporte lee `v_por_movimientos` unida a `por_eventos` con los mismos filtros que `GET /eventos` y se escribe con el escritor en streaming de ExcelJS. La migración 007 agrega `clave_cliente` (único por usuario) para que un reintento del front devuelva el evento ya creado, y la acción `ELIMINAR` a la auditoría.

**Tech Stack:** Node.js, Express 4, mysql2/promise (`.query()`), ExcelJS 4 (ya instalado), swagger-jsdoc 6, Jest 29 + supertest, MySQL 8 (docker 3308).

**Diseño de referencia:** `docs/superpowers/specs/2026-10-29-porteria-design.md` §10 (Fase 4).

## Global Constraints

- Código en `src/porteria/`. Portería nunca escribe en tablas de H360/Mantix. Siempre `.query()`, nunca `.execute()`.
- Contrato de error del módulo: `{ success:false, error:'POR-XXX-NNN', motivo, message, errors }`; éxito `{ success:true, data }`. Mensajes en español.
- Códigos de API nuevos: `POR-ADM-001` listar motivos, `POR-ADM-002` crear, `POR-ADM-003` editar, `POR-ADM-004` borrar, `POR-ADM-005` reporte Excel.
- Todo `/admin/*` exige `admin_porteria` (403 `SIN_PERMISO` para el guarda).
- Cada cambio de catálogo queda en `por_auditoria` en la misma transacción: motivos (`entidad 'motivo'`: `CREAR`, `CORREGIR`, `ELIMINAR`), vehículos de proveedor (`entidad 'vehiculo_externo'`: `CREAR`, `CORREGIR`), y el evento al que se le quita el par al anular (`entidad 'evento'`, `CORREGIR`).
- Un motivo con eventos no se borra: 409 `MOTIVO_EN_USO`, "El motivo tiene registros: inactívalo en lugar de borrarlo". El código de un motivo no se cambia.
- Reporte: máximo 50.000 filas; por encima 413 `DEMASIADOS_REGISTROS`. Excluye anulados. Hojas "Movimientos" e "Inconsistencias".
- `?sede_id=todas` solo para el admin y solo donde la consulta admite todas las sedes; en cualquier otro caso 400 "Sede inválida".
- Idempotencia: `clave_cliente` opcional, `^[A-Za-z0-9-]{8,64}$`; la misma clave del mismo usuario devuelve el evento existente sin crear otro ni validar el sentido de nuevo.
- Pruebas de integración solo contra MySQL local `*_test`: Task 1 → placas `A41…`, ids 3000–3009; Task 3 → `A43…`, 3010–3029; Task 4 → códigos de motivo `T4_…`, placa `A44…`, id 3030; Task 6 → `A46…`, 3040–3059. Cada archivo borra en su `beforeAll` solo sus filas y los motivos `T4_%` se borran también en `afterAll` (otras suites cuentan los motivos activos).
- Commits con trailer `Co-Authored-By:` del modelo que los escribe. Nunca push.

## Antes de empezar

Rama `feature/porteria` limpia. `npm run porteria:db:test`; línea base `npx jest src/porteria` y `npm run test:porteria:int` en verde (la suite completa de Mantix solo falla en las 3 suites preexistentes: afiliadoEmpresaAccess, grupoIndivII, invitacion.service).

## Mapa de archivos

| Archivo | Cambio |
|---|---|
| `src/porteria/migrations/007_admin_e_idempotencia.sql` | Nuevo: `clave_cliente` + índice único; `ELIMINAR` en auditoría |
| `src/porteria/services/detalleEvento.js` | `leerEntradaRegistro` lee `clave_cliente` |
| `src/porteria/repositorios/eventos.js` | `clave_cliente` al insertar; `obtenerPorClave`, `pareadosCon`, `condicionesListado` |
| `src/porteria/services/eventos.service.js` | Idempotencia en `registrar`; auditoría del par al anular; ctx al catálogo |
| `src/porteria/middleware/autenticacion.js` | `?sede_id=todas` |
| `src/porteria/repositorios/vehiculosExternos.js` | `crear` y `actualizar` auditados y transaccionales |
| `src/porteria/routes/vehiculosExternos.routes.js` | Pasa `ctx` al repositorio |
| `src/porteria/repositorios/motivos.js` | Funciones de administración |
| `src/porteria/services/motivosAdmin.service.js` | Nuevo: validación + transacción + auditoría |
| `src/porteria/services/reportes.service.js` | Nuevo: consulta del reporte con tope |
| `src/porteria/services/movimientosXlsx.js` | Nuevo: escritor Excel en streaming |
| `src/porteria/routes/admin.routes.js` | Nuevo: `/admin/motivos`, `/admin/reportes/movimientos.xlsx` |
| `src/porteria/routes/eventos.routes.js` | Exporta `leerFiltros` |
| `src/porteria/routes/index.js` | Monta `/admin` |
| `src/porteria/testing/appPrueba.js` | Dobles de `motivosAdmin` y `reportes` |
| `src/porteria/docs/openapi.yaml` | Nuevo: documentación de todas las rutas |
| `src/config/swagger.js` | Incluye el YAML de Portería |

---

### Task 1: Migración 007 e idempotencia del registro

**Files:**
- Create: `src/porteria/migrations/007_admin_e_idempotencia.sql`
- Modify: `src/porteria/services/detalleEvento.js` (`leerEntradaRegistro`)
- Modify: `src/porteria/repositorios/eventos.js` (`AL_REGISTRAR`, nueva `obtenerPorClave`)
- Modify: `src/porteria/services/eventos.service.js` (`registrar`)
- Test: `src/porteria/__tests__/migraciones.int.test.js`, `src/porteria/__tests__/detalleEvento.test.js`, `src/porteria/__tests__/idempotencia.int.test.js` (nuevo)

**Interfaces:**
- Produces: `repoEventos.obtenerPorClave(ejecutor, usuario, clave) → evento público | null`. `leerEntradaRegistro(body).clave_cliente: string | null`. `por_auditoria.accion` admite `'ELIMINAR'` (lo usa la Task 4).

- [ ] **Step 1: Escribir las pruebas que fallan**

En `src/porteria/__tests__/migraciones.int.test.js`, la lista esperada del primer test pasa a terminar en `'006_sede_sembrada.sql', '007_admin_e_idempotencia.sql'`, y se agrega al final del archivo:

```js
test('007: clave_cliente única por usuario y ELIMINAR en la auditoría', async () => {
  const [[col]] = await conn.query(
    `SELECT CHARACTER_MAXIMUM_LENGTH AS largo, IS_NULLABLE AS nulo FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_eventos' AND COLUMN_NAME = 'clave_cliente'`,
  );
  expect(col).toEqual({ largo: 64, nulo: 'YES' });
  const [indice] = await conn.query(
    `SELECT COLUMN_NAME AS columna, NON_UNIQUE AS noUnico FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_eventos' AND INDEX_NAME = 'uq_por_eventos_clave'
      ORDER BY SEQ_IN_INDEX`,
  );
  expect(indice).toEqual([{ columna: 'registrado_por', noUnico: 0 }, { columna: 'clave_cliente', noUnico: 0 }]);
  const [[accion]] = await conn.query(
    `SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_auditoria' AND COLUMN_NAME = 'accion'`,
  );
  expect(accion.tipo).toBe("enum('CREAR','CORREGIR','ANULAR','FORZAR','SEMBRAR','ELIMINAR')");
});
```

En `src/porteria/__tests__/detalleEvento.test.js`, dentro de `describe('leerEntradaRegistro', …)` (usa la constante `valida` y el helper `errorSync` que ya existen en el archivo):

```js
  test('clave_cliente: opcional y con formato', () => {
    expect(leerEntradaRegistro(valida).clave_cliente).toBeNull();
    expect(leerEntradaRegistro({ ...valida, clave_cliente: '' }).clave_cliente).toBeNull();
    const uuid = '3f2c9a1e-7b4d-4c2a-9e1f-0a1b2c3d4e5f';
    expect(leerEntradaRegistro({ ...valida, clave_cliente: uuid }).clave_cliente).toBe(uuid);
    for (const mala of ['corta', 'a'.repeat(65), 'con espacio 1234', 12345678, { a: 1 }]) {
      expect(errorSync(() => leerEntradaRegistro({ ...valida, clave_cliente: mala }))).toMatchObject({
        statusCode: 400, motivo: 'VALIDACION', message: 'Clave de registro inválida',
      });
    }
  });
```

Crear `src/porteria/__tests__/idempotencia.int.test.js`:

```js
// src/porteria/__tests__/idempotencia.int.test.js
// Placas A41…, ids 3000-3009.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');

let conn;
let bd;
let eventos;
let lavado;
const sesion = { usuario: 'guardaA41', nombre: 'A41', rol: 'guarda', sede_id: 3001, sede_nombre: 'A41' };
const otro = { ...sesion, usuario: 'guardaA41b' };
const salida = (placa, clave) => ({
  sentido: 'SALIDA', placa, motivo_id: lavado, conductor_otro: true, conductor_nombre: 'Pedro', clave_cliente: clave,
});
const contar = async (placa) => (await conn.query('SELECT COUNT(*) AS n FROM por_eventos WHERE placa = ?', [placa]))[0][0].n;

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'A41%'`);
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 3000 AND 3009`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (3001, 'A41S', 'A41', 'Cúcuta', 1)");
  await conn.query(
    "INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (3001, 'A41P001', 'F', 'F', 'CARROZA', 1), (3002, 'A41P002', 'F', 'F', 'CARROZA', 1), (3003, 'A41P003', 'F', 'F', 'CARROZA', 1)",
  );
  [[{ id: lavado }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'LAVADO'");
  const conductores = { buscar: async () => ({ conductor: null, listaCompleta: true }) };
  eventos = crearServicioEventos({
    bd, h360: crearH360Lectura(bd), conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos: crearRepositorioVehiculosExternos(bd),
  });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('reintentar con la misma clave devuelve el mismo evento (aunque el sentido ya no sea coherente)', async () => {
  const clave = 'a41-0000-0000-0001';
  const primero = await eventos.registrar(salida('A41P001', clave), sesion);
  // El vehículo ya figura fuera: sin la clave, una segunda salida sería SENTIDO_INCOHERENTE.
  const segundo = await eventos.registrar(salida('A41P001', clave), sesion);
  expect(segundo.id).toBe(primero.id);
  expect(await contar('A41P001')).toBe(1);
});

test('dos envíos simultáneos con la misma clave crean un solo evento', async () => {
  const clave = 'a41-0000-0000-0002';
  const [a, b] = await Promise.all([
    eventos.registrar(salida('A41P002', clave), sesion),
    eventos.registrar(salida('A41P002', clave), sesion),
  ]);
  expect(a.id).toBe(b.id);
  expect(await contar('A41P002')).toBe(1);
});

test('la clave es por usuario y sin clave no hay deduplicación', async () => {
  const clave = 'a41-0000-0000-0003';
  await eventos.registrar(salida('A41P003', clave), sesion);
  const error = await eventos.registrar(salida('A41P003', clave), otro).then(() => null, (e) => e);
  expect(error).toMatchObject({ statusCode: 409, motivo: 'SENTIDO_INCOHERENTE' });
  const [[fila]] = await conn.query("SELECT clave_cliente FROM por_eventos WHERE placa = 'A41P003'");
  expect(fila.clave_cliente).toBe(clave);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx jest src/porteria/__tests__/detalleEvento.test.js` y `npm run test:porteria:int -- migraciones idempotencia`
Expected: FAIL (`clave_cliente` es `undefined`; falta la migración 007; el segundo registro lanza `SENTIDO_INCOHERENTE`).

- [ ] **Step 3: Implementar**

Crear `src/porteria/migrations/007_admin_e_idempotencia.sql`:

```sql
-- Idempotencia del registro: el front manda una clave por registro y un reintento devuelve el evento ya creado.
ALTER TABLE por_eventos
  ADD COLUMN clave_cliente VARCHAR(64) NULL AFTER registrado_por,
  ADD UNIQUE KEY uq_por_eventos_clave (registrado_por, clave_cliente);
-- Borrado de motivos sin uso desde la administración.
ALTER TABLE por_auditoria MODIFY accion ENUM('CREAR','CORREGIR','ANULAR','FORZAR','SEMBRAR','ELIMINAR') NOT NULL;
```

En `src/porteria/services/detalleEvento.js`, antes de `function leerEntradaRegistro`:

```js
const CLAVE_CLIENTE = /^[A-Za-z0-9-]{8,64}$/;

/** Clave que el front genera por registro para que un reintento no duplique el evento. */
function claveCliente(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || !CLAVE_CLIENTE.test(valor)) throw formato('Clave de registro inválida');
  return valor;
}
```

y en el objeto que devuelve `leerEntradaRegistro` agregar `clave_cliente: claveCliente(body.clave_cliente),` después de `guardar_en_catalogo`.

En `src/porteria/repositorios/eventos.js`, `AL_REGISTRAR` termina en `'evento_par_id', 'inconsistente', 'inconsistencia_tipo', 'registrado_por', 'clave_cliente',` y se agrega (y exporta) después de `obtener`:

```js
async function obtenerPorClave(ejecutor, usuario, clave) {
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${FROM_EVENTO} WHERE e.registrado_por = ? AND e.clave_cliente = ?`, [usuario, clave],
  );
  return filas[0] ? eventoPublico(filas[0]) : null;
}
```

En `src/porteria/services/eventos.service.js`, `registrar` queda:

```js
  async function registrar(body, sesion, ctx = {}) {
    const entrada = leerEntradaRegistro(body);
    const clave = entrada.clave_cliente;
    // Un reintento de un registro que ya entró devuelve ese evento sin volver a validar el sentido.
    const previo = clave && await repoEventos.obtenerPorClave(bd.obtener(), sesion.usuario, clave);
    if (previo) return previo;
    try {
      return await registrarNuevo(entrada, sesion, ctx);
    } catch (err) {
      // Dos envíos simultáneos con la misma clave: el segundo espera el bloqueo de la placa y, al soltarlo,
      // ve el estado ya actualizado (SENTIDO_INCOHERENTE) o choca con el índice único. En ambos casos
      // devuelve el evento del primero.
      const choque = err && (err.code === 'ER_DUP_ENTRY' || err.motivo === 'SENTIDO_INCOHERENTE');
      if (clave && choque) {
        const ganador = await repoEventos.obtenerPorClave(bd.obtener(), sesion.usuario, clave);
        if (ganador) return ganador;
      }
      throw err;
    }
  }
```

donde `registrarNuevo(entrada, sesion, ctx)` es el cuerpo actual de `registrar` a partir de `const { tipo, vehiculo, externo } = await resolverVehiculo(entrada);` (sin la línea `leerEntradaRegistro`), y en el `repoEventos.insertar(conn, {…})` se agrega `clave_cliente: entrada.clave_cliente,` después de `registrado_por: sesion.usuario,`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx jest src/porteria` y `npm run test:porteria:int`
Expected: PASS todo.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/migrations/007_admin_e_idempotencia.sql src/porteria/services/detalleEvento.js src/porteria/repositorios/eventos.js src/porteria/services/eventos.service.js src/porteria/__tests__/migraciones.int.test.js src/porteria/__tests__/detalleEvento.test.js src/porteria/__tests__/idempotencia.int.test.js
git commit -m "feat(porteria): idempotencia del registro con clave_cliente (migración 007)"
```

---

### Task 2: `?sede_id=todas` para el admin

**Files:**
- Modify: `src/porteria/middleware/autenticacion.js` (`sedeDeConsulta`)
- Test: `src/porteria/__tests__/sedeDeConsulta.test.js`

**Interfaces:**
- Produces: `sedeDeConsulta(req, { todasParaAdmin: true })` devuelve `null` con `?sede_id=todas` aunque el token del admin tenga sede. La usan `GET /eventos` (ya) y el reporte (Task 6).

- [ ] **Step 1: Escribir la prueba que falla**

Agregar a `src/porteria/__tests__/sedeDeConsulta.test.js`:

```js
test('?sede_id=todas: el admin consulta todas aunque su token tenga sede', () => {
  expect(sedeDeConsulta(req(admin(2), { sede_id: 'todas' }), { todasParaAdmin: true })).toBeNull();
  expect(sedeDeConsulta(req(admin(), { sede_id: 'todas' }), { todasParaAdmin: true })).toBeNull();
});

test('?sede_id=todas donde no se admite → 400 Sede inválida; el guarda la ignora', () => {
  expect(errorDe(() => sedeDeConsulta(req(admin(2), { sede_id: 'todas' })))).toMatchObject({ statusCode: 400, message: 'Sede inválida' });
  expect(sedeDeConsulta(req(guarda(3), { sede_id: 'todas' }), { todasParaAdmin: true })).toBe(3);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest src/porteria/__tests__/sedeDeConsulta.test.js`
Expected: FAIL (`'todas'` responde 400 "Sede inválida" también con `todasParaAdmin`).

- [ ] **Step 3: Implementar**

En `sedeDeConsulta`, justo después de `const pedida = req.query && req.query.sede_id;`:

```js
  if (pedida === 'todas' && todasParaAdmin) return null;
```

(Con `todasParaAdmin` falso, `'todas'` sigue cayendo en la validación numérica → 400 "Sede inválida".)

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest src/porteria/__tests__/sedeDeConsulta.test.js src/porteria/__tests__/eventos.routes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/middleware/autenticacion.js src/porteria/__tests__/sedeDeConsulta.test.js
git commit -m "feat(porteria): el admin consulta todas las sedes con ?sede_id=todas"
```

---

### Task 3: Catálogo de proveedores (auditoría e inactivos para el admin) y auditoría del par al anular

**Files:**
- Modify: `src/porteria/repositorios/vehiculosExternos.js`
- Modify: `src/porteria/routes/vehiculosExternos.routes.js`
- Modify: `src/porteria/repositorios/eventos.js` (nueva `pareadosCon`)
- Modify: `src/porteria/services/eventos.service.js` (`idEnCatalogo`, `anular`)
- Test: `src/porteria/__tests__/vehiculosExternos.routes.test.js`, `src/porteria/__tests__/auditoriaCatalogo.int.test.js` (nuevo)

**Interfaces:**
- Consumes: `registrarAuditoria(conn, {...})`, `conTransaccion(bd, fn)`.
- Produces:
  - `vehiculosExternos.crear(datos, conn = null, ctx = {}) → id`: con `conn` escribe en esa transacción; sin `conn` abre una. Siempre audita `CREAR`.
  - `vehiculosExternos.actualizar(id, cambios, usuario, ctx = {}) → boolean`: transaccional, audita `CORREGIR` con antes/después.
  - `vehiculosExternos.obtenerPorId(id, conn = null, { bloquear = false } = {})`.
  - `repoEventos.pareadosCon(conn, id) → eventos[]` (bloqueados) cuyo `evento_par_id` es `id`.
  - `vehiculosExternos.buscar(q, { incluirInactivos = false } = {})`; `GET /vehiculos-externos?incluir_inactivos=1` lo pide solo el admin (al guarda se le ignora).
  - `ctx = { apiCodigo, ip }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `src/porteria/__tests__/vehiculosExternos.routes.test.js`:
- En el test 'buscar', la expectativa pasa a `expect(prueba.deps.vehiculosExternos.buscar).toHaveBeenCalledWith('flor', { incluirInactivos: false });` y se agrega:
  ```js
  test('incluir_inactivos solo vale para el admin', async () => {
    const prueba = crearAppPrueba();
    const buscar = async (token) => request(await servir(prueba.app)).get(`${BASE}?incluir_inactivos=1`).set('Authorization', `Bearer ${token}`);
    await buscar(guarda());
    expect(prueba.deps.vehiculosExternos.buscar).toHaveBeenLastCalledWith(undefined, { incluirInactivos: false });
    await buscar(admin());
    expect(prueba.deps.vehiculosExternos.buscar).toHaveBeenLastCalledWith(undefined, { incluirInactivos: true });
  });
  ```
- En el test 'el guarda crea; la placa se normaliza', la expectativa de `crear` pasa a
  ```js
    expect(prueba.deps.vehiculosExternos.crear).toHaveBeenCalledWith(
      { placa: 'XYZ123', tipo: 'PROVEEDOR', empresa: 'Flores', descripcion: null, usuario: 'guarda1' },
      null,
      { apiCodigo: 'POR-VEX-002', ip: expect.any(String) },
    );
  ```
- En 'el admin actualiza; inexistente → 404; sin cambios → 400', la de `actualizar` pasa a
  ```js
    expect(prueba.deps.vehiculosExternos.actualizar).toHaveBeenCalledWith(
      3, { activo: false, empresa: 'Nueva' }, 'admin1', { apiCodigo: 'POR-VEX-003', ip: expect.any(String) },
    );
  ```

Crear `src/porteria/__tests__/auditoriaCatalogo.int.test.js`:

```js
// src/porteria/__tests__/auditoriaCatalogo.int.test.js
// Placas A43…, ids 3010-3029.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');

let conn;
let bd;
let externos;
let eventos;
let lavado;
let entrega;
const sesion = { usuario: 'guardaA43', nombre: 'A43', rol: 'guarda', sede_id: 3011, sede_nombre: 'A43' };
const ctx = { apiCodigo: 'POR-TST-043', ip: '10.0.0.43' };
const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const auditoria = async (entidad, entidadId) => {
  const [filas] = await conn.query(
    'SELECT usuario, api_codigo, accion, antes, despues, ip FROM por_auditoria WHERE entidad = ? AND entidad_id = ? ORDER BY id',
    [entidad, entidadId],
  );
  return filas.map((f) => ({ ...f, antes: json(f.antes), despues: json(f.despues) }));
};

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  await conn.query("DELETE FROM por_eventos WHERE placa LIKE 'A43%'");
  await conn.query("DELETE FROM por_estado_vehiculo WHERE placa LIKE 'A43%'");
  await conn.query("DELETE FROM por_vehiculos_externos WHERE placa LIKE 'A43%'");
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 3010 AND 3029`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (3011, 'A43S', 'A43', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (3011, 'A43P001', 'F', 'F', 'CARROZA', 1)");
  [[{ id: lavado }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'LAVADO'");
  [[{ id: entrega }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'ENTREGA_MERCANCIA'");
  externos = crearRepositorioVehiculosExternos(bd);
  const conductores = { buscar: async () => ({ conductor: null, listaCompleta: true }) };
  eventos = crearServicioEventos({
    bd, h360: crearH360Lectura(bd), conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos: externos,
  });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('buscar con inactivos los incluye; sin la opción, no', async () => {
  const id = await externos.crear({ placa: 'A43X009', tipo: 'PROVEEDOR', empresa: 'Inactiva A43', usuario: 'guardaA43' }, null, ctx);
  await externos.actualizar(id, { activo: false }, 'adminA43', ctx);
  expect((await externos.buscar('A43X009')).map((v) => v.placa)).toEqual([]);
  expect((await externos.buscar('A43X009', { incluirInactivos: true })).map((v) => [v.placa, v.activo])).toEqual([['A43X009', false]]);
});

test('crear un vehículo de proveedor queda auditado', async () => {
  const id = await externos.crear({ placa: 'A43X001', tipo: 'PROVEEDOR', empresa: 'Flores', usuario: 'guardaA43' }, null, ctx);
  expect(await auditoria('vehiculo_externo', id)).toEqual([{
    usuario: 'guardaA43', api_codigo: 'POR-TST-043', accion: 'CREAR', antes: null, ip: '10.0.0.43',
    despues: expect.objectContaining({ id, placa: 'A43X001', empresa: 'Flores', activo: true }),
  }]);
});

test('editar audita antes y después; un id inexistente no audita', async () => {
  const id = await externos.crear({ placa: 'A43X002', tipo: 'PROVEEDOR', empresa: 'Vieja', usuario: 'guardaA43' }, null, ctx);
  expect(await externos.actualizar(id, { empresa: 'Nueva', activo: false }, 'adminA43', ctx)).toBe(true);
  const [, cambio] = await auditoria('vehiculo_externo', id);
  expect(cambio).toMatchObject({
    usuario: 'adminA43', accion: 'CORREGIR',
    antes: expect.objectContaining({ empresa: 'Vieja', activo: true }),
    despues: expect.objectContaining({ empresa: 'Nueva', activo: false }),
  });
  expect(await externos.actualizar(3029999, { empresa: 'X' }, 'adminA43', ctx)).toBe(false);
  expect(await auditoria('vehiculo_externo', 3029999)).toEqual([]);
});

test('guardar en el catálogo al registrar audita la creación con el código de la API', async () => {
  await eventos.registrar({
    sentido: 'INGRESO', placa: 'A43X003', tipo_vehiculo: 'PROVEEDOR', motivo_id: entrega, empresa: 'Mercancías',
    conductor_nombre: 'Luis', conductor_documento: '1090123', guardar_en_catalogo: true,
  }, sesion, { apiCodigo: 'POR-EVT-001', ip: '10.0.0.43' });
  const creado = await externos.obtenerPorPlaca('A43X003');
  expect(await auditoria('vehiculo_externo', creado.id)).toEqual([
    expect.objectContaining({ usuario: 'guardaA43', api_codigo: 'POR-EVT-001', accion: 'CREAR' }),
  ]);
});

test('anular una salida audita el ingreso al que se le quita el par', async () => {
  const datos = { placa: 'A43P001', motivo_id: lavado, conductor_otro: true, conductor_nombre: 'Pedro' };
  const salida = await eventos.registrar({ ...datos, sentido: 'SALIDA' }, sesion);
  const ingreso = await eventos.registrar({ ...datos, sentido: 'INGRESO' }, sesion);
  expect(ingreso.evento_par_id).toBe(salida.id);

  await eventos.anular(salida.id, { motivo: 'Error' }, sesion, { apiCodigo: 'POR-EVT-005', ip: '10.0.0.43' });

  const delIngreso = await auditoria('evento', ingreso.id);
  expect(delIngreso.map((a) => a.accion)).toEqual(['CREAR', 'CORREGIR']);
  expect(delIngreso[1]).toMatchObject({
    usuario: 'guardaA43', api_codigo: 'POR-EVT-005',
    antes: expect.objectContaining({ evento_par_id: salida.id }),
    despues: expect.objectContaining({ evento_par_id: null }),
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx jest src/porteria/__tests__/vehiculosExternos.routes.test.js` y `npm run test:porteria:int -- auditoriaCatalogo`
Expected: FAIL (las rutas no pasan `ctx` ni la opción de inactivos; no hay filas de auditoría de `vehiculo_externo`; falta el `CORREGIR` del ingreso).

- [ ] **Step 3: Implementar**

`src/porteria/repositorios/vehiculosExternos.js` completo:

```js
// src/porteria/repositorios/vehiculosExternos.js
// Catálogo de vehículos de proveedor para autocompletar. Las placas se guardan normalizadas.
// Cada alta y cada cambio queda en por_auditoria en la misma transacción.
const PorteriaError = require('../utils/PorteriaError');
const { patronContiene } = require('../utils/texto');
const { conTransaccion } = require('../utils/transaccion');
const { registrarAuditoria } = require('./auditoria');

const COLUMNAS = 'id, placa, tipo, empresa, descripcion, activo';
const EDITABLES = ['tipo', 'empresa', 'descripcion', 'activo'];
const ENTIDAD = 'vehiculo_externo';
const publico = (v) => (v ? { ...v, activo: v.activo === 1 } : null);

function crearRepositorioVehiculosExternos(bd) {
  const ejecutor = (conn) => conn || bd.obtener();

  async function obtenerPorId(id, conn = null, { bloquear = false } = {}) {
    const [[fila]] = await ejecutor(conn).query(
      `SELECT ${COLUMNAS} FROM por_vehiculos_externos WHERE id = ?${bloquear ? ' FOR UPDATE' : ''}`, [id],
    );
    return publico(fila);
  }

  async function insertar(conn, { placa, tipo, empresa, descripcion = null, usuario }, ctx) {
    let id;
    try {
      const [r] = await conn.query(
        'INSERT INTO por_vehiculos_externos (placa, tipo, empresa, descripcion, created_by) VALUES (?, ?, ?, ?, ?)',
        [placa, tipo, empresa, descripcion, usuario],
      );
      id = r.insertId;
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') throw new PorteriaError(409, 'PLACA_DUPLICADA', 'La placa ya está en el catálogo');
      throw err;
    }
    await registrarAuditoria(conn, {
      usuario, apiCodigo: ctx.apiCodigo, entidad: ENTIDAD, entidadId: id, accion: 'CREAR', despues: await obtenerPorId(id, conn), ip: ctx.ip,
    });
    return id;
  }

  return {
    /** Activos para autocompletar; el admin pide también los inactivos para reactivarlos. */
    async buscar(q, { incluirInactivos = false } = {}) {
      const condiciones = [];
      const params = [];
      if (!incluirInactivos) condiciones.push('activo = 1');
      if (q) {
        const patron = patronContiene(q);
        condiciones.push('(placa LIKE ? OR empresa LIKE ?)');
        params.push(patron, patron);
      }
      const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
      const [filas] = await bd.obtener().query(
        `SELECT ${COLUMNAS} FROM por_vehiculos_externos ${where} ORDER BY empresa, placa LIMIT 30`, params,
      );
      return filas.map(publico);
    },

    /** Incluye inactivos: el registro reconoce la placa aunque ya no se ofrezca para autocompletar. */
    async obtenerPorPlaca(placa, conn) {
      const [[fila]] = await ejecutor(conn).query(`SELECT ${COLUMNAS} FROM por_vehiculos_externos WHERE placa = ?`, [placa]);
      return publico(fila);
    },

    obtenerPorId,

    /** Con `conn` escribe dentro de esa transacción (el registro de un evento); sin ella abre una propia. */
    async crear(datos, conn = null, ctx = {}) {
      if (conn) return insertar(conn, datos, ctx);
      return conTransaccion(bd, (c) => insertar(c, datos, ctx));
    },

    async actualizar(id, cambios, usuario, ctx = {}) {
      const columnas = Object.keys(cambios).filter((c) => EDITABLES.includes(c));
      return conTransaccion(bd, async (conn) => {
        const antes = await obtenerPorId(id, conn, { bloquear: true });
        if (!antes) return false;
        if (columnas.length === 0) return true;
        await conn.query(
          `UPDATE por_vehiculos_externos SET ${columnas.map((c) => `${c} = ?`).join(', ')}, updated_at = NOW(), updated_by = ?
            WHERE id = ?`,
          [...columnas.map((c) => cambios[c]), usuario, id],
        );
        await registrarAuditoria(conn, {
          usuario, apiCodigo: ctx.apiCodigo, entidad: ENTIDAD, entidadId: id, accion: 'CORREGIR',
          antes, despues: await obtenerPorId(id, conn), ip: ctx.ip,
        });
        return true;
      });
    },
  };
}

module.exports = { crearRepositorioVehiculosExternos };
```

En `src/porteria/routes/vehiculosExternos.routes.js`:
- Agregar arriba, junto a `invalido`: `const ctx = (req) => ({ apiCodigo: req.porApiCodigo, ip: req.ip });`
- En el GET:
  ```js
    const incluirInactivos = req.porUsuario.rol === ROLES.ADMIN && req.query.incluir_inactivos === '1';
    res.json({ success: true, data: await vehiculosExternos.buscar(textoOpcional(req.query.q), { incluirInactivos }) });
  ```
- En el POST: `const id = await vehiculosExternos.crear({ placa, tipo: body.tipo, empresa, descripcion, usuario: req.porUsuario.usuario }, null, ctx(req));`
- En el PATCH: `if (!(await vehiculosExternos.actualizar(id, cambios, req.porUsuario.usuario, ctx(req)))) throw noExiste();`

En `src/porteria/repositorios/eventos.js`, después de `obtenerPorClave` (y exportarla):

```js
/** Ingresos que cierran el viaje del evento `id`, bloqueados: al anularlo pierden el par. */
async function pareadosCon(conn, id) {
  const [filas] = await conn.query(`SELECT ${COLUMNAS_EVENTO} ${FROM_EVENTO} WHERE e.evento_par_id = ? FOR UPDATE OF e`, [id]);
  return filas.map(eventoPublico);
}
```

En `src/porteria/services/eventos.service.js`:
- `idEnCatalogo(conn, { tipo, externo, entrada, empresa, usuario, ctx })` y dentro `vehiculosExternos.crear({ placa: entrada.placa, tipo, empresa, descripcion: null, usuario }, conn, ctx)`; en `registrarNuevo` la llamada pasa `ctx`.
- En `anular`, dentro de la transacción, reemplazar desde `await repoEventos.anular(...)` hasta el `return despues;` por:

```js
      const pareados = await repoEventos.pareadosCon(conn, id);
      await repoEventos.anular(conn, id, { usuario: sesion.usuario, motivo });
      await recalcularEstado(conn, actual.placa, fila);
      const despues = await repoEventos.obtener(conn, id);
      await registrarAuditoria(conn, {
        usuario: sesion.usuario, apiCodigo: ctx.apiCodigo, entidad: 'evento', entidadId: id, accion: 'ANULAR', antes, despues, ip: ctx.ip,
      });
      // El ingreso que cerraba este viaje queda sin par: también se audita.
      for (const previo of pareados) {
        await registrarAuditoria(conn, {
          usuario: sesion.usuario, apiCodigo: ctx.apiCodigo, entidad: 'evento', entidadId: previo.id, accion: 'CORREGIR',
          antes: previo, despues: await repoEventos.obtener(conn, previo.id), ip: ctx.ip,
        });
      }
      return despues;
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx jest src/porteria` y `npm run test:porteria:int`
Expected: PASS todo (incluidas `eventos.registrar.int`, `eventos.edicion.int` y `flujo.int`, que usan el catálogo y la anulación).

- [ ] **Step 5: Commit**

```bash
git add src/porteria/repositorios/vehiculosExternos.js src/porteria/routes/vehiculosExternos.routes.js src/porteria/repositorios/eventos.js src/porteria/services/eventos.service.js src/porteria/__tests__/vehiculosExternos.routes.test.js src/porteria/__tests__/auditoriaCatalogo.int.test.js
git commit -m "feat(porteria): auditoría del catálogo de proveedores y del par que se pierde al anular"
```

---

### Task 4: Motivos — repositorio y servicio de administración

**Files:**
- Modify: `src/porteria/repositorios/motivos.js`
- Create: `src/porteria/services/motivosAdmin.service.js`
- Test: `src/porteria/__tests__/motivosAdmin.test.js` (nuevo, validación pura), `src/porteria/__tests__/motivosAdmin.int.test.js` (nuevo)

**Interfaces:**
- Consumes: `conTransaccion`, `registrarAuditoria`, acción `ELIMINAR` (Task 1).
- Produces:
  - `leerMotivo(body, { nuevo }) → datos` (lanza 400 `VALIDACION`).
  - `crearServicioMotivosAdmin({ bd }) → { listar(), crear(body, sesion, ctx), actualizar(id, body, sesion, ctx), eliminar(id, sesion, ctx) }`.
  - Motivo de administración: `{ id, codigo, nombre, descripcion, aplica_propio, aplica_proveedor_asistencia, aplica_proveedor, aplica_ingreso, aplica_salida, tipo_referencia, referencia_obligatoria, orden, activo, en_uso, updated_at, updated_by }` con booleanos JS.
  - `eliminar` devuelve `{ id }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/porteria/__tests__/motivosAdmin.test.js`:

```js
// src/porteria/__tests__/motivosAdmin.test.js
const { leerMotivo } = require('../services/motivosAdmin.service');

const errorDe = (fn) => { try { fn(); return undefined; } catch (e) { return e; } };
const nuevo = { codigo: ' lavado_ext ', nombre: ' Lavado externo ', aplica_propio: true };

test('un motivo nuevo toma valores por defecto y normaliza el código', () => {
  expect(leerMotivo(nuevo, { nuevo: true })).toEqual({
    codigo: 'LAVADO_EXT', nombre: 'Lavado externo', descripcion: null,
    aplica_propio: true, aplica_proveedor_asistencia: false, aplica_proveedor: false,
    aplica_ingreso: true, aplica_salida: true, tipo_referencia: 'NINGUNA', referencia_obligatoria: false, orden: 0, activo: true,
  });
});

test('una edición solo trae lo que viene en el cuerpo', () => {
  expect(leerMotivo({ activo: false, orden: 15, descripcion: '' }, { nuevo: false })).toEqual({ activo: false, orden: 15, descripcion: null });
});

test.each([
  [{ ...nuevo, codigo: 'A' }, 'Código inválido (letras, números y _; de 2 a 40)'],
  [{ ...nuevo, codigo: 'CON ESPACIO' }, 'Código inválido (letras, números y _; de 2 a 40)'],
  [{ ...nuevo, nombre: '  ' }, 'Indica el nombre'],
  [{ ...nuevo, nombre: 'x'.repeat(101) }, 'El nombre es demasiado largo'],
  [{ ...nuevo, descripcion: 'x'.repeat(256) }, 'La descripción es demasiado larga'],
  [{ ...nuevo, aplica_proveedor: 'si' }, 'Valor inválido en aplica_proveedor'],
  [{ ...nuevo, tipo_referencia: 'FACTURA' }, 'Tipo de referencia inválido'],
  [{ ...nuevo, orden: 1.5 }, 'Orden inválido'],
  [{ ...nuevo, orden: 10000 }, 'Orden inválido'],
  [{ ...nuevo, aplica_propio: false }, 'Marca al menos un tipo de vehículo'],
  [{ ...nuevo, aplica_ingreso: false, aplica_salida: false }, 'Marca al menos un sentido'],
  [{ ...nuevo, referencia_obligatoria: true }, 'Un motivo sin referencia no puede exigirla'],
  [null, 'Datos inválidos'],
])('nuevo %j → 400 %s', (body, message) => {
  expect(errorDe(() => leerMotivo(body, { nuevo: true }))).toMatchObject({ statusCode: 400, motivo: 'VALIDACION', message });
});

test('en una edición el código no se cambia y debe haber cambios', () => {
  expect(errorDe(() => leerMotivo({ codigo: 'OTRO' }, { nuevo: false }))).toMatchObject({
    statusCode: 400, message: 'El código no se cambia: crea otro motivo',
  });
  expect(errorDe(() => leerMotivo({}, { nuevo: false }))).toMatchObject({ statusCode: 400, message: 'No hay cambios' });
});
```

Crear `src/porteria/__tests__/motivosAdmin.int.test.js`:

```js
// src/porteria/__tests__/motivosAdmin.int.test.js
// Motivos T4_…, placa A44…, sede 3030. Los T4_ se borran al terminar: otras suites cuentan los motivos activos.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearServicioMotivosAdmin } = require('../services/motivosAdmin.service');

let conn;
let bd;
let servicio;
const admin = { usuario: 'adminT4', rol: 'admin_porteria', sede_id: null };
const ctx = { apiCodigo: 'POR-TST-044', ip: '10.0.0.44' };
const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const errorDe = (p) => p.then(() => undefined, (e) => e);
const limpiar = async () => {
  await conn.query("DELETE e FROM por_eventos e JOIN por_motivos m ON m.id = e.motivo_id WHERE m.codigo LIKE 'T4\\_%'");
  await conn.query("DELETE FROM por_motivos WHERE codigo LIKE 'T4\\_%'");
};
const auditoria = async (id) => {
  const [filas] = await conn.query(
    "SELECT accion, usuario, api_codigo, antes, despues FROM por_auditoria WHERE entidad = 'motivo' AND entidad_id = ? ORDER BY id", [id],
  );
  return filas.map((f) => ({ ...f, antes: json(f.antes), despues: json(f.despues) }));
};

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  await limpiar();
  await conn.query('DELETE FROM sedes WHERE id = 3030');
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (3030, 'A44S', 'A44', 'Cúcuta', 1)");
  servicio = crearServicioMotivosAdmin({ bd });
});
afterAll(async () => {
  await limpiar();
  await bd.cerrar();
  await conn.end();
});

test('crear devuelve el motivo completo y lo audita', async () => {
  const creado = await servicio.crear({ codigo: 'T4_CREAR', nombre: 'Crear', aplica_proveedor: true, orden: 5, activo: false }, admin, ctx);
  expect(creado).toMatchObject({
    codigo: 'T4_CREAR', nombre: 'Crear', aplica_propio: false, aplica_proveedor: true, aplica_ingreso: true,
    tipo_referencia: 'NINGUNA', orden: 5, activo: false, en_uso: false, updated_by: 'adminT4',
  });
  expect(await auditoria(creado.id)).toEqual([
    expect.objectContaining({ accion: 'CREAR', usuario: 'adminT4', api_codigo: 'POR-TST-044', antes: null, despues: expect.objectContaining({ codigo: 'T4_CREAR' }) }),
  ]);
});

test('un código repetido → 409 CODIGO_DUPLICADO', async () => {
  await servicio.crear({ codigo: 'T4_DUP', nombre: 'Uno', aplica_propio: true, activo: false }, admin, ctx);
  expect(await errorDe(servicio.crear({ codigo: 't4_dup', nombre: 'Dos', aplica_propio: true }, admin, ctx))).toMatchObject({
    statusCode: 409, motivo: 'CODIGO_DUPLICADO', message: 'Ya existe un motivo con ese código',
  });
});

test('editar valida contra el estado guardado y audita antes y después', async () => {
  const m = await servicio.crear({ codigo: 'T4_EDITAR', nombre: 'Editar', aplica_propio: true, activo: false }, admin, ctx);
  expect(await errorDe(servicio.actualizar(m.id, { aplica_propio: false }, admin, ctx))).toMatchObject({
    statusCode: 400, message: 'Marca al menos un tipo de vehículo',
  });
  const editado = await servicio.actualizar(m.id, { nombre: 'Editado', tipo_referencia: 'TEXTO', referencia_obligatoria: true }, admin, ctx);
  expect(editado).toMatchObject({ nombre: 'Editado', tipo_referencia: 'TEXTO', referencia_obligatoria: true });
  const [, cambio] = await auditoria(m.id);
  expect(cambio).toMatchObject({ accion: 'CORREGIR', antes: expect.objectContaining({ nombre: 'Editar' }), despues: expect.objectContaining({ nombre: 'Editado' }) });
  expect(await errorDe(servicio.actualizar(3039999, { nombre: 'X' }, admin, ctx))).toMatchObject({ statusCode: 404, message: 'El motivo no existe' });
});

test('borrar: sin uso se borra y audita; con eventos → 409 MOTIVO_EN_USO', async () => {
  const libre = await servicio.crear({ codigo: 'T4_LIBRE', nombre: 'Libre', aplica_propio: true, activo: false }, admin, ctx);
  expect(await servicio.eliminar(libre.id, admin, ctx)).toEqual({ id: libre.id });
  const [quedan] = await conn.query('SELECT 1 FROM por_motivos WHERE id = ?', [libre.id]);
  expect(quedan).toEqual([]);
  expect((await auditoria(libre.id)).map((a) => a.accion)).toEqual(['CREAR', 'ELIMINAR']);

  const usado = await servicio.crear({ codigo: 'T4_USADO', nombre: 'Usado', aplica_propio: true, activo: false }, admin, ctx);
  await conn.query(
    `INSERT INTO por_eventos (sede_id, sentido, tipo_vehiculo, placa, conductor_nombre, motivo_id, registrado_por)
     VALUES (3030, 'SALIDA', 'PROPIO', 'A44P001', 'Juan', ?, 'guarda1')`, [usado.id],
  );
  expect((await servicio.listar()).find((x) => x.id === usado.id).en_uso).toBe(true);
  expect(await errorDe(servicio.eliminar(usado.id, admin, ctx))).toMatchObject({
    statusCode: 409, motivo: 'MOTIVO_EN_USO', message: 'El motivo tiene registros: inactívalo en lugar de borrarlo',
  });
});

test('listar incluye inactivos, en orden', async () => {
  const lista = await servicio.listar();
  expect(lista.length).toBeGreaterThanOrEqual(12);
  expect(lista.some((m) => m.codigo === 'T4_CREAR' && m.activo === false)).toBe(true);
  const ordenes = lista.map((m) => m.orden);
  expect([...ordenes].sort((a, b) => a - b)).toEqual(ordenes);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx jest src/porteria/__tests__/motivosAdmin.test.js` y `npm run test:porteria:int -- motivosAdmin`
Expected: FAIL ("Cannot find module '../services/motivosAdmin.service'").

- [ ] **Step 3: Implementar**

En `src/porteria/repositorios/motivos.js`, antes de `function crearRepositorioMotivos`:

```js
// ---- Administración (reciben el ejecutor: pool o conexión de la transacción) ----
const PorteriaError = require('../utils/PorteriaError');

const EDITABLES_ADMIN = [
  'nombre', 'descripcion', 'aplica_propio', 'aplica_proveedor_asistencia', 'aplica_proveedor',
  'aplica_ingreso', 'aplica_salida', 'tipo_referencia', 'referencia_obligatoria', 'orden', 'activo',
];
const COLUMNAS_ADMIN = `m.id, m.codigo, m.nombre, m.descripcion, m.aplica_propio, m.aplica_proveedor_asistencia,
  m.aplica_proveedor, m.aplica_ingreso, m.aplica_salida, m.tipo_referencia, m.referencia_obligatoria, m.orden, m.activo,
  m.updated_at, m.updated_by, EXISTS (SELECT 1 FROM por_eventos e WHERE e.motivo_id = m.id) AS en_uso`;
const motivoAdmin = (f) => ({ ...f, ...Object.fromEntries([...BOOLEANAS, 'en_uso'].map((c) => [c, Number(f[c]) === 1])) });
const ER_ROW_IS_REFERENCED_2 = 1451;

async function listarParaAdmin(ejecutor) {
  const [filas] = await ejecutor.query(`SELECT ${COLUMNAS_ADMIN} FROM por_motivos m ORDER BY m.orden, m.nombre`);
  return filas.map(motivoAdmin);
}

async function obtenerParaAdmin(ejecutor, id, { bloquear = false } = {}) {
  const [[fila]] = await ejecutor.query(
    `SELECT ${COLUMNAS_ADMIN} FROM por_motivos m WHERE m.id = ?${bloquear ? ' FOR UPDATE OF m' : ''}`, [id],
  );
  return fila ? motivoAdmin(fila) : null;
}

async function insertarMotivo(conn, datos, usuario) {
  const columnas = ['codigo', ...EDITABLES_ADMIN];
  try {
    const [r] = await conn.query(
      `INSERT INTO por_motivos (${columnas.join(', ')}, updated_by) VALUES (?)`,
      [[...columnas.map((c) => datos[c]), usuario]],
    );
    return r.insertId;
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') throw new PorteriaError(409, 'CODIGO_DUPLICADO', 'Ya existe un motivo con ese código');
    throw err;
  }
}

async function actualizarMotivo(conn, id, cambios, usuario) {
  const columnas = Object.keys(cambios).filter((c) => EDITABLES_ADMIN.includes(c));
  if (columnas.length === 0) return;
  await conn.query(
    `UPDATE por_motivos SET ${columnas.map((c) => `${c} = ?`).join(', ')}, updated_by = ? WHERE id = ?`,
    [...columnas.map((c) => cambios[c]), usuario, id],
  );
}

async function eliminarMotivo(conn, id) {
  try {
    await conn.query('DELETE FROM por_motivos WHERE id = ?', [id]);
  } catch (err) {
    if (err && err.errno === ER_ROW_IS_REFERENCED_2) throw enUso();
    throw err;
  }
}

function enUso() {
  return new PorteriaError(409, 'MOTIVO_EN_USO', 'El motivo tiene registros: inactívalo en lugar de borrarlo');
}
```

y el `module.exports` agrega `listarParaAdmin, obtenerParaAdmin, insertarMotivo, actualizarMotivo, eliminarMotivo, enUso, TIPOS_REFERENCIA: ['NINGUNA', 'ASISTENCIA', 'EXEQUIA', 'TEXTO']`. Mover el `require('../utils/PorteriaError')` al inicio del archivo, debajo del comentario de cabecera.

Crear `src/porteria/services/motivosAdmin.service.js`:

```js
// src/porteria/services/motivosAdmin.service.js
// Motivos desde la administración: validación, transacción y auditoría (entidad 'motivo').
// El código no se cambia (lo usan los reportes); un motivo con registros no se borra, se inactiva.
const PorteriaError = require('../utils/PorteriaError');
const { conTransaccion } = require('../utils/transaccion');
const { registrarAuditoria } = require('../repositorios/auditoria');
const repo = require('../repositorios/motivos');

const invalido = (message) => new PorteriaError(400, 'VALIDACION', message);
const noExiste = () => new PorteriaError(404, 'NO_ENCONTRADO', 'El motivo no existe');
const CODIGO = /^[A-Z0-9_]{2,40}$/;
const TIPOS = ['aplica_propio', 'aplica_proveedor_asistencia', 'aplica_proveedor'];
const SENTIDOS = ['aplica_ingreso', 'aplica_salida'];
const BOOLEANOS = [...TIPOS, ...SENTIDOS, 'referencia_obligatoria', 'activo'];
const POR_DEFECTO = {
  descripcion: null, aplica_propio: false, aplica_proveedor_asistencia: false, aplica_proveedor: false,
  aplica_ingreso: true, aplica_salida: true, tipo_referencia: 'NINGUNA', referencia_obligatoria: false, orden: 0, activo: true,
};

/** Reglas sobre el motivo completo (el guardado más los cambios). */
function validarCombinacion(m) {
  if (!TIPOS.some((c) => m[c])) throw invalido('Marca al menos un tipo de vehículo');
  if (!SENTIDOS.some((c) => m[c])) throw invalido('Marca al menos un sentido');
  if (m.referencia_obligatoria && m.tipo_referencia === 'NINGUNA') throw invalido('Un motivo sin referencia no puede exigirla');
}

function leerMotivo(body, { nuevo }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalido('Datos inválidos');
  const datos = {};
  if (nuevo) {
    const codigo = typeof body.codigo === 'string' ? body.codigo.trim().toUpperCase() : '';
    if (!CODIGO.test(codigo)) throw invalido('Código inválido (letras, números y _; de 2 a 40)');
    datos.codigo = codigo;
  } else if ('codigo' in body) {
    throw invalido('El código no se cambia: crea otro motivo');
  }
  if (nuevo || 'nombre' in body) {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    if (!nombre) throw invalido('Indica el nombre');
    if (nombre.length > 100) throw invalido('El nombre es demasiado largo');
    datos.nombre = nombre;
  }
  if ('descripcion' in body) {
    const d = body.descripcion;
    if (d !== null && typeof d !== 'string') throw invalido('La descripción es demasiado larga');
    const texto = d === null ? '' : d.trim();
    if (texto.length > 255) throw invalido('La descripción es demasiado larga');
    datos.descripcion = texto || null;
  }
  for (const campo of BOOLEANOS) {
    if (!(campo in body)) continue;
    if (typeof body[campo] !== 'boolean') throw invalido(`Valor inválido en ${campo}`);
    datos[campo] = body[campo];
  }
  if ('tipo_referencia' in body) {
    if (!repo.TIPOS_REFERENCIA.includes(body.tipo_referencia)) throw invalido('Tipo de referencia inválido');
    datos.tipo_referencia = body.tipo_referencia;
  }
  if ('orden' in body) {
    if (!Number.isInteger(body.orden) || body.orden < 0 || body.orden > 9999) throw invalido('Orden inválido');
    datos.orden = body.orden;
  }
  if (nuevo) {
    const completo = { ...POR_DEFECTO, ...datos };
    validarCombinacion(completo);
    return completo;
  }
  if (Object.keys(datos).length === 0) throw invalido('No hay cambios');
  return datos;
}

function crearServicioMotivosAdmin({ bd }) {
  const auditar = (conn, sesion, ctx, id, accion, antes, despues) => registrarAuditoria(conn, {
    usuario: sesion.usuario, apiCodigo: ctx.apiCodigo, entidad: 'motivo', entidadId: id, accion, antes, despues, ip: ctx.ip,
  });

  return {
    listar: () => repo.listarParaAdmin(bd.obtener()),

    async crear(body, sesion, ctx = {}) {
      const datos = leerMotivo(body, { nuevo: true });
      return conTransaccion(bd, async (conn) => {
        const id = await repo.insertarMotivo(conn, datos, sesion.usuario);
        const creado = await repo.obtenerParaAdmin(conn, id);
        await auditar(conn, sesion, ctx, id, 'CREAR', null, creado);
        return creado;
      });
    },

    async actualizar(id, body, sesion, ctx = {}) {
      const cambios = leerMotivo(body, { nuevo: false });
      return conTransaccion(bd, async (conn) => {
        const antes = await repo.obtenerParaAdmin(conn, id, { bloquear: true });
        if (!antes) throw noExiste();
        validarCombinacion({ ...antes, ...cambios });
        await repo.actualizarMotivo(conn, id, cambios, sesion.usuario);
        const despues = await repo.obtenerParaAdmin(conn, id);
        await auditar(conn, sesion, ctx, id, 'CORREGIR', antes, despues);
        return despues;
      });
    },

    async eliminar(id, sesion, ctx = {}) {
      return conTransaccion(bd, async (conn) => {
        const antes = await repo.obtenerParaAdmin(conn, id, { bloquear: true });
        if (!antes) throw noExiste();
        if (antes.en_uso) throw repo.enUso();
        await repo.eliminarMotivo(conn, id);
        await auditar(conn, sesion, ctx, id, 'ELIMINAR', antes, null);
        return { id };
      });
    },
  };
}

module.exports = { crearServicioMotivosAdmin, leerMotivo };
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx jest src/porteria` y `npm run test:porteria:int`
Expected: PASS todo (incluidas `motivos.int` y `migraciones.int`, que cuentan motivos: los `T4_` se borran al terminar).

- [ ] **Step 5: Commit**

```bash
git add src/porteria/repositorios/motivos.js src/porteria/services/motivosAdmin.service.js src/porteria/__tests__/motivosAdmin.test.js src/porteria/__tests__/motivosAdmin.int.test.js
git commit -m "feat(porteria): administración de motivos con validación y auditoría"
```

---

### Task 5: Router `/admin` con los motivos

**Files:**
- Create: `src/porteria/routes/admin.routes.js`
- Modify: `src/porteria/routes/index.js`
- Modify: `src/porteria/testing/appPrueba.js`
- Test: `src/porteria/__tests__/admin.routes.test.js` (nuevo)

**Interfaces:**
- Consumes: `crearServicioMotivosAdmin` (Task 4).
- Produces: `crearRouterAdmin({ autenticar, motivosAdmin, reportes })`; `crearRouterPorteria` acepta `motivosAdmin` y `reportes` (este lo usa la Task 6; en esta tarea el router aún no tiene la ruta del reporte). `crearAppPrueba().deps.motivosAdmin` = `{ listar, crear, actualizar, eliminar }` y `deps.reportes` = `{ movimientos }`, todos `jest.fn`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/porteria/__tests__/admin.routes.test.js`:

```js
// src/porteria/__tests__/admin.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const BASE = '/api/porteria/v1/admin';
const guarda = () => tokenDe();
const admin = () => tokenDe({ usuario: 'admin1', rol: 'admin_porteria' });
const enviar = async (prueba, metodo, ruta, token, cuerpo) => request(await servir(prueba.app))[metodo](`${BASE}${ruta}`)
  .set('Authorization', `Bearer ${token}`).send(cuerpo);
const ctx = (codigo) => ({ apiCodigo: codigo, ip: expect.any(String) });
const sesionAdmin = expect.objectContaining({ usuario: 'admin1', rol: 'admin_porteria' });

describe('motivos', () => {
  test.each([
    ['get', '/motivos', 'POR-ADM-001'],
    ['post', '/motivos', 'POR-ADM-002'],
    ['patch', '/motivos/3', 'POR-ADM-003'],
    ['delete', '/motivos/3', 'POR-ADM-004'],
  ])('%s %s: solo el admin', async (metodo, ruta, codigo) => {
    const prueba = crearAppPrueba();
    const r = await enviar(prueba, metodo, ruta, guarda(), {});
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: codigo, motivo: 'SIN_PERMISO' });
  });

  test('listar', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.motivosAdmin.listar.mockResolvedValue([{ id: 1, codigo: 'LAVADO' }]);
    const r = await enviar(prueba, 'get', '/motivos', admin());
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: [{ id: 1, codigo: 'LAVADO' }] });
  });

  test('crear → 201 con el cuerpo, la sesión y el contexto', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.motivosAdmin.crear.mockResolvedValue({ id: 9, codigo: 'NUEVO' });
    const cuerpo = { codigo: 'NUEVO', nombre: 'Nuevo', aplica_propio: true };
    const r = await enviar(prueba, 'post', '/motivos', admin(), cuerpo);
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ id: 9, codigo: 'NUEVO' });
    expect(prueba.deps.motivosAdmin.crear).toHaveBeenCalledWith(cuerpo, sesionAdmin, ctx('POR-ADM-002'));
  });

  test('editar y borrar reciben el id numérico; un id inválido → 404 sin llamar al servicio', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.motivosAdmin.actualizar.mockResolvedValue({ id: 3, activo: false });
    prueba.deps.motivosAdmin.eliminar.mockResolvedValue({ id: 4 });
    expect((await enviar(prueba, 'patch', '/motivos/3', admin(), { activo: false })).body.data).toEqual({ id: 3, activo: false });
    expect(prueba.deps.motivosAdmin.actualizar).toHaveBeenCalledWith(3, { activo: false }, sesionAdmin, ctx('POR-ADM-003'));
    expect((await enviar(prueba, 'delete', '/motivos/4', admin())).body.data).toEqual({ id: 4 });
    expect(prueba.deps.motivosAdmin.eliminar).toHaveBeenCalledWith(4, sesionAdmin, ctx('POR-ADM-004'));
    for (const malo of ['0', 'abc', '1e3']) {
      const r = await enviar(prueba, 'patch', `/motivos/${malo}`, admin(), { activo: false });
      expect(r.status).toBe(404);
      expect(r.body).toMatchObject({ motivo: 'NO_ENCONTRADO', message: 'El motivo no existe' });
    }
    expect(prueba.deps.motivosAdmin.actualizar).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest src/porteria/__tests__/admin.routes.test.js`
Expected: FAIL (404 `POR-SIS-002`: no existe `/admin`).

- [ ] **Step 3: Implementar**

Crear `src/porteria/routes/admin.routes.js`:

```js
// src/porteria/routes/admin.routes.js
// Administración (solo admin_porteria): motivos y reporte de movimientos.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { requiereRol } = require('../middleware/autenticacion');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');
const { ROLES } = require('../services/auth.service');

const ENTERO = /^\d{1,9}$/;
const ctx = (req) => ({ apiCodigo: req.porApiCodigo, ip: req.ip });
const idMotivo = (req) => {
  if (!ENTERO.test(req.params.id) || Number(req.params.id) <= 0) {
    throw new PorteriaError(404, 'NO_ENCONTRADO', 'El motivo no existe');
  }
  return Number(req.params.id);
};

function crearRouterAdmin({ autenticar, motivosAdmin }) {
  const router = express.Router();
  const soloAdmin = [autenticar, requiereRol(ROLES.ADMIN)];

  router.get('/motivos', apiCodigo('POR-ADM-001'), ...soloAdmin, aw(async (req, res) => {
    res.json({ success: true, data: await motivosAdmin.listar() });
  }));

  router.post('/motivos', apiCodigo('POR-ADM-002'), ...soloAdmin, aw(async (req, res) => {
    res.status(201).json({ success: true, data: await motivosAdmin.crear(req.body, req.porUsuario, ctx(req)) });
  }));

  router.patch('/motivos/:id', apiCodigo('POR-ADM-003'), ...soloAdmin, aw(async (req, res) => {
    res.json({ success: true, data: await motivosAdmin.actualizar(idMotivo(req), req.body, req.porUsuario, ctx(req)) });
  }));

  router.delete('/motivos/:id', apiCodigo('POR-ADM-004'), ...soloAdmin, aw(async (req, res) => {
    res.json({ success: true, data: await motivosAdmin.eliminar(idMotivo(req), req.porUsuario, ctx(req)) });
  }));

  return router;
}

module.exports = { crearRouterAdmin };
```

En `src/porteria/routes/index.js`:
- requires: `const { crearServicioMotivosAdmin } = require('../services/motivosAdmin.service');`, `const { crearServicioReportes } = require('../services/reportes.service');` (este archivo lo crea la Task 6; en esta tarea agregar solo el de motivos y el parámetro `reportes = null`), `const { crearRouterAdmin } = require('./admin.routes');`.
- parámetros de la fábrica: agregar `motivosAdmin = crearServicioMotivosAdmin({ bd }),` y `reportes = null,` después de `estado = …`.
- montaje, después de `/vehiculos-externos`: `router.use('/admin', crearRouterAdmin({ autenticar, motivosAdmin, reportes }));`
- El comentario de la fábrica agrega: "`motivosAdmin` y `reportes` se construyen desde `bd`."

En `src/porteria/testing/appPrueba.js`, dentro de `todas`, después de `estado`:

```js
    motivosAdmin: {
      listar: jest.fn(async () => []),
      crear: jest.fn(async () => ({})),
      actualizar: jest.fn(async () => ({})),
      eliminar: jest.fn(async () => ({})),
    },
    reportes: { movimientos: jest.fn(async () => []) },
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest src/porteria`
Expected: PASS todo (incluido `montaje.test.js`).

- [ ] **Step 5: Commit**

```bash
git add src/porteria/routes/admin.routes.js src/porteria/routes/index.js src/porteria/testing/appPrueba.js src/porteria/__tests__/admin.routes.test.js
git commit -m "feat(porteria): rutas /admin/motivos (solo admin)"
```

---

### Task 6: Reporte Excel de movimientos

**Files:**
- Modify: `src/porteria/repositorios/eventos.js` (extraer `condicionesListado`)
- Create: `src/porteria/services/reportes.service.js`
- Create: `src/porteria/services/movimientosXlsx.js`
- Modify: `src/porteria/routes/eventos.routes.js` (exportar `leerFiltros`)
- Modify: `src/porteria/routes/admin.routes.js`, `src/porteria/routes/index.js`
- Test: `src/porteria/__tests__/reportes.int.test.js`, `src/porteria/__tests__/movimientosXlsx.test.js`, `src/porteria/__tests__/admin.routes.test.js`

**Interfaces:**
- Consumes: `leerFiltros(query) → { filtros, pagina }` de `eventos.routes.js`; `sedeDeConsulta(req, { todasParaAdmin: true })` con `'todas'` (Task 2).
- Produces:
  - `repoEventos.condicionesListado(filtros) → { where, params }` (alias `e`).
  - `crearServicioReportes({ bd, limite = 50000 }) → { movimientos(filtros) → filas[] }` (lanza 413).
  - `escribirMovimientosXlsx(stream, filas) → Promise` (cierra el stream).
  - Fila del reporte: `{ id, fecha: 'AAAA-MM-DD HH:mm', sede_nombre, sentido, tipo_vehiculo, placa, vehiculo_marca, vehiculo_modelo, empresa, conductor_nombre, conductor_otro: boolean, motivo_nombre, referencia_codigo, referencia_texto, kilometraje, duracion_min, km_recorridos, inconsistente: boolean, inconsistencia_tipo, observaciones, registrado_por }`.
  - `GET /admin/reportes/movimientos.xlsx` (`POR-ADM-005`).

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/porteria/__tests__/reportes.int.test.js`:

```js
// src/porteria/__tests__/reportes.int.test.js
// Placas A46…, ids 3040-3059.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearServicioReportes } = require('../services/reportes.service');

let conn;
let bd;
let tanqueo;
const insertar = async (campos) => {
  const columnas = Object.keys(campos);
  const [r] = await conn.query(`INSERT INTO por_eventos (${columnas.join(', ')}) VALUES (?)`, [columnas.map((c) => campos[c])]);
  return r.insertId;
};

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  await conn.query("DELETE FROM por_eventos WHERE placa LIKE 'A46%'");
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 3040 AND 3059`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (3041, 'A46N', 'A46 Norte', 'Cúcuta', 1), (3042, 'A46S', 'A46 Sur', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (3041, 'A46P001', 'Ford', 'Transit', 'CARROZA', 1)");
  [[{ id: tanqueo }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'TANQUEO'");
  const base = { tipo_vehiculo: 'PROPIO', placa: 'A46P001', vehiculo_id: 3041, conductor_nombre: 'Juan', motivo_id: tanqueo, registrado_por: 'guarda1' };
  const salida = await insertar({ ...base, sede_id: 3041, sentido: 'SALIDA', kilometraje: 1000, registrado_at: '2026-10-20 08:00:00' });
  await insertar({ ...base, sede_id: 3042, sentido: 'INGRESO', kilometraje: 1042, evento_par_id: salida, registrado_at: '2026-10-20 09:30:00' });
  await insertar({
    ...base, sede_id: 3042, sentido: 'INGRESO', registrado_at: '2026-10-21 07:00:00',
    inconsistente: 1, inconsistencia_tipo: 'INGRESO_ESTANDO_DENTRO', observaciones: 'Llegó sin salida',
  });
  await insertar({ ...base, sede_id: 3041, sentido: 'SALIDA', registrado_at: '2026-10-21 08:00:00', anulado: 1 });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('devuelve los movimientos vigentes en orden, con viaje, observaciones y fecha local', async () => {
  const filas = await crearServicioReportes({ bd }).movimientos({ placa: 'A46P001' });
  expect(filas.map((f) => [f.fecha, f.sede_nombre, f.sentido])).toEqual([
    ['2026-10-20 08:00', 'A46 Norte', 'SALIDA'],
    ['2026-10-20 09:30', 'A46 Sur', 'INGRESO'],
    ['2026-10-21 07:00', 'A46 Sur', 'INGRESO'],
  ]);
  expect(filas[1]).toMatchObject({ duracion_min: 90, km_recorridos: 42, vehiculo_marca: 'Ford', motivo_nombre: expect.any(String), inconsistente: false, conductor_otro: false });
  expect(filas[2]).toMatchObject({ inconsistente: true, inconsistencia_tipo: 'INGRESO_ESTANDO_DENTRO', observaciones: 'Llegó sin salida' });
});

test('aplica los mismos filtros que la consulta de eventos', async () => {
  const servicio = crearServicioReportes({ bd });
  expect(await servicio.movimientos({ placa: 'A46P001', sedeId: 3041 })).toHaveLength(1);
  expect(await servicio.movimientos({ placa: 'A46P001', inconsistente: true })).toHaveLength(1);
  expect(await servicio.movimientos({ placa: 'A46P001', desde: '2026-10-21', hasta: '2026-10-21' })).toHaveLength(1);
});

test('por encima del tope → 413 DEMASIADOS_REGISTROS', async () => {
  const error = await crearServicioReportes({ bd, limite: 2 }).movimientos({ placa: 'A46P001' }).then(() => null, (e) => e);
  expect(error).toMatchObject({
    statusCode: 413, motivo: 'DEMASIADOS_REGISTROS',
    message: 'El reporte supera 2 movimientos. Acota las fechas o los filtros.',
  });
});
```

Crear `src/porteria/__tests__/movimientosXlsx.test.js`:

```js
// src/porteria/__tests__/movimientosXlsx.test.js
const { PassThrough } = require('stream');
const ExcelJS = require('exceljs');
const { escribirMovimientosXlsx } = require('../services/movimientosXlsx');

const fila = (cambios = {}) => ({
  id: 1, fecha: '2026-10-20 09:30', sede_nombre: 'Norte', sentido: 'INGRESO', tipo_vehiculo: 'PROPIO', placa: 'ABC123',
  vehiculo_marca: 'Ford', vehiculo_modelo: 'Transit', empresa: null, conductor_nombre: 'Juan', conductor_otro: false,
  motivo_nombre: 'Tanqueo', referencia_codigo: null, referencia_texto: null, kilometraje: 1042, duracion_min: 90, km_recorridos: 42,
  inconsistente: false, inconsistencia_tipo: null, observaciones: null, registrado_por: 'guarda1', ...cambios,
});

async function generar(filas) {
  const salida = new PassThrough();
  const partes = [];
  salida.on('data', (p) => partes.push(p));
  await escribirMovimientosXlsx(salida, filas);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.concat(partes));
  return libro;
}
const valores = (hoja, n) => hoja.getRow(n).values.slice(1);

test('hoja Movimientos con encabezados y valores legibles', async () => {
  const libro = await generar([fila(), fila({ id: 2, sentido: 'SALIDA', tipo_vehiculo: 'PROVEEDOR', conductor_otro: true, referencia_texto: 'Factura 9', vehiculo_marca: null, vehiculo_modelo: null })]);
  expect(libro.worksheets.map((h) => h.name)).toEqual(['Movimientos', 'Inconsistencias']);
  const hoja = libro.getWorksheet('Movimientos');
  expect(valores(hoja, 1)).toEqual([
    'Fecha', 'Sede', 'Sentido', 'Tipo', 'Placa', 'Vehículo', 'Empresa', 'Conductor', 'Motivo', 'Referencia',
    'Kilometraje', 'Duración del viaje (min)', 'Km recorridos', 'Inconsistente', 'Observaciones', 'Registrado por',
  ]);
  expect(hoja.getRow(2).getCell(1).value).toBe('2026-10-20 09:30');
  expect(hoja.getRow(2).getCell(3).value).toBe('Ingreso');
  expect(hoja.getRow(2).getCell(4).value).toBe('Propio');
  expect(hoja.getRow(2).getCell(6).value).toBe('Ford Transit');
  expect(hoja.getRow(2).getCell(12).value).toBe(90);
  expect(hoja.getRow(3).getCell(4).value).toBe('Proveedor');
  expect(hoja.getRow(3).getCell(8).value).toBe('Juan (otro)');
  expect(hoja.getRow(3).getCell(10).value).toBe('Factura 9');
  expect(hoja.rowCount).toBe(3);
});

test('hoja Inconsistencias solo con las inconsistentes', async () => {
  const libro = await generar([fila(), fila({ id: 2, inconsistente: true, inconsistencia_tipo: 'SALIDA_OTRA_SEDE', observaciones: 'Salió por Sur' })]);
  const hoja = libro.getWorksheet('Inconsistencias');
  expect(valores(hoja, 1)).toEqual(['Fecha', 'Sede', 'Placa', 'Sentido', 'Tipo de inconsistencia', 'Observaciones', 'Registrado por']);
  expect(valores(hoja, 2)).toEqual(['2026-10-20 09:30', 'Norte', 'ABC123', 'Ingreso', 'Salida por otra sede', 'Salió por Sur', 'guarda1']);
  expect(hoja.rowCount).toBe(2);
  expect(libro.getWorksheet('Movimientos').getRow(3).getCell(14).value).toBe('Sí');
});

test('sin filas genera solo los encabezados', async () => {
  const libro = await generar([]);
  expect(libro.getWorksheet('Movimientos').rowCount).toBe(1);
  expect(libro.getWorksheet('Inconsistencias').rowCount).toBe(1);
});
```

Agregar a `src/porteria/__tests__/admin.routes.test.js`:

```js
describe('reporte de movimientos', () => {
  const PorteriaError = require('../utils/PorteriaError');
  const RUTA = '/reportes/movimientos.xlsx';
  const binario = (res, cb) => {
    const partes = [];
    res.on('data', (p) => partes.push(p));
    res.on('end', () => cb(null, Buffer.concat(partes)));
  };
  const descargar = async (prueba, query, token = admin()) => request(await servir(prueba.app))
    .get(`${BASE}${RUTA}`).query(query).set('Authorization', `Bearer ${token}`).buffer(true).parse(binario);

  test('solo el admin', async () => {
    const r = await descargar(crearAppPrueba(), {}, guarda());
    expect(r.status).toBe(403);
    expect(JSON.parse(r.body.toString())).toMatchObject({ error: 'POR-ADM-005', motivo: 'SIN_PERMISO' });
  });

  test('descarga el Excel con los filtros de /eventos y todas las sedes', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.reportes.movimientos.mockResolvedValue([]);
    const r = await descargar(prueba, { sede_id: 'todas', desde: '2026-10-01', hasta: '2026-10-31', placa: 'abc-1', inconsistente: '1' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(r.headers['content-disposition']).toBe('attachment; filename="movimientos_2026-10-01_2026-10-31.xlsx"');
    expect(r.body.subarray(0, 2).toString()).toBe('PK');
    expect(prueba.deps.reportes.movimientos).toHaveBeenCalledWith({
      sedeId: null, desde: '2026-10-01', hasta: '2026-10-31', placa: 'ABC1', tipoVehiculo: undefined, motivoId: undefined, inconsistente: true,
    });
  });

  test('sin fechas el nombre lo dice; un filtro inválido → 400; el tope → 413', async () => {
    const prueba = crearAppPrueba();
    expect((await descargar(prueba, { sede_id: '7' })).headers['content-disposition'])
      .toBe('attachment; filename="movimientos_inicio_hoy.xlsx"');
    expect(prueba.deps.reportes.movimientos).toHaveBeenLastCalledWith(expect.objectContaining({ sedeId: 7 }));
    const malo = await descargar(prueba, { desde: '2026-13-01' });
    expect(malo.status).toBe(400);
    prueba.deps.reportes.movimientos.mockRejectedValue(new PorteriaError(413, 'DEMASIADOS_REGISTROS', 'El reporte supera 50000 movimientos. Acota las fechas o los filtros.'));
    const grande = await descargar(prueba, {});
    expect(grande.status).toBe(413);
    expect(JSON.parse(grande.body.toString())).toMatchObject({ error: 'POR-ADM-005', motivo: 'DEMASIADOS_REGISTROS' });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx jest src/porteria/__tests__/movimientosXlsx.test.js src/porteria/__tests__/admin.routes.test.js` y `npm run test:porteria:int -- reportes`
Expected: FAIL (faltan los módulos y la ruta).

- [ ] **Step 3: Implementar**

En `src/porteria/repositorios/eventos.js`, extraer de `listar` (y exportar):

```js
/** WHERE de la consulta de eventos (alias `e`). La comparten el listado y el reporte. */
function condicionesListado(filtros = {}) {
  const condiciones = [];
  const params = [];
  const agregar = (sql, valor) => { condiciones.push(sql); params.push(valor); };
  if (filtros.sedeId) agregar('e.sede_id = ?', filtros.sedeId);
  if (filtros.desde) agregar('e.registrado_at >= ?', `${filtros.desde} 00:00:00`);
  if (filtros.hasta) agregar('e.registrado_at < ? + INTERVAL 1 DAY', filtros.hasta);
  if (filtros.placa) agregar('e.placa LIKE ?', patronContiene(filtros.placa));
  if (filtros.tipoVehiculo) agregar('e.tipo_vehiculo = ?', filtros.tipoVehiculo);
  if (filtros.motivoId) agregar('e.motivo_id = ?', filtros.motivoId);
  if (filtros.inconsistente !== undefined) agregar('e.inconsistente = ?', filtros.inconsistente ? 1 : 0);
  return { where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', params };
}

async function listar(ejecutor, filtros = {}, { pagina = 1, porPagina = 50 } = {}) {
  const { where, params } = condicionesListado(filtros);
  const [[{ total }]] = await ejecutor.query(`SELECT COUNT(*) AS total FROM por_eventos e ${where}`, params);
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${FROM_EVENTO} ${where} ORDER BY e.registrado_at DESC, e.id DESC LIMIT ? OFFSET ?`,
    [...params, porPagina, (pagina - 1) * porPagina],
  );
  return { items: filas.map(eventoPublico), total: Number(total), pagina, por_pagina: porPagina };
}
```

Crear `src/porteria/services/reportes.service.js`:

```js
// src/porteria/services/reportes.service.js
// Datos del reporte de movimientos: la vista v_por_movimientos (vigentes, con duración y km del viaje)
// filtrada igual que GET /eventos. Con un tope de filas para no agotar la memoria del servidor.
const PorteriaError = require('../utils/PorteriaError');
const { condicionesListado } = require('../repositorios/eventos');

const LIMITE_FILAS = 50000;
const COLUMNAS = `v.id, DATE_FORMAT(v.registrado_at, '%Y-%m-%d %H:%i') AS fecha, v.sede_nombre, v.sentido, v.tipo_vehiculo,
  v.placa, v.vehiculo_marca, v.vehiculo_modelo, v.empresa, v.conductor_nombre, v.conductor_otro, v.motivo_nombre,
  v.referencia_codigo, v.referencia_texto, v.kilometraje, v.duracion_min, v.km_recorridos, v.inconsistente,
  v.inconsistencia_tipo, e.observaciones, v.registrado_por`;
const DESDE = 'FROM v_por_movimientos v JOIN por_eventos e ON e.id = v.id';

function crearServicioReportes({ bd, limite = LIMITE_FILAS }) {
  return {
    async movimientos(filtros) {
      const { where, params } = condicionesListado(filtros);
      const ejecutor = bd.obtener();
      const [[{ total }]] = await ejecutor.query(`SELECT COUNT(*) AS total ${DESDE} ${where}`, params);
      if (Number(total) > limite) {
        throw new PorteriaError(413, 'DEMASIADOS_REGISTROS', `El reporte supera ${limite} movimientos. Acota las fechas o los filtros.`);
      }
      const [filas] = await ejecutor.query(`SELECT ${COLUMNAS} ${DESDE} ${where} ORDER BY v.registrado_at, v.id`, params);
      return filas.map((f) => ({ ...f, conductor_otro: f.conductor_otro === 1, inconsistente: f.inconsistente === 1 }));
    },
  };
}

module.exports = { crearServicioReportes, LIMITE_FILAS };
```

Crear `src/porteria/services/movimientosXlsx.js`:

```js
// src/porteria/services/movimientosXlsx.js
// Escribe el reporte de movimientos en Excel directamente sobre el stream de la respuesta.
const ExcelJS = require('exceljs');

const SENTIDO = { INGRESO: 'Ingreso', SALIDA: 'Salida' };
const TIPO = { PROPIO: 'Propio', PROVEEDOR_ASISTENCIA: 'Proveedor de asistencia', PROVEEDOR: 'Proveedor' };
const INCONSISTENCIA = {
  INGRESO_ESTANDO_DENTRO: 'Ingreso estando dentro',
  SALIDA_ESTANDO_FUERA: 'Salida estando fuera',
  SALIDA_OTRA_SEDE: 'Salida por otra sede',
};

const COLUMNAS_MOVIMIENTOS = [
  { header: 'Fecha', key: 'fecha', width: 17 },
  { header: 'Sede', key: 'sede', width: 20 },
  { header: 'Sentido', key: 'sentido', width: 9 },
  { header: 'Tipo', key: 'tipo', width: 22 },
  { header: 'Placa', key: 'placa', width: 10 },
  { header: 'Vehículo', key: 'vehiculo', width: 20 },
  { header: 'Empresa', key: 'empresa', width: 22 },
  { header: 'Conductor', key: 'conductor', width: 26 },
  { header: 'Motivo', key: 'motivo', width: 26 },
  { header: 'Referencia', key: 'referencia', width: 22 },
  { header: 'Kilometraje', key: 'kilometraje', width: 12 },
  { header: 'Duración del viaje (min)', key: 'duracion_min', width: 14 },
  { header: 'Km recorridos', key: 'km_recorridos', width: 12 },
  { header: 'Inconsistente', key: 'inconsistente', width: 12 },
  { header: 'Observaciones', key: 'observaciones', width: 40 },
  { header: 'Registrado por', key: 'registrado_por', width: 18 },
];
const COLUMNAS_INCONSISTENCIAS = [
  { header: 'Fecha', key: 'fecha', width: 17 },
  { header: 'Sede', key: 'sede', width: 20 },
  { header: 'Placa', key: 'placa', width: 10 },
  { header: 'Sentido', key: 'sentido', width: 9 },
  { header: 'Tipo de inconsistencia', key: 'tipo_inconsistencia', width: 24 },
  { header: 'Observaciones', key: 'observaciones', width: 40 },
  { header: 'Registrado por', key: 'registrado_por', width: 18 },
];

function legible(f) {
  return {
    fecha: f.fecha,
    sede: f.sede_nombre,
    sentido: SENTIDO[f.sentido] || f.sentido,
    tipo: TIPO[f.tipo_vehiculo] || f.tipo_vehiculo,
    placa: f.placa,
    vehiculo: [f.vehiculo_marca, f.vehiculo_modelo].filter(Boolean).join(' ') || null,
    empresa: f.empresa,
    conductor: f.conductor_nombre ? `${f.conductor_nombre}${f.conductor_otro ? ' (otro)' : ''}` : null,
    motivo: f.motivo_nombre,
    referencia: f.referencia_codigo || f.referencia_texto || null,
    kilometraje: f.kilometraje,
    duracion_min: f.duracion_min,
    km_recorridos: f.km_recorridos,
    inconsistente: f.inconsistente ? 'Sí' : '',
    tipo_inconsistencia: INCONSISTENCIA[f.inconsistencia_tipo] || f.inconsistencia_tipo,
    observaciones: f.observaciones,
    registrado_por: f.registrado_por,
  };
}

function hoja(libro, nombre, columnas, filas) {
  const h = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  h.columns = columnas;
  h.getRow(1).font = { bold: true };
  for (const f of filas) h.addRow(legible(f)).commit();
  h.commit();
}

async function escribirMovimientosXlsx(stream, filas) {
  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  hoja(libro, 'Movimientos', COLUMNAS_MOVIMIENTOS, filas);
  hoja(libro, 'Inconsistencias', COLUMNAS_INCONSISTENCIAS, filas.filter((f) => f.inconsistente));
  await libro.commit();
}

module.exports = { escribirMovimientosXlsx };
```

En `src/porteria/routes/eventos.routes.js`: `module.exports = { crearRouterEventos, leerFiltros };`

En `src/porteria/routes/admin.routes.js`:
- requires: `const { sedeDeConsulta } = require('../middleware/autenticacion');` (junto a `requiereRol`), `const { leerFiltros } = require('./eventos.routes');`, `const { escribirMovimientosXlsx } = require('../services/movimientosXlsx');`
- la fábrica pasa a `crearRouterAdmin({ autenticar, motivosAdmin, reportes })` y, antes del `return router;`:

```js
  router.get('/reportes/movimientos.xlsx', apiCodigo('POR-ADM-005'), ...soloAdmin, aw(async (req, res) => {
    const { filtros } = leerFiltros(req.query);
    const sedeId = sedeDeConsulta(req, { todasParaAdmin: true });
    const filas = await reportes.movimientos({ sedeId, ...filtros });
    // Las fechas ya vienen validadas (AAAA-MM-DD): el nombre es seguro en la cabecera.
    const nombre = `movimientos_${filtros.desde || 'inicio'}_${filtros.hasta || 'hoy'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    await escribirMovimientosXlsx(res, filas);
  }));
```

- y el comentario de la cabecera queda "Administración (solo admin_porteria): motivos y reporte de movimientos." (ya lo dice).

En `src/porteria/routes/index.js`: el parámetro pasa a `reportes = crearServicioReportes({ bd }),` con su `require`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx jest src/porteria` y `npm run test:porteria:int`
Expected: PASS todo (incluido `eventos.routes.test.js` y `repositorios.int.test.js`, que cubren `listar`).

- [ ] **Step 5: Commit**

```bash
git add src/porteria/repositorios/eventos.js src/porteria/services/reportes.service.js src/porteria/services/movimientosXlsx.js src/porteria/routes/eventos.routes.js src/porteria/routes/admin.routes.js src/porteria/routes/index.js src/porteria/__tests__/reportes.int.test.js src/porteria/__tests__/movimientosXlsx.test.js src/porteria/__tests__/admin.routes.test.js
git commit -m "feat(porteria): reporte Excel de movimientos e inconsistencias"
```

---

### Task 7: Swagger de Portería

**Files:**
- Create: `src/porteria/docs/openapi.yaml`
- Modify: `src/config/swagger.js` (`apis`)
- Test: `src/porteria/__tests__/swagger.test.js` (nuevo)

**Interfaces:**
- Consumes: todas las rutas de `src/porteria/routes/*.js`.
- Produces: `/api-docs` muestra las rutas de Portería bajo el tag "Portería".

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/porteria/__tests__/swagger.test.js`:

```js
// src/porteria/__tests__/swagger.test.js
// Toda ruta del módulo está documentada en /api-docs.
const spec = require('../../config/swagger');

const P = '/api/porteria/v1';
const ESPERADAS = {
  [`${P}/health`]: ['get'],
  [`${P}/auth/login`]: ['post'],
  [`${P}/auth/sede`]: ['post'],
  [`${P}/auth/me`]: ['get'],
  [`${P}/catalogos/sedes`]: ['get'],
  [`${P}/catalogos/vehiculos-propios`]: ['get'],
  [`${P}/catalogos/conductores`]: ['get'],
  [`${P}/catalogos/asistencias`]: ['get'],
  [`${P}/catalogos/exequias`]: ['get'],
  [`${P}/catalogos/motivos`]: ['get'],
  [`${P}/eventos`]: ['get', 'post'],
  [`${P}/eventos/{id}`]: ['get', 'patch'],
  [`${P}/eventos/{id}/anular`]: ['post'],
  [`${P}/estado/dentro`]: ['get'],
  [`${P}/estado/fuera`]: ['get'],
  [`${P}/estado/placa/{placa}`]: ['get'],
  [`${P}/vehiculos-externos`]: ['get', 'post'],
  [`${P}/vehiculos-externos/{id}`]: ['patch'],
  [`${P}/admin/motivos`]: ['get', 'post'],
  [`${P}/admin/motivos/{id}`]: ['patch', 'delete'],
  [`${P}/admin/reportes/movimientos.xlsx`]: ['get'],
};

test('documenta cada ruta de Portería con sus métodos', () => {
  for (const [ruta, metodos] of Object.entries(ESPERADAS)) {
    expect([ruta, Object.keys(spec.paths[ruta] || {}).sort()]).toEqual([ruta, [...metodos].sort()]);
  }
  const propias = Object.keys(spec.paths).filter((r) => r.startsWith(P)).sort();
  expect(propias).toEqual(Object.keys(ESPERADAS).sort());
});

test('cada operación lleva tag, código de API y respuesta de error del módulo', () => {
  for (const ruta of Object.keys(ESPERADAS)) {
    for (const [metodo, op] of Object.entries(spec.paths[ruta])) {
      expect([ruta, metodo, op.tags]).toEqual([ruta, metodo, ['Portería']]);
      expect(op.summary).toMatch(/^POR-[A-Z]{3}-\d{3} · /);
    }
  }
  expect(spec.components.schemas.PorteriaError.required).toEqual(['success', 'error', 'motivo', 'message']);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx jest src/porteria/__tests__/swagger.test.js`
Expected: FAIL (`spec.paths['/api/porteria/v1/health']` no existe).

- [ ] **Step 3: Implementar**

En `src/config/swagger.js`, `apis` agrega `'./src/porteria/docs/*.yaml'` como último elemento.

Crear `src/porteria/docs/openapi.yaml`:

```yaml
# Documentación del módulo Portería (/api/porteria/v1). Token propio del módulo: POST /auth/login.
components:
  schemas:
    PorteriaError:
      type: object
      required: [success, error, motivo, message]
      properties:
        success: { type: boolean, example: false }
        error: { type: string, example: POR-EVT-001, description: Código de la API que respondió }
        motivo: { type: string, example: SENTIDO_INCOHERENTE }
        message: { type: string }
        errors: { type: object, nullable: true }
    Ok:
      type: object
      properties:
        success: { type: boolean, example: true }
        data: {}
    Motivo:
      type: object
      properties:
        id: { type: integer }
        codigo: { type: string, example: LAVADO }
        nombre: { type: string }
        descripcion: { type: string, nullable: true }
        aplica_propio: { type: boolean }
        aplica_proveedor_asistencia: { type: boolean }
        aplica_proveedor: { type: boolean }
        aplica_ingreso: { type: boolean }
        aplica_salida: { type: boolean }
        tipo_referencia: { type: string, enum: [NINGUNA, ASISTENCIA, EXEQUIA, TEXTO] }
        referencia_obligatoria: { type: boolean }
        orden: { type: integer, minimum: 0, maximum: 9999 }
        activo: { type: boolean }
        en_uso: { type: boolean, readOnly: true }
  parameters:
    Id: { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
    SedeConsulta: { name: sede_id, in: query, schema: { type: string }, description: "Solo admin: id de sede o 'todas'" }
    Desde: { name: desde, in: query, schema: { type: string, format: date } }
    Hasta: { name: hasta, in: query, schema: { type: string, format: date } }
    Placa: { name: placa, in: query, schema: { type: string } }
    TipoVehiculo: { name: tipo_vehiculo, in: query, schema: { type: string, enum: [PROPIO, PROVEEDOR_ASISTENCIA, PROVEEDOR] } }
    MotivoId: { name: motivo_id, in: query, schema: { type: integer } }
    Inconsistente: { name: inconsistente, in: query, schema: { type: string, enum: ['1', '0', 'true', 'false'] } }
    Q: { name: q, in: query, schema: { type: string } }
  responses:
    Ok: { description: Éxito, content: { application/json: { schema: { $ref: '#/components/schemas/Ok' } } } }
    Error: { description: Error con el contrato del módulo, content: { application/json: { schema: { $ref: '#/components/schemas/PorteriaError' } } } }

paths:
  /api/porteria/v1/health:
    get:
      tags: [Portería]
      summary: POR-SIS-001 · Estado del módulo y de su base de datos
      security: []
      responses: { '200': { $ref: '#/components/responses/Ok' }, '503': { $ref: '#/components/responses/Error' } }

  /api/porteria/v1/auth/login:
    post:
      tags: [Portería]
      summary: POR-AUT-001 · Login con usuario del AD (grupos guarda / admin_porteria)
      security: []
      requestBody:
        required: true
        content: { application/json: { schema: { type: object, required: [usuario, password], properties: { usuario: { type: string }, password: { type: string } } } } }
      responses: { '200': { $ref: '#/components/responses/Ok' }, '401': { $ref: '#/components/responses/Error' }, '429': { $ref: '#/components/responses/Error' }, '503': { $ref: '#/components/responses/Error' } }
  /api/porteria/v1/auth/sede:
    post:
      tags: [Portería]
      summary: POR-AUT-002 · Elegir la sede del turno (devuelve un token nuevo con el mismo vencimiento)
      requestBody:
        required: true
        content: { application/json: { schema: { type: object, required: [sede_id], properties: { sede_id: { type: integer } } } } }
      responses: { '200': { $ref: '#/components/responses/Ok' }, '400': { $ref: '#/components/responses/Error' }, '401': { $ref: '#/components/responses/Error' } }
  /api/porteria/v1/auth/me:
    get:
      tags: [Portería]
      summary: POR-AUT-003 · Perfil de la sesión
      responses: { '200': { $ref: '#/components/responses/Ok' }, '401': { $ref: '#/components/responses/Error' } }

  /api/porteria/v1/catalogos/sedes:
    get: { tags: [Portería], summary: POR-CAT-001 · Sedes activas de H360, responses: { '200': { $ref: '#/components/responses/Ok' } } }
  /api/porteria/v1/catalogos/vehiculos-propios:
    get: { tags: [Portería], summary: POR-CAT-002 · Buscar vehículos de la empresa, parameters: [{ $ref: '#/components/parameters/Q' }], responses: { '200': { $ref: '#/components/responses/Ok' } } }
  /api/porteria/v1/catalogos/conductores:
    get: { tags: [Portería], summary: POR-CAT-003 · Conductores (grupos del AD), responses: { '200': { $ref: '#/components/responses/Ok' } } }
  /api/porteria/v1/catalogos/asistencias:
    get: { tags: [Portería], summary: POR-CAT-004 · Buscar asistencias abiertas, parameters: [{ $ref: '#/components/parameters/Q' }], responses: { '200': { $ref: '#/components/responses/Ok' } } }
  /api/porteria/v1/catalogos/exequias:
    get:
      tags: [Portería]
      summary: POR-CAT-005 · Buscar exequias (hoy ±1 día, primero las de la placa)
      parameters: [{ $ref: '#/components/parameters/Q' }, { name: placa, in: query, schema: { type: string } }]
      responses: { '200': { $ref: '#/components/responses/Ok' } }
  /api/porteria/v1/catalogos/motivos:
    get:
      tags: [Portería]
      summary: POR-CAT-006 · Motivos activos por tipo de vehículo y sentido
      parameters: [{ $ref: '#/components/parameters/TipoVehiculo' }, { name: sentido, in: query, schema: { type: string, enum: [INGRESO, SALIDA] } }]
      responses: { '200': { $ref: '#/components/responses/Ok' }, '400': { $ref: '#/components/responses/Error' } }

  /api/porteria/v1/eventos:
    post:
      tags: [Portería]
      summary: POR-EVT-001 · Registrar un ingreso o una salida (requiere sede)
      description: >
        Con `clave_cliente` un reintento devuelve el evento ya creado. Un sentido incoherente responde 409
        SENTIDO_INCOHERENTE; con `forzar: true` y observación se guarda como inconsistente.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [sentido, placa, motivo_id]
              properties:
                sentido: { type: string, enum: [INGRESO, SALIDA] }
                placa: { type: string }
                tipo_vehiculo: { type: string, enum: [PROPIO, PROVEEDOR_ASISTENCIA, PROVEEDOR] }
                motivo_id: { type: integer }
                asistencia_id: { type: integer }
                exequia_id: { type: integer }
                referencia_texto: { type: string }
                conductor_usuario: { type: string }
                conductor_otro: { type: boolean }
                conductor_nombre: { type: string }
                conductor_documento: { type: string }
                empresa: { type: string }
                kilometraje: { type: integer }
                observaciones: { type: string }
                forzar: { type: boolean }
                guardar_en_catalogo: { type: boolean }
                clave_cliente: { type: string, pattern: '^[A-Za-z0-9-]{8,64}$' }
      responses: { '201': { $ref: '#/components/responses/Ok' }, '400': { $ref: '#/components/responses/Error' }, '403': { $ref: '#/components/responses/Error' }, '409': { $ref: '#/components/responses/Error' }, '422': { $ref: '#/components/responses/Error' } }
    get:
      tags: [Portería]
      summary: POR-EVT-002 · Consultar eventos (el guarda solo su sede), paginado de 50
      parameters:
        - { $ref: '#/components/parameters/SedeConsulta' }
        - { $ref: '#/components/parameters/Desde' }
        - { $ref: '#/components/parameters/Hasta' }
        - { $ref: '#/components/parameters/Placa' }
        - { $ref: '#/components/parameters/TipoVehiculo' }
        - { $ref: '#/components/parameters/MotivoId' }
        - { $ref: '#/components/parameters/Inconsistente' }
        - { name: pagina, in: query, schema: { type: integer, minimum: 1 } }
      responses: { '200': { $ref: '#/components/responses/Ok' }, '400': { $ref: '#/components/responses/Error' } }
  /api/porteria/v1/eventos/{id}:
    get:
      tags: [Portería]
      summary: POR-EVT-003 · Detalle de un evento
      parameters: [{ $ref: '#/components/parameters/Id' }]
      responses: { '200': { $ref: '#/components/responses/Ok' }, '404': { $ref: '#/components/responses/Error' } }
    patch:
      tags: [Portería]
      summary: POR-EVT-004 · Corregir (guarda, sus registros de los últimos 15 min; admin, cualquiera)
      parameters: [{ $ref: '#/components/parameters/Id' }]
      requestBody: { required: true, content: { application/json: { schema: { type: object } } } }
      responses: { '200': { $ref: '#/components/responses/Ok' }, '403': { $ref: '#/components/responses/Error' }, '409': { $ref: '#/components/responses/Error' } }
  /api/porteria/v1/eventos/{id}/anular:
    post:
      tags: [Portería]
      summary: POR-EVT-005 · Anular con motivo
      parameters: [{ $ref: '#/components/parameters/Id' }]
      requestBody:
        required: true
        content: { application/json: { schema: { type: object, required: [motivo], properties: { motivo: { type: string, maxLength: 255 } } } } }
      responses: { '200': { $ref: '#/components/responses/Ok' }, '403': { $ref: '#/components/responses/Error' }, '409': { $ref: '#/components/responses/Error' } }

  /api/porteria/v1/estado/dentro:
    get: { tags: [Portería], summary: POR-EST-001 · Vehículos dentro de la sede, parameters: [{ $ref: '#/components/parameters/SedeConsulta' }], responses: { '200': { $ref: '#/components/responses/Ok' } } }
  /api/porteria/v1/estado/fuera:
    get: { tags: [Portería], summary: POR-EST-002 · Vehículos propios fuera, responses: { '200': { $ref: '#/components/responses/Ok' } } }
  /api/porteria/v1/estado/placa/{placa}:
    get:
      tags: [Portería]
      summary: POR-EST-003 · Sugerencia de sentido y datos de una placa
      parameters: [{ name: placa, in: path, required: true, schema: { type: string } }]
      responses: { '200': { $ref: '#/components/responses/Ok' } }

  /api/porteria/v1/vehiculos-externos:
    get:
      tags: [Portería]
      summary: POR-VEX-001 · Buscar en el catálogo de proveedores (30 como máximo)
      parameters:
        - { $ref: '#/components/parameters/Q' }
        - { name: incluir_inactivos, in: query, schema: { type: string, enum: ['1'] }, description: Solo admin }
      responses: { '200': { $ref: '#/components/responses/Ok' } }
    post:
      tags: [Portería]
      summary: POR-VEX-002 · Agregar un vehículo de proveedor (auditado)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [placa, tipo, empresa]
              properties:
                placa: { type: string }
                tipo: { type: string, enum: [PROVEEDOR_ASISTENCIA, PROVEEDOR] }
                empresa: { type: string, maxLength: 150 }
                descripcion: { type: string, maxLength: 255 }
      responses: { '201': { $ref: '#/components/responses/Ok' }, '400': { $ref: '#/components/responses/Error' }, '409': { $ref: '#/components/responses/Error' } }
  /api/porteria/v1/vehiculos-externos/{id}:
    patch:
      tags: [Portería]
      summary: POR-VEX-003 · Editar o inactivar (solo admin, auditado)
      parameters: [{ $ref: '#/components/parameters/Id' }]
      requestBody: { required: true, content: { application/json: { schema: { type: object } } } }
      responses: { '200': { $ref: '#/components/responses/Ok' }, '403': { $ref: '#/components/responses/Error' }, '404': { $ref: '#/components/responses/Error' } }

  /api/porteria/v1/admin/motivos:
    get:
      tags: [Portería]
      summary: POR-ADM-001 · Todos los motivos, activos e inactivos (solo admin)
      responses: { '200': { $ref: '#/components/responses/Ok' }, '403': { $ref: '#/components/responses/Error' } }
    post:
      tags: [Portería]
      summary: POR-ADM-002 · Crear motivo (solo admin, auditado)
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/Motivo' } } } }
      responses: { '201': { $ref: '#/components/responses/Ok' }, '400': { $ref: '#/components/responses/Error' }, '409': { $ref: '#/components/responses/Error' } }
  /api/porteria/v1/admin/motivos/{id}:
    patch:
      tags: [Portería]
      summary: POR-ADM-003 · Editar motivo; el código no cambia (solo admin, auditado)
      parameters: [{ $ref: '#/components/parameters/Id' }]
      requestBody: { required: true, content: { application/json: { schema: { $ref: '#/components/schemas/Motivo' } } } }
      responses: { '200': { $ref: '#/components/responses/Ok' }, '400': { $ref: '#/components/responses/Error' }, '404': { $ref: '#/components/responses/Error' } }
    delete:
      tags: [Portería]
      summary: POR-ADM-004 · Borrar un motivo sin registros (con registros, 409 MOTIVO_EN_USO)
      parameters: [{ $ref: '#/components/parameters/Id' }]
      responses: { '200': { $ref: '#/components/responses/Ok' }, '404': { $ref: '#/components/responses/Error' }, '409': { $ref: '#/components/responses/Error' } }

  /api/porteria/v1/admin/reportes/movimientos.xlsx:
    get:
      tags: [Portería]
      summary: POR-ADM-005 · Excel de movimientos e inconsistencias (máx. 50.000 filas, solo admin)
      parameters:
        - { $ref: '#/components/parameters/SedeConsulta' }
        - { $ref: '#/components/parameters/Desde' }
        - { $ref: '#/components/parameters/Hasta' }
        - { $ref: '#/components/parameters/Placa' }
        - { $ref: '#/components/parameters/TipoVehiculo' }
        - { $ref: '#/components/parameters/MotivoId' }
        - { $ref: '#/components/parameters/Inconsistente' }
      responses:
        '200':
          description: Archivo Excel
          content: { application/vnd.openxmlformats-officedocument.spreadsheetml.sheet: { schema: { type: string, format: binary } } }
        '400': { $ref: '#/components/responses/Error' }
        '403': { $ref: '#/components/responses/Error' }
        '413': { $ref: '#/components/responses/Error' }
```

Nota: las rutas de Mantix comparten el `security: bearerAuth` global; el token de Portería es otro JWT pero se envía igual (`Authorization: Bearer`). Si swagger-jsdoc no mezcla el archivo (prueba en rojo por `paths` vacíos), verificar con `node -e "console.log(Object.keys(require('./src/config/swagger').paths).filter(p=>p.includes('porteria')))"` que el patrón `./src/porteria/docs/*.yaml` se resuelve desde la raíz del repo (los demás patrones también son relativos a la raíz).

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx jest src/porteria/__tests__/swagger.test.js` y luego `npx jest` completo
Expected: PASS; en la suite completa solo fallan las 3 suites preexistentes.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/docs/openapi.yaml src/config/swagger.js src/porteria/__tests__/swagger.test.js
git commit -m "docs(porteria): rutas del módulo en Swagger (/api-docs)"
```

---

## Verificación final

- `npx jest src/porteria` y `npm run test:porteria:int` en verde.
- `npx jest` completo: solo las 3 suites preexistentes fallan.
- `git log --oneline` muestra los 7 commits; `git status` limpio. Sin push.
