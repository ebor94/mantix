# Portería — Fase 2 (registro de ingresos y salidas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el guarda registre ingresos y salidas de vehículos con todas las reglas del diseño (§7), que el sistema sepa en todo momento qué vehículo está dentro o fuera, y que los registros se puedan corregir o anular con auditoría.

**Architecture:** Cada registro corre en una transacción del pool propio: se bloquea la fila de estado de la placa (con una fila provisional si es la primera vez), se valida la coherencia del sentido, se inserta el evento, se actualiza el estado y se escribe la auditoría. Los datos de H360 (vehículo, asistencia, exequia) y del AD (conductor) se validan antes de abrir la transacción. Repositorios de funciones que reciben la conexión de la transacción; servicios `eventos` y `estado` inyectables; rutas `/eventos`, `/estado` y `/vehiculos-externos`.

**Tech Stack:** Node.js, Express 4, mysql2/promise (siempre `.query()`), Jest 29 + supertest, MySQL 8 (docker, puerto 3308).

**Diseño de referencia:** `docs/superpowers/specs/2026-10-29-porteria-design.md` (§6 modelo, §7 reglas, §8 API). Pendientes heredados: `docs/superpowers/plans/2026-10-30-porteria-00-indice.md` (sección Fase 2).

## Decisiones tomadas en este plan

1. **Vehículo sin historial:** un PROPIO se toma como *dentro* (su primer registro esperado es una salida); un proveedor, como *fuera*.
2. **Conductor de vehículo propio que no está en la lista del AD:** si la lista está completa → 422 "elige 'otro'". Si el AD no respondió del todo → se acepta el usuario con el nombre que envía el front (nunca se bloquea la portería).
3. **Lecturas de H360 antes de la transacción:** vehículo, asistencia, exequia y conductor se validan con el pool, antes de abrir la transacción. Se acepta la ventana entre validar e insertar (el snapshot guarda lo que se validó).
4. **Corrección:** solo se revalida lo que cambia. Si no cambian motivo ni referencia, no se vuelve a consultar H360 (una asistencia ya cerrada no impide corregir el kilometraje); igual con el conductor.
5. **Orden de bloqueo:** registrar y anular bloquean primero la fila de estado de la placa y después el evento; corregir solo bloquea el evento. Así no hay ciclos.
6. **Pareo de viajes:** solo los vehículos PROPIOS dejan una salida abierta; su siguiente ingreso se enlaza con ella sin importar la sede.
7. **Consultas por sede:** el guarda siempre consulta su sede (la del token); el admin usa `?sede_id=`, si no la de su token, y en listados sin ninguna de las dos ve todas las sedes.
8. **Catálogo de proveedores:** la búsqueda excluye inactivos; el registro reconoce la placa aunque esté inactiva (no se duplica).
9. **Paginación de `/eventos`:** 50 por página, parámetro `pagina`.

## Global Constraints

- Código en `src/porteria/`. Portería nunca escribe en tablas de H360/Mantix (`h360Lectura.service.js` solo hace SELECT).
- Mensajes al usuario en español. Contrato: `{ success:false, error:'POR-XXX-NNN', motivo, message, errors? }` / `{ success:true, data }`. Toda ruta empieza con `apiCodigo('POR-…')`.
- La hora la pone el servidor (`DEFAULT CURRENT_TIMESTAMP`, `NOW()`); el cliente nunca envía fechas de registro.
- Nunca `DELETE` de eventos: se anulan. La fila de estado sí se borra si la placa queda sin eventos vigentes (es derivada).
- Placa normalizada (mayúsculas, sin espacios ni guiones) en todo `por_*`. Una placa que normaliza a vacío es 400.
- Siempre `.query()` de mysql2, nunca `.execute()` (los `IN (?)` con arrays).
- Registrar exige sede en el token (`requiereSede`); el evento queda en la sede del token.
- Incoherencia de sentido: 409 `SENTIDO_INCOHERENTE`; con `forzar: true` y observación se registra con `inconsistente = 1`. Nunca se bloquea la portería por datos viejos.
- Corregir/anular: el guarda solo los suyos de los últimos 15 minutos (hora del servidor); el admin cualquiera. Todo queda en `por_auditoria`.
- Pruebas de integración solo contra MySQL local, base `*_test`. Cada archivo usa su propio rango de ids y su prefijo de placas.
- Commits con trailer `Co-Authored-By:` del modelo que los escribe.

## Antes de empezar

1. Rama `feature/porteria` en `/Users/Shared/Files From c.localized/apps/mantix/mantix-git`, sin cambios pendientes.
2. `npm run porteria:db:test` (contenedor arriba).
3. Línea base: `npx jest` → solo fallan `tests/afiliadoEmpresaAccess.test.js`, `test/grupoIndivII.test.js`, `tests/invitacion.service.test.js`.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/porteria/migrations/004_estado_provisional.sql` | Columnas de `por_estado_vehiculo` admiten la fila "sin eventos" |
| `src/porteria/utils/transaccion.js` | `conTransaccion(bd, fn)` con un reintento ante deadlock |
| `src/porteria/repositorios/eventos.js` | Insertar, leer, listar, corregir y anular `por_eventos` |
| `src/porteria/repositorios/estado.js` | Bloquear/guardar/borrar `por_estado_vehiculo`; vehículos dentro y propios fuera |
| `src/porteria/repositorios/auditoria.js` | `registrarAuditoria` |
| `src/porteria/repositorios/vehiculosExternos.js` | Catálogo de proveedores |
| `src/porteria/repositorios/motivos.js` (mod.) | + `obtener(id)`, `aplica(motivo, tipo, sentido)` |
| `src/porteria/services/conductores.service.js` (mod.) | + `buscar(usuario) → { conductor, listaCompleta }` |
| `src/porteria/middleware/autenticacion.js` (mod.) | + `sedeDeConsulta(req, opciones)` |
| `src/porteria/services/detalleEvento.js` | Validación de entrada y resolución de motivo, referencia y conductor |
| `src/porteria/services/eventos.service.js` | `registrar`, `corregir`, `anular`, `listar`, `obtener` |
| `src/porteria/services/estado.service.js` | `sugerir(placa)`, `dentro(sedeId)`, `fuera(sedeId)` |
| `src/porteria/utils/texto.js` (mod.) | + `textoOpcional` (movido desde catálogos) |
| `src/porteria/routes/eventos.routes.js` | `/eventos` |
| `src/porteria/routes/estado.routes.js` | `/estado` |
| `src/porteria/routes/vehiculosExternos.routes.js` | `/vehiculos-externos` |
| `src/porteria/routes/index.js` (mod.) | Monta las rutas y construye los servicios |
| `src/porteria/testing/appPrueba.js` (mod.) | Fakes de los servicios nuevos |

Códigos de API nuevos: `POR-EVT-001` registrar, `POR-EVT-002` listar, `POR-EVT-003` detalle, `POR-EVT-004` corregir, `POR-EVT-005` anular, `POR-EST-001` dentro, `POR-EST-002` fuera, `POR-EST-003` placa, `POR-VEX-001` buscar, `POR-VEX-002` crear, `POR-VEX-003` actualizar.

Rangos de pruebas de integración (ids de sedes/vehículos/asistencias y prefijo de placa): Task 2 → 2200–2299 y `R2`; Task 5 → 2500–2599 y `E5`; Task 6 → 2600–2699 y `E6`; Task 7 → 2700–2799 y `S7`; Task 8 → 2800–2899 y `F8`.

---

### Task 1: Migración 004 y transacciones

**Files:**
- Create: `src/porteria/migrations/004_estado_provisional.sql`
- Create: `src/porteria/utils/transaccion.js`
- Modify: `src/porteria/__tests__/migraciones.int.test.js` (lista de migraciones + prueba nueva)
- Test: `src/porteria/__tests__/transaccion.test.js`

**Interfaces:**
- Produces: `conTransaccion(bd: { obtener() → Pool }, fn: (conn) => Promise<T>, { reintentos = 1 } = {}) → Promise<T>`. Abre conexión, `beginTransaction`, `fn(conn)`, `commit`; ante error `rollback` y relanza; si el error es deadlock (`errno 1213`) reintenta con conexión nueva hasta `reintentos` veces; siempre `release`.
- `por_estado_vehiculo.tipo_vehiculo`, `.sede_id`, `.ultimo_evento_id` pasan a NULL-ables. Una fila con `ultimo_evento_id IS NULL` es "provisional" (sin eventos).

- [ ] **Step 1: Write the failing tests**

```js
// src/porteria/__tests__/transaccion.test.js
const { conTransaccion } = require('../utils/transaccion');

function bdFalsa() {
  const conexiones = [];
  return {
    conexiones,
    obtener: () => ({
      getConnection: async () => {
        const c = {
          beginTransaction: jest.fn(async () => {}),
          commit: jest.fn(async () => {}),
          rollback: jest.fn(async () => {}),
          release: jest.fn(),
        };
        conexiones.push(c);
        return c;
      },
    }),
  };
}
const deadlock = () => Object.assign(new Error('Deadlock found'), { errno: 1213 });

test('confirma, devuelve el resultado y libera la conexión', async () => {
  const bd = bdFalsa();
  await expect(conTransaccion(bd, async () => 42)).resolves.toBe(42);
  const [c] = bd.conexiones;
  expect(c.beginTransaction).toHaveBeenCalled();
  expect(c.commit).toHaveBeenCalled();
  expect(c.rollback).not.toHaveBeenCalled();
  expect(c.release).toHaveBeenCalled();
});

test('ante un error revierte, libera y relanza', async () => {
  const bd = bdFalsa();
  await expect(conTransaccion(bd, async () => { throw new Error('falla'); })).rejects.toThrow('falla');
  const [c] = bd.conexiones;
  expect(c.rollback).toHaveBeenCalled();
  expect(c.commit).not.toHaveBeenCalled();
  expect(c.release).toHaveBeenCalled();
  expect(bd.conexiones).toHaveLength(1);
});

test('un deadlock se reintenta una vez con otra conexión', async () => {
  const bd = bdFalsa();
  let intentos = 0;
  const resultado = await conTransaccion(bd, async () => {
    intentos += 1;
    if (intentos === 1) throw deadlock();
    return 'ok';
  });
  expect(resultado).toBe('ok');
  expect(bd.conexiones).toHaveLength(2);
  expect(bd.conexiones.every((c) => c.release.mock.calls.length === 1)).toBe(true);
});

test('un segundo deadlock se relanza', async () => {
  const bd = bdFalsa();
  await expect(conTransaccion(bd, async () => { throw deadlock(); })).rejects.toMatchObject({ errno: 1213 });
  expect(bd.conexiones).toHaveLength(2);
});
```

En `src/porteria/__tests__/migraciones.int.test.js`, en la primera prueba, la lista esperada pasa a:

```js
  expect(filas.map((f) => f.nombre)).toEqual([
    '001_esquema.sql', '002_seed_motivos.sql', '003_vista_movimientos.sql', '004_estado_provisional.sql',
  ]);
```

y al final del archivo se agrega:

```js
test('por_estado_vehiculo admite la fila provisional (sin eventos)', async () => {
  const [columnas] = await conn.query(
    `SELECT COLUMN_NAME AS columna, IS_NULLABLE AS nula FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'por_estado_vehiculo'
        AND COLUMN_NAME IN ('tipo_vehiculo', 'sede_id', 'ultimo_evento_id') ORDER BY COLUMN_NAME`,
  );
  expect(columnas).toEqual([
    { columna: 'sede_id', nula: 'YES' },
    { columna: 'tipo_vehiculo', nula: 'YES' },
    { columna: 'ultimo_evento_id', nula: 'YES' },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/porteria/__tests__/transaccion.test.js` → FAIL (`Cannot find module '../utils/transaccion'`).
Run: `npm run test:porteria:int` → FAIL en `migraciones.int.test.js` (falta `004_estado_provisional.sql`).

- [ ] **Step 3: Write minimal implementation**

```sql
-- src/porteria/migrations/004_estado_provisional.sql
-- Fila provisional de estado: antes del primer evento de una placa se inserta una fila "sin eventos"
-- (ultimo_evento_id NULL) para bloquearla con FOR UPDATE. Un FOR UPDATE sobre una fila inexistente solo
-- toma un gap lock, que no serializa dos primeros registros simultáneos de la misma placa.
ALTER TABLE por_estado_vehiculo
  MODIFY tipo_vehiculo ENUM('PROPIO','PROVEEDOR_ASISTENCIA','PROVEEDOR') NULL,
  MODIFY sede_id INT NULL,
  MODIFY ultimo_evento_id INT NULL;
```

```js
// src/porteria/utils/transaccion.js
// Transacción sobre una conexión del pool del módulo. Un deadlock se reintenta: con dos registros
// simultáneos de la misma placa InnoDB puede abortar uno, y al reintentar ya encuentra la fila bloqueada.
const ER_LOCK_DEADLOCK = 1213;

async function conTransaccion(bd, fn, { reintentos = 1 } = {}) {
  for (let intento = 0; ; intento += 1) {
    const conn = await bd.obtener().getConnection();
    try {
      await conn.beginTransaction();
      const resultado = await fn(conn);
      await conn.commit();
      return resultado;
    } catch (err) {
      await conn.rollback().catch(() => {});
      const reintentar = err && err.errno === ER_LOCK_DEADLOCK && intento < reintentos;
      if (!reintentar) throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = { conTransaccion };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/porteria/__tests__/transaccion.test.js` → PASS (4).
Run: `npm run test:porteria:int` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/migrations/004_estado_provisional.sql src/porteria/utils/transaccion.js src/porteria/__tests__/transaccion.test.js src/porteria/__tests__/migraciones.int.test.js
git commit -m "feat(porteria): fila de estado provisional y transacciones con reintento ante deadlock"
```

---

### Task 2: Repositorios de eventos, estado, auditoría, catálogo y motivos

**Files:**
- Create: `src/porteria/repositorios/eventos.js`
- Create: `src/porteria/repositorios/estado.js`
- Create: `src/porteria/repositorios/auditoria.js`
- Create: `src/porteria/repositorios/vehiculosExternos.js`
- Modify: `src/porteria/repositorios/motivos.js` (+ `obtener`, `aplica`)
- Test: `src/porteria/__tests__/repositorios.int.test.js`

**Interfaces:**
- Consumes: `patronContiene` (`utils/texto.js`), `PorteriaError`, `crearBdDePrueba`/`abrirConexion` (`testing/bd.js`).
- Produces (`ejecutor` = conexión de transacción o pool; ambos tienen `.query`):
  - `repositorios/eventos.js`:
    - `insertar(conn, evento) → id`. `evento` trae: `sede_id, sentido, tipo_vehiculo, placa, vehiculo_id, vehiculo_externo_id, motivo_id, asistencia_id, exequia_id, referencia_texto, referencia_snapshot (objeto|null), conductor_usuario, conductor_nombre, conductor_documento, conductor_otro (bool), empresa, kilometraje, observaciones, evento_par_id, inconsistente (0|1), inconsistencia_tipo, registrado_por`.
    - `obtener(ejecutor, id, { bloquear = false }) → evento | null` (con `bloquear` usa `FOR UPDATE OF e`).
    - Forma de un evento: todas las columnas de `por_eventos` excepto `referencia_snapshot`, más `motivo: { id, codigo, nombre }` y `referencia` (objeto|null); `conductor_otro`, `inconsistente`, `anulado` como booleanos.
    - `antiguedadSegundos(ejecutor, id) → number | null` (con `NOW()` del servidor).
    - `ultimoVigente(ejecutor, placa) → { id, sede_id, sentido, tipo_vehiculo, registrado_at } | null` (no anulados, `registrado_at DESC, id DESC`).
    - `actualizar(conn, id, cambios, usuario)` (solo columnas editables; fija `corregido_at = NOW()`, `corregido_por`).
    - `anular(conn, id, { usuario, motivo })` (marca anulado, quita su `evento_par_id` y el de quien lo apunte).
    - `listar(ejecutor, { sedeId?, desde?, hasta?, placa?, tipoVehiculo?, motivoId?, inconsistente? }, { pagina = 1, porPagina = 50 }) → { items, total, pagina, por_pagina }`.
    - `COLUMNAS_EVENTO`, `eventoPublico(fila)` (para `estado.js`).
  - `repositorios/estado.js`:
    - `bloquear(conn, placa) → { placa, tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id }` (crea la fila provisional si no existe y la bloquea).
    - `guardar(conn, { placa, tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id })`; `borrar(conn, placa)`.
    - `obtener(ejecutor, placa) → { …, desde } | null` (ignora la provisional).
    - `dentroDeSede(ejecutor, sedeId) → evento[]` (último evento de cada vehículo dentro).
    - `propiosFuera(ejecutor, sedeId | null) → evento[]` (última salida de cada propio fuera; `sedeId` = sede por la que salió).
  - `repositorios/auditoria.js`: `registrarAuditoria(conn, { usuario, apiCodigo, entidad, entidadId, accion, antes, despues, ip })`.
  - `repositorios/vehiculosExternos.js`: `crearRepositorioVehiculosExternos(bd) → { buscar(q?), obtenerPorPlaca(placa, conn?), obtenerPorId(id), crear({ placa, tipo, empresa, descripcion, usuario }, conn?) → id, actualizar(id, cambios, usuario) → boolean }`. `crear` con placa repetida → `PorteriaError(409, 'PLACA_DUPLICADA', 'La placa ya está en el catálogo')`. `obtenerPorPlaca` incluye inactivos; `buscar` no.
  - `repositorios/motivos.js`: `obtener(id) → { id, codigo, nombre, descripcion, tipo_referencia, referencia_obligatoria, activo, aplica_propio, aplica_proveedor_asistencia, aplica_proveedor, aplica_ingreso, aplica_salida } | null` (booleanos); `aplica(motivo, tipoVehiculo, sentido) → boolean` (exportada).

- [ ] **Step 1: Write the failing integration test**

```js
// src/porteria/__tests__/repositorios.int.test.js
// Placas R2…, sedes 2201-2202.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const repoEventos = require('../repositorios/eventos');
const repoEstado = require('../repositorios/estado');
const { registrarAuditoria } = require('../repositorios/auditoria');
const { crearRepositorioMotivos, aplica } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');

let conn;
let bd;
let tanqueo;
const base = (extra = {}) => ({
  sede_id: 2201, sentido: 'SALIDA', tipo_vehiculo: 'PROPIO', placa: 'R2A001', vehiculo_id: null,
  vehiculo_externo_id: null, motivo_id: tanqueo, asistencia_id: null, exequia_id: null, referencia_texto: null,
  referencia_snapshot: null, conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez', conductor_documento: null,
  conductor_otro: false, empresa: null, kilometraje: null, observaciones: null, evento_par_id: null,
  inconsistente: 0, inconsistencia_tipo: null, registrado_por: 'guarda1', ...extra,
});

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  await conn.query("DELETE FROM por_eventos WHERE placa LIKE 'R2%'");
  await conn.query("DELETE FROM por_estado_vehiculo WHERE placa LIKE 'R2%'");
  await conn.query("DELETE FROM por_vehiculos_externos WHERE placa LIKE 'R2%'");
  [[{ id: tanqueo }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'TANQUEO'");
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

describe('eventos', () => {
  test('insertar y obtener: snapshot, booleanos y motivo', async () => {
    const id = await repoEventos.insertar(conn, base({ referencia_snapshot: { tipo: 'ASISTENCIA', codigo: 'H360-1' }, kilometraje: 10 }));
    const e = await repoEventos.obtener(conn, id);
    expect(e).toMatchObject({
      id, placa: 'R2A001', sentido: 'SALIDA', conductor_otro: false, inconsistente: false, anulado: false,
      kilometraje: 10, motivo: { id: tanqueo, codigo: 'TANQUEO', nombre: 'Tanqueo' },
      referencia: { tipo: 'ASISTENCIA', codigo: 'H360-1' },
    });
    expect(e).not.toHaveProperty('referencia_snapshot');
    expect(e.registrado_at).toBeInstanceOf(Date);
    expect(await repoEventos.antiguedadSegundos(conn, id)).toBeLessThan(60);
    expect(await repoEventos.obtener(conn, 999999999)).toBeNull();
  });

  test('ultimoVigente ignora anulados y desempata por id', async () => {
    const primero = await repoEventos.insertar(conn, base({ placa: 'R2B001' }));
    const segundo = await repoEventos.insertar(conn, base({ placa: 'R2B001', sentido: 'INGRESO' }));
    expect((await repoEventos.ultimoVigente(conn, 'R2B001')).id).toBe(segundo);
    await repoEventos.anular(conn, segundo, { usuario: 'admin', motivo: 'error' });
    expect((await repoEventos.ultimoVigente(conn, 'R2B001')).id).toBe(primero);
    expect(await repoEventos.ultimoVigente(conn, 'R2NADA')).toBeNull();
  });

  test('anular marca el registro y suelta el par de quien lo apunte', async () => {
    const salida = await repoEventos.insertar(conn, base({ placa: 'R2C001' }));
    const ingreso = await repoEventos.insertar(conn, base({ placa: 'R2C001', sentido: 'INGRESO', evento_par_id: salida }));
    await repoEventos.anular(conn, salida, { usuario: 'admin', motivo: 'Placa equivocada' });
    expect(await repoEventos.obtener(conn, salida)).toMatchObject({
      anulado: true, anulado_por: 'admin', anulado_motivo: 'Placa equivocada', evento_par_id: null,
    });
    expect((await repoEventos.obtener(conn, ingreso)).evento_par_id).toBeNull();
  });

  test('actualizar solo toca columnas editables y marca la corrección', async () => {
    const id = await repoEventos.insertar(conn, base({ placa: 'R2D001' }));
    await repoEventos.actualizar(conn, id, { kilometraje: 55, placa: 'OTRA', referencia_snapshot: { codigo: 'X' } }, 'admin');
    expect(await repoEventos.obtener(conn, id)).toMatchObject({
      placa: 'R2D001', kilometraje: 55, referencia: { codigo: 'X' }, corregido_por: 'admin',
    });
  });

  test('listar filtra y pagina, recientes primero', async () => {
    const ids = [];
    for (const placa of ['R2L001', 'R2L002', 'R2L003']) ids.push(await repoEventos.insertar(conn, base({ sede_id: 2202, placa })));
    const pagina1 = await repoEventos.listar(conn, { sedeId: 2202 }, { pagina: 1, porPagina: 2 });
    expect(pagina1.total).toBe(3);
    expect(pagina1.items.map((e) => e.id)).toEqual([ids[2], ids[1]]);
    expect(pagina1).toMatchObject({ pagina: 1, por_pagina: 2 });
    expect((await repoEventos.listar(conn, { sedeId: 2202, placa: 'R2L002' })).items.map((e) => e.id)).toEqual([ids[1]]);
    const [[{ hoy }]] = await conn.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS hoy");
    expect((await repoEventos.listar(conn, { sedeId: 2202, desde: hoy, hasta: hoy })).total).toBe(3);
    expect((await repoEventos.listar(conn, { sedeId: 2202, hasta: '2000-01-01' })).total).toBe(0);
    expect((await repoEventos.listar(conn, { sedeId: 2202, inconsistente: true })).total).toBe(0);
  });
});

describe('estado', () => {
  test('bloquear crea la fila provisional, que no cuenta como estado', async () => {
    await conn.beginTransaction();
    const fila = await repoEstado.bloquear(conn, 'R2E001');
    await conn.commit();
    expect(fila).toEqual({
      placa: 'R2E001', tipo_vehiculo: null, sede_id: null, dentro: 0, ultimo_evento_id: null, salida_abierta_id: null,
    });
    expect(await repoEstado.obtener(conn, 'R2E001')).toBeNull();
  });

  test('guardar, obtener, dentro de la sede, propios fuera y borrar', async () => {
    const ingreso = await repoEventos.insertar(conn, base({ placa: 'R2E002', sentido: 'INGRESO', tipo_vehiculo: 'PROVEEDOR', sede_id: 2201 }));
    await repoEstado.bloquear(conn, 'R2E002');
    await repoEstado.guardar(conn, { placa: 'R2E002', tipo_vehiculo: 'PROVEEDOR', sede_id: 2201, dentro: 1, ultimo_evento_id: ingreso, salida_abierta_id: null });
    const salida = await repoEventos.insertar(conn, base({ placa: 'R2E003' }));
    await repoEstado.bloquear(conn, 'R2E003');
    await repoEstado.guardar(conn, { placa: 'R2E003', tipo_vehiculo: 'PROPIO', sede_id: 2201, dentro: 0, ultimo_evento_id: salida, salida_abierta_id: salida });

    expect(await repoEstado.obtener(conn, 'R2E002')).toMatchObject({ dentro: 1, sede_id: 2201, ultimo_evento_id: ingreso, desde: expect.any(Date) });
    expect((await repoEstado.dentroDeSede(conn, 2201)).map((e) => e.placa)).toContain('R2E002');
    expect((await repoEstado.dentroDeSede(conn, 2201)).map((e) => e.placa)).not.toContain('R2E003');
    const fuera = await repoEstado.propiosFuera(conn, 2201);
    expect(fuera.map((e) => e.placa)).toContain('R2E003');
    expect(fuera.map((e) => e.placa)).not.toContain('R2E002');
    expect(fuera.find((e) => e.placa === 'R2E003').motivo.codigo).toBe('TANQUEO');
    expect((await repoEstado.propiosFuera(conn, null)).map((e) => e.placa)).toContain('R2E003');

    await repoEstado.borrar(conn, 'R2E003');
    expect(await repoEstado.obtener(conn, 'R2E003')).toBeNull();
  });
});

test('auditoría guarda antes y después como JSON', async () => {
  await registrarAuditoria(conn, {
    usuario: 'r2test', apiCodigo: 'POR-TST-001', entidad: 'evento', entidadId: 7, accion: 'CORREGIR',
    antes: { kilometraje: 1 }, despues: { kilometraje: 2 }, ip: '10.0.0.1',
  });
  const [[fila]] = await conn.query("SELECT * FROM por_auditoria WHERE usuario = 'r2test' ORDER BY id DESC LIMIT 1");
  expect(fila).toMatchObject({ api_codigo: 'POR-TST-001', entidad: 'evento', entidad_id: 7, accion: 'CORREGIR', ip: '10.0.0.1' });
  expect(fila.antes).toEqual({ kilometraje: 1 });
  expect(fila.despues).toEqual({ kilometraje: 2 });
});

test('motivos: obtener y aplica', async () => {
  const motivos = crearRepositorioMotivos(bd);
  const m = await motivos.obtener(tanqueo);
  expect(m).toMatchObject({ codigo: 'TANQUEO', activo: true, aplica_propio: true, aplica_proveedor: false, referencia_obligatoria: false });
  expect(aplica(m, 'PROPIO', 'SALIDA')).toBe(true);
  expect(aplica(m, 'PROVEEDOR', 'SALIDA')).toBe(false);
  expect(await motivos.obtener(999999)).toBeNull();
});

describe('vehículos externos', () => {
  test('crear, duplicado, obtener, buscar y actualizar', async () => {
    const repo = crearRepositorioVehiculosExternos(bd);
    const id = await repo.crear({ placa: 'R2V001', tipo: 'PROVEEDOR', empresa: 'Flores del Norte', descripcion: null, usuario: 'guarda1' });
    expect(await repo.obtenerPorId(id)).toMatchObject({ id, placa: 'R2V001', tipo: 'PROVEEDOR', empresa: 'Flores del Norte', activo: true });
    await expect(repo.crear({ placa: 'R2V001', tipo: 'PROVEEDOR', empresa: 'Otra', usuario: 'x' }))
      .rejects.toMatchObject({ statusCode: 409, motivo: 'PLACA_DUPLICADA', message: 'La placa ya está en el catálogo' });
    expect((await repo.buscar('flores')).map((v) => v.placa)).toContain('R2V001');
    expect(await repo.actualizar(id, { activo: false, empresa: 'Flores SAS' }, 'admin')).toBe(true);
    expect((await repo.buscar('flores')).map((v) => v.placa)).not.toContain('R2V001');
    expect(await repo.obtenerPorPlaca('R2V001')).toMatchObject({ id, empresa: 'Flores SAS', activo: false });
    expect(await repo.actualizar(999999, { empresa: 'x' }, 'admin')).toBe(false);
    expect(await repo.obtenerPorPlaca('R2NADA')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:porteria:int` → FAIL (`Cannot find module '../repositorios/eventos'`).

- [ ] **Step 3: Write minimal implementation**

```js
// src/porteria/repositorios/eventos.js
// por_eventos. Las escrituras reciben la conexión de la transacción; las columnas salen de listas cerradas.
const { patronContiene } = require('../utils/texto');

const COLUMNAS_EVENTO = `e.id, e.sede_id, e.sentido, e.tipo_vehiculo, e.placa, e.vehiculo_id, e.vehiculo_externo_id,
  e.conductor_usuario, e.conductor_nombre, e.conductor_documento, e.conductor_otro, e.empresa,
  e.motivo_id, m.codigo AS motivo_codigo, m.nombre AS motivo_nombre,
  e.asistencia_id, e.exequia_id, e.referencia_texto, e.referencia_snapshot, e.evento_par_id, e.kilometraje,
  e.observaciones, e.inconsistente, e.inconsistencia_tipo, e.registrado_at, e.registrado_por,
  e.corregido_at, e.corregido_por, e.anulado, e.anulado_por, e.anulado_at, e.anulado_motivo`;
const FROM_EVENTO = 'FROM por_eventos e JOIN por_motivos m ON m.id = e.motivo_id';

const EDITABLES = [
  'motivo_id', 'asistencia_id', 'exequia_id', 'referencia_texto', 'referencia_snapshot',
  'conductor_usuario', 'conductor_nombre', 'conductor_documento', 'conductor_otro', 'empresa',
  'kilometraje', 'observaciones',
];
const AL_REGISTRAR = [
  'sede_id', 'sentido', 'tipo_vehiculo', 'placa', 'vehiculo_id', 'vehiculo_externo_id', ...EDITABLES,
  'evento_par_id', 'inconsistente', 'inconsistencia_tipo', 'registrado_por',
];

const valorDe = (columna, valor) => {
  if (columna === 'referencia_snapshot') return valor === null || valor === undefined ? null : JSON.stringify(valor);
  return valor === undefined ? null : valor;
};

function eventoPublico(fila) {
  const { motivo_codigo: codigo, motivo_nombre: nombre, referencia_snapshot: snapshot, ...e } = fila;
  return {
    ...e,
    conductor_otro: e.conductor_otro === 1,
    inconsistente: e.inconsistente === 1,
    anulado: e.anulado === 1,
    motivo: { id: e.motivo_id, codigo, nombre },
    referencia: typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot ?? null,
  };
}

async function insertar(conn, evento) {
  const [r] = await conn.query(
    `INSERT INTO por_eventos (${AL_REGISTRAR.join(', ')}) VALUES (?)`,
    [AL_REGISTRAR.map((c) => valorDe(c, evento[c]))],
  );
  return r.insertId;
}

// FOR UPDATE OF e: bloquea solo el evento, no la fila del motivo (que comparten muchos eventos).
async function obtener(ejecutor, id, { bloquear = false } = {}) {
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${FROM_EVENTO} WHERE e.id = ?${bloquear ? ' FOR UPDATE OF e' : ''}`, [id],
  );
  return filas[0] ? eventoPublico(filas[0]) : null;
}

async function antiguedadSegundos(ejecutor, id) {
  const [[fila]] = await ejecutor.query(
    'SELECT TIMESTAMPDIFF(SECOND, registrado_at, NOW()) AS segundos FROM por_eventos WHERE id = ?', [id],
  );
  return fila ? Number(fila.segundos) : null;
}

async function ultimoVigente(ejecutor, placa) {
  const [[fila]] = await ejecutor.query(
    `SELECT id, sede_id, sentido, tipo_vehiculo, registrado_at FROM por_eventos
      WHERE placa = ? AND anulado = 0 ORDER BY registrado_at DESC, id DESC LIMIT 1`,
    [placa],
  );
  return fila || null;
}

async function actualizar(conn, id, cambios, usuario) {
  const columnas = Object.keys(cambios).filter((c) => EDITABLES.includes(c));
  if (columnas.length === 0) return;
  await conn.query(
    `UPDATE por_eventos SET ${columnas.map((c) => `${c} = ?`).join(', ')}, corregido_at = NOW(), corregido_por = ?
      WHERE id = ?`,
    [...columnas.map((c) => valorDe(c, cambios[c])), usuario, id],
  );
}

async function anular(conn, id, { usuario, motivo }) {
  await conn.query(
    `UPDATE por_eventos SET anulado = 1, anulado_por = ?, anulado_at = NOW(), anulado_motivo = ?, evento_par_id = NULL
      WHERE id = ?`,
    [usuario, motivo, id],
  );
  await conn.query('UPDATE por_eventos SET evento_par_id = NULL WHERE evento_par_id = ?', [id]);
}

async function listar(ejecutor, filtros = {}, { pagina = 1, porPagina = 50 } = {}) {
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
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const [[{ total }]] = await ejecutor.query(`SELECT COUNT(*) AS total FROM por_eventos e ${where}`, params);
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${FROM_EVENTO} ${where} ORDER BY e.registrado_at DESC, e.id DESC LIMIT ? OFFSET ?`,
    [...params, porPagina, (pagina - 1) * porPagina],
  );
  return { items: filas.map(eventoPublico), total: Number(total), pagina, por_pagina: porPagina };
}

module.exports = {
  COLUMNAS_EVENTO, FROM_EVENTO, eventoPublico,
  insertar, obtener, antiguedadSegundos, ultimoVigente, actualizar, anular, listar,
};
```

```js
// src/porteria/repositorios/estado.js
// por_estado_vehiculo: dónde está cada placa ahora. Tabla derivada de por_eventos, escrita en la misma
// transacción que cada evento. Una fila con ultimo_evento_id NULL es provisional (solo existe para bloquear).
const { COLUMNAS_EVENTO, eventoPublico } = require('./eventos');

const COLUMNAS_ESTADO = 'placa, tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id';
const DESDE_ULTIMO_EVENTO = `
  FROM por_estado_vehiculo s
  JOIN por_eventos e ON e.id = s.ultimo_evento_id
  JOIN por_motivos m ON m.id = e.motivo_id`;

/** Crea la fila provisional si no existe y la bloquea hasta el fin de la transacción. */
async function bloquear(conn, placa) {
  await conn.query(
    'INSERT INTO por_estado_vehiculo (placa, dentro) VALUES (?, 0) ON DUPLICATE KEY UPDATE placa = placa', [placa],
  );
  const [[fila]] = await conn.query(`SELECT ${COLUMNAS_ESTADO} FROM por_estado_vehiculo WHERE placa = ? FOR UPDATE`, [placa]);
  return fila;
}

async function guardar(conn, { placa, tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id }) {
  await conn.query(
    `UPDATE por_estado_vehiculo SET tipo_vehiculo = ?, sede_id = ?, dentro = ?, ultimo_evento_id = ?, salida_abierta_id = ?
      WHERE placa = ?`,
    [tipo_vehiculo, sede_id, dentro, ultimo_evento_id, salida_abierta_id, placa],
  );
}

async function borrar(conn, placa) {
  await conn.query('DELETE FROM por_estado_vehiculo WHERE placa = ?', [placa]);
}

async function obtener(ejecutor, placa) {
  const [[fila]] = await ejecutor.query(
    `SELECT s.placa, s.tipo_vehiculo, s.sede_id, s.dentro, s.ultimo_evento_id, s.salida_abierta_id, e.registrado_at AS desde
       FROM por_estado_vehiculo s JOIN por_eventos e ON e.id = s.ultimo_evento_id
      WHERE s.placa = ?`,
    [placa],
  );
  return fila || null;
}

async function dentroDeSede(ejecutor, sedeId) {
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${DESDE_ULTIMO_EVENTO} WHERE s.sede_id = ? AND s.dentro = 1 ORDER BY e.registrado_at DESC`,
    [sedeId],
  );
  return filas.map(eventoPublico);
}

/** Propios fuera (los que llevan más tiempo, primero). `sedeId` = sede por la que salieron; null = todas. */
async function propiosFuera(ejecutor, sedeId) {
  const filtro = sedeId ? 'AND s.sede_id = ?' : '';
  const [filas] = await ejecutor.query(
    `SELECT ${COLUMNAS_EVENTO} ${DESDE_ULTIMO_EVENTO}
      WHERE s.dentro = 0 AND s.tipo_vehiculo = 'PROPIO' ${filtro} ORDER BY e.registrado_at ASC`,
    sedeId ? [sedeId] : [],
  );
  return filas.map(eventoPublico);
}

module.exports = { bloquear, guardar, borrar, obtener, dentroDeSede, propiosFuera };
```

```js
// src/porteria/repositorios/auditoria.js
// Quién creó, corrigió, forzó o anuló qué. Se escribe en la misma transacción que el cambio.
async function registrarAuditoria(conn, { usuario, apiCodigo = null, entidad, entidadId, accion, antes = null, despues = null, ip = null }) {
  const json = (v) => (v === null || v === undefined ? null : JSON.stringify(v));
  await conn.query(
    `INSERT INTO por_auditoria (usuario, api_codigo, entidad, entidad_id, accion, antes, despues, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [usuario, apiCodigo, entidad, entidadId, accion, json(antes), json(despues), ip],
  );
}

module.exports = { registrarAuditoria };
```

```js
// src/porteria/repositorios/vehiculosExternos.js
// Catálogo de vehículos de proveedor para autocompletar. Las placas se guardan normalizadas.
const PorteriaError = require('../utils/PorteriaError');
const { patronContiene } = require('../utils/texto');

const COLUMNAS = 'id, placa, tipo, empresa, descripcion, activo';
const EDITABLES = ['tipo', 'empresa', 'descripcion', 'activo'];
const publico = (v) => (v ? { ...v, activo: v.activo === 1 } : null);

function crearRepositorioVehiculosExternos(bd) {
  const ejecutor = (conn) => conn || bd.obtener();

  async function obtenerPorId(id) {
    const [[fila]] = await bd.obtener().query(`SELECT ${COLUMNAS} FROM por_vehiculos_externos WHERE id = ?`, [id]);
    return publico(fila);
  }

  return {
    async buscar(q) {
      const filtro = q ? 'AND (placa LIKE ? OR empresa LIKE ?)' : '';
      const patron = patronContiene(q ?? '');
      const [filas] = await bd.obtener().query(
        `SELECT ${COLUMNAS} FROM por_vehiculos_externos WHERE activo = 1 ${filtro} ORDER BY empresa, placa LIMIT 30`,
        q ? [patron, patron] : [],
      );
      return filas.map(publico);
    },

    /** Incluye inactivos: el registro reconoce la placa aunque ya no se ofrezca para autocompletar. */
    async obtenerPorPlaca(placa, conn) {
      const [[fila]] = await ejecutor(conn).query(`SELECT ${COLUMNAS} FROM por_vehiculos_externos WHERE placa = ?`, [placa]);
      return publico(fila);
    },

    obtenerPorId,

    async crear({ placa, tipo, empresa, descripcion = null, usuario }, conn) {
      try {
        const [r] = await ejecutor(conn).query(
          'INSERT INTO por_vehiculos_externos (placa, tipo, empresa, descripcion, created_by) VALUES (?, ?, ?, ?, ?)',
          [placa, tipo, empresa, descripcion, usuario],
        );
        return r.insertId;
      } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') throw new PorteriaError(409, 'PLACA_DUPLICADA', 'La placa ya está en el catálogo');
        throw err;
      }
    },

    async actualizar(id, cambios, usuario) {
      const columnas = Object.keys(cambios).filter((c) => EDITABLES.includes(c));
      if (columnas.length === 0) return Boolean(await obtenerPorId(id));
      const [r] = await bd.obtener().query(
        `UPDATE por_vehiculos_externos SET ${columnas.map((c) => `${c} = ?`).join(', ')}, updated_at = NOW(), updated_by = ?
          WHERE id = ?`,
        [...columnas.map((c) => cambios[c]), usuario, id],
      );
      return r.affectedRows > 0;
    },
  };
}

module.exports = { crearRepositorioVehiculosExternos };
```

En `src/porteria/repositorios/motivos.js`, agregar antes de `module.exports` y exportar `aplica`; dentro de `crearRepositorioMotivos`, agregar `obtener` al objeto que se devuelve (`return { listarActivos, obtener };`):

```js
const BOOLEANAS = ['activo', 'referencia_obligatoria', 'aplica_propio', 'aplica_proveedor_asistencia', 'aplica_proveedor', 'aplica_ingreso', 'aplica_salida'];

/** ¿El motivo aplica a ese tipo de vehículo y sentido? (motivo tal como lo devuelve `obtener`). */
function aplica(motivo, tipoVehiculo, sentido) {
  return Boolean(motivo[COLUMNA_TIPO[tipoVehiculo]]) && Boolean(motivo[COLUMNA_SENTIDO[sentido]]);
}
```

```js
  async function obtener(id) {
    const [[fila]] = await bd.obtener().query(
      `SELECT id, codigo, nombre, descripcion, tipo_referencia, referencia_obligatoria, activo,
              aplica_propio, aplica_proveedor_asistencia, aplica_proveedor, aplica_ingreso, aplica_salida
         FROM por_motivos WHERE id = ?`,
      [id],
    );
    if (!fila) return null;
    return { ...fila, ...Object.fromEntries(BOOLEANAS.map((c) => [c, fila[c] === 1])) };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:porteria:int` → PASS. Run: `npx jest src/porteria` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/repositorios src/porteria/__tests__/repositorios.int.test.js
git commit -m "feat(porteria): repositorios de eventos, estado, auditoría y catálogo de proveedores"
```

---

### Task 3: Conductor con lista completa o no, y sede de consulta

**Files:**
- Modify: `src/porteria/services/conductores.service.js` (+ `buscar`)
- Modify: `src/porteria/middleware/autenticacion.js` (+ `sedeDeConsulta`)
- Modify: `src/porteria/__tests__/conductores.service.test.js` (prueba nueva)
- Test: `src/porteria/__tests__/sedeDeConsulta.test.js`

**Interfaces:**
- Produces:
  - `conductores.buscar(usuario) → { conductor: { usuario, nombre } | null, listaCompleta: boolean }`. `listaCompleta` es true si alguna vez hubo una lectura completa del AD (se sirve esa caché); false si solo hay lecturas parciales o ninguna.
  - `sedeDeConsulta(req, { todasParaAdmin = false } = {}) → number | null`. Guarda: siempre `req.porUsuario.sede_id` (sin sede → `PorteriaError(403, 'SEDE_REQUERIDA', 'Elige la sede de tu turno para continuar')`). Admin: `?sede_id=` (entero positivo, si no → 400 `'Sede inválida'`), si no la de su token, si no `null` con `todasParaAdmin`, si no 400 `'Indica la sede'`.

- [ ] **Step 1: Write the failing tests**

Agregar al final de `src/porteria/__tests__/conductores.service.test.js` (usa el helper `preparar` que ya existe en ese archivo; si su firma cambió, adapta la llamada mínimamente):

```js
test('buscar distingue "no está en la lista" de "no se sabe"', async () => {
  const ok = preparar();
  expect(await ok.conductores.buscar('baez')).toEqual({ conductor: { usuario: 'baez', nombre: 'Báez Luis' }, listaCompleta: true });
  expect(await ok.conductores.buscar('nadie')).toEqual({ conductor: null, listaCompleta: true });

  const caido = preparar({ fallan: ['GA', 'GB'] });
  expect(await caido.conductores.buscar('baez')).toEqual({ conductor: null, listaCompleta: false });

  const parcial = preparar({ fallan: ['GB'] });
  expect(await parcial.conductores.buscar('perez')).toEqual({ conductor: { usuario: 'perez', nombre: 'Pérez Juan' }, listaCompleta: false });
});
```

```js
// src/porteria/__tests__/sedeDeConsulta.test.js
const { sedeDeConsulta } = require('../middleware/autenticacion');

const req = (porUsuario, query = {}) => ({ porUsuario, query });
const errorDe = (fn) => { try { fn(); return undefined; } catch (e) { return e; } };
const guarda = (sede_id) => ({ usuario: 'g', rol: 'guarda', sede_id });
const admin = (sede_id = null) => ({ usuario: 'a', rol: 'admin_porteria', sede_id });

test('el guarda siempre consulta su sede, aunque pida otra', () => {
  expect(sedeDeConsulta(req(guarda(3), { sede_id: '9' }))).toBe(3);
});

test('el guarda sin sede → 403 SEDE_REQUERIDA', () => {
  expect(errorDe(() => sedeDeConsulta(req(guarda(null)), { todasParaAdmin: true }))).toMatchObject({
    statusCode: 403, motivo: 'SEDE_REQUERIDA', message: 'Elige la sede de tu turno para continuar',
  });
});

test('el admin usa ?sede_id, luego la de su token, luego todas o 400', () => {
  expect(sedeDeConsulta(req(admin(2), { sede_id: '7' }))).toBe(7);
  expect(sedeDeConsulta(req(admin(2)))).toBe(2);
  expect(sedeDeConsulta(req(admin(), { sede_id: '' }), { todasParaAdmin: true })).toBeNull();
  expect(errorDe(() => sedeDeConsulta(req(admin())))).toMatchObject({ statusCode: 400, motivo: 'VALIDACION', message: 'Indica la sede' });
});

test.each(['abc', '0', '-1', '1.5'])('?sede_id=%s → 400 Sede inválida', (valor) => {
  expect(errorDe(() => sedeDeConsulta(req(admin(), { sede_id: valor })))).toMatchObject({ statusCode: 400, message: 'Sede inválida' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/porteria/__tests__/conductores.service.test.js src/porteria/__tests__/sedeDeConsulta.test.js` → FAIL (`buscar is not a function`, `sedeDeConsulta is not a function`).

- [ ] **Step 3: Write minimal implementation**

En `conductores.service.js`, agregar al objeto que devuelve `crearConductores` (junto a `listar` y `existe`):

```js
    /**
     * { conductor, listaCompleta }. listaCompleta es false si el AD nunca respondió del todo: quien llama
     * no debe tratar "no está" como definitivo (la portería no se bloquea por el AD).
     */
    async buscar(usuario) {
      const lista = await listar();
      return { conductor: lista.find((c) => c.usuario === usuario) || null, listaCompleta: cache !== null };
    },
```

En `middleware/autenticacion.js`, agregar `const { ROLES } = require('../services/auth.service');` (junto al `require` existente de ese módulo, en una sola línea `const { verificarToken, ROLES } = …`) y la función, exportándola:

```js
/**
 * Sede de una consulta. El guarda siempre consulta la de su turno. El admin puede pedir otra con ?sede_id=;
 * si no, usa la de su token; sin ninguna, `todasParaAdmin` devuelve null (todas) y si no es un 400.
 */
function sedeDeConsulta(req, { todasParaAdmin = false } = {}) {
  const usuario = req.porUsuario;
  if (usuario.rol !== ROLES.ADMIN) {
    if (!usuario.sede_id) throw new PorteriaError(403, 'SEDE_REQUERIDA', 'Elige la sede de tu turno para continuar');
    return usuario.sede_id;
  }
  const pedida = req.query && req.query.sede_id;
  if (pedida !== undefined && pedida !== '') {
    const id = Number(pedida);
    if (!Number.isInteger(id) || id <= 0) throw new PorteriaError(400, 'VALIDACION', 'Sede inválida');
    return id;
  }
  if (usuario.sede_id) return usuario.sede_id;
  if (todasParaAdmin) return null;
  throw new PorteriaError(400, 'VALIDACION', 'Indica la sede');
}
```

`module.exports = { crearAutenticacion, requiereRol, requiereSede, sedeDeConsulta };`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/porteria` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/services/conductores.service.js src/porteria/middleware/autenticacion.js src/porteria/__tests__/conductores.service.test.js src/porteria/__tests__/sedeDeConsulta.test.js
git commit -m "feat(porteria): búsqueda de conductor con lista completa o parcial y sede de consulta"
```

---

### Task 4: Validación de la entrada y detalle del evento

**Files:**
- Create: `src/porteria/services/detalleEvento.js`
- Test: `src/porteria/__tests__/detalleEvento.test.js`

**Interfaces:**
- Consumes: `normalizarPlaca`, `PorteriaError`, `aplica` (Task 2), y por inyección `h360.{ obtenerAsistenciaVigente, obtenerExequiaVigente }`, `conductores.buscar` (Task 3), `motivos.obtener` (Task 2).
- Produces:
  - `leerEntradaRegistro(body) → { sentido, placa, tipo_vehiculo|null, motivo_id, asistencia_id, exequia_id, referencia_texto, conductor_usuario, conductor_nombre, conductor_documento, conductor_otro, empresa, kilometraje, observaciones, forzar, guardar_en_catalogo }`. Errores de forma → 400 `VALIDACION`.
  - `leerCambiosCorreccion(body) → objeto con solo los campos corregibles presentes`. `placa`/`sentido`/`tipo_vehiculo`/`sede_id` en el cuerpo → 400; sin cambios → 400.
  - `CAMPOS_REFERENCIA`, `CAMPOS_CONDUCTOR` (arrays).
  - `crearResolutorDetalle({ h360, conductores, motivos }) → { resolver({ tipo, sentido, datos, conservar = {} }) → { motivo: { id, codigo, nombre }, columnas } }`. `columnas` = `{ motivo_id, asistencia_id, exequia_id, referencia_texto, referencia_snapshot, conductor_usuario, conductor_nombre, conductor_documento, conductor_otro, empresa, kilometraje, observaciones }`. Reglas de negocio → 422 `VALIDACION`. `conservar = { referencia: true }` copia motivo/referencia/snapshot de `datos` sin consultar; `conservar = { conductor: true }` copia conductor y empresa.

- [ ] **Step 1: Write the failing test**

```js
// src/porteria/__tests__/detalleEvento.test.js
const { leerEntradaRegistro, leerCambiosCorreccion, crearResolutorDetalle } = require('../services/detalleEvento');

const errorDe = async (fn) => { try { await fn(); return undefined; } catch (e) { return e; } };
const errorSync = (fn) => { try { fn(); return undefined; } catch (e) { return e; } };

const MOTIVOS = {
  1: { id: 1, codigo: 'TANQUEO', nombre: 'Tanqueo', tipo_referencia: 'NINGUNA', referencia_obligatoria: false, activo: true,
    aplica_propio: true, aplica_proveedor_asistencia: false, aplica_proveedor: false, aplica_ingreso: true, aplica_salida: true },
  2: { id: 2, codigo: 'SERES_QUERIDOS', nombre: 'Seres queridos', tipo_referencia: 'ASISTENCIA', referencia_obligatoria: true, activo: true,
    aplica_propio: true, aplica_proveedor_asistencia: false, aplica_proveedor: false, aplica_ingreso: true, aplica_salida: true },
  3: { id: 3, codigo: 'EXEQUIAS', nombre: 'Exequias', tipo_referencia: 'EXEQUIA', referencia_obligatoria: true, activo: true,
    aplica_propio: true, aplica_proveedor_asistencia: false, aplica_proveedor: false, aplica_ingreso: true, aplica_salida: true },
  4: { id: 4, codigo: 'OTRO', nombre: 'Otro', tipo_referencia: 'TEXTO', referencia_obligatoria: true, activo: true,
    aplica_propio: false, aplica_proveedor_asistencia: true, aplica_proveedor: true, aplica_ingreso: true, aplica_salida: true },
  5: { id: 5, codigo: 'VIEJO', nombre: 'Viejo', tipo_referencia: 'NINGUNA', referencia_obligatoria: false, activo: false,
    aplica_propio: true, aplica_proveedor_asistencia: true, aplica_proveedor: true, aplica_ingreso: true, aplica_salida: true },
};

function resolutor({ listaCompleta = true } = {}) {
  const h360 = {
    obtenerAsistenciaVigente: jest.fn(async (id) => (id === 10 ? { id: 10, codigo: 'H360-10', nombre_ser_querido: 'María', contrato: 'C-1', estado: 'NUEVO' } : null)),
    obtenerExequiaVigente: jest.fn(async (id) => (id === 20 ? { id: 20, tipo: 'Misa', fecha: '2026-10-30', hora: '10:00', asistencia_codigo: 'H360-10', nombre_ser_querido: 'María' } : null)),
  };
  const conductores = { buscar: jest.fn(async (u) => ({ conductor: u === 'jperez' ? { usuario: 'jperez', nombre: 'Juan Pérez' } : null, listaCompleta })) };
  const motivos = { obtener: jest.fn(async (id) => MOTIVOS[id] || null) };
  return { r: crearResolutorDetalle({ h360, conductores, motivos }), h360, conductores };
}

describe('leerEntradaRegistro', () => {
  const valida = { sentido: 'SALIDA', placa: ' abc-123 ', motivo_id: '1' };

  test('normaliza placa y números, booleanos por defecto en false', () => {
    expect(leerEntradaRegistro(valida)).toMatchObject({
      sentido: 'SALIDA', placa: 'ABC123', tipo_vehiculo: null, motivo_id: 1, forzar: false, guardar_en_catalogo: false,
      conductor_otro: false, kilometraje: null, observaciones: null,
    });
  });

  test.each([
    [{ ...valida, sentido: 'ENTRADA' }, 'Indica si es ingreso o salida'],
    [{ ...valida, placa: ' - ' }, 'Indica la placa'],
    [{ ...valida, placa: 12 }, 'Indica la placa'],
    [{ ...valida, motivo_id: undefined }, 'Indica el motivo'],
    [{ ...valida, motivo_id: 'x' }, 'Valor inválido en motivo'],
    [{ ...valida, tipo_vehiculo: 'CAMION' }, 'Tipo de vehículo inválido'],
    [{ ...valida, kilometraje: -1 }, 'Valor inválido en kilometraje'],
    [{ ...valida, observaciones: 'x'.repeat(501) }, 'Texto demasiado largo en observaciones'],
  ])('%p → 400 %s', (body, message) => {
    expect(errorSync(() => leerEntradaRegistro(body))).toMatchObject({ statusCode: 400, motivo: 'VALIDACION', message });
  });
});

describe('leerCambiosCorreccion', () => {
  test('solo los campos presentes', () => {
    expect(leerCambiosCorreccion({ kilometraje: '20', observaciones: ' ok ' })).toEqual({ kilometraje: 20, observaciones: 'ok' });
  });
  test('placa, sentido, tipo o sede no se corrigen', () => {
    expect(errorSync(() => leerCambiosCorreccion({ placa: 'X' }))).toMatchObject({
      statusCode: 400, message: 'La placa, el sentido, el tipo y la sede no se corrigen: anula el registro y regístralo de nuevo',
    });
  });
  test('sin cambios → 400', () => {
    expect(errorSync(() => leerCambiosCorreccion({ otra_cosa: 1 }))).toMatchObject({ statusCode: 400, message: 'No hay cambios' });
  });
  test('quitar el motivo → 400', () => {
    expect(errorSync(() => leerCambiosCorreccion({ motivo_id: null }))).toMatchObject({ statusCode: 400, message: 'Indica el motivo' });
  });
});

describe('resolver', () => {
  const propio = (datos) => ({ tipo: 'PROPIO', sentido: 'SALIDA', datos: { motivo_id: 1, conductor_usuario: 'jperez', ...datos } });

  test('propio con conductor del AD: nombre de la lista, sin referencia, con kilometraje', async () => {
    const { r } = resolutor();
    expect(await r.resolver(propio({ kilometraje: 100, observaciones: 'ok', asistencia_id: 10 }))).toEqual({
      motivo: { id: 1, codigo: 'TANQUEO', nombre: 'Tanqueo' },
      columnas: {
        motivo_id: 1, asistencia_id: null, exequia_id: null, referencia_texto: null, referencia_snapshot: null,
        conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez', conductor_documento: null, conductor_otro: false,
        empresa: null, kilometraje: 100, observaciones: 'ok',
      },
    });
  });

  test('motivo inexistente, inactivo o que no aplica → 422', async () => {
    const { r } = resolutor();
    for (const datos of [{ motivo_id: 99 }, { motivo_id: 5 }, { motivo_id: 4 }]) {
      expect(await errorDe(() => r.resolver(propio(datos)))).toMatchObject({
        statusCode: 422, motivo: 'VALIDACION', message: 'El motivo no aplica a este vehículo o sentido',
      });
    }
  });

  test('asistencia: obligatoria, vigente y con snapshot', async () => {
    const { r } = resolutor();
    expect(await errorDe(() => r.resolver(propio({ motivo_id: 2 })))).toMatchObject({ statusCode: 422, message: 'Selecciona la asistencia' });
    expect(await errorDe(() => r.resolver(propio({ motivo_id: 2, asistencia_id: 11 })))).toMatchObject({ message: 'La asistencia no existe o ya no está activa' });
    const { columnas } = await r.resolver(propio({ motivo_id: 2, asistencia_id: 10, exequia_id: 20, referencia_texto: 'x' }));
    expect(columnas).toMatchObject({
      asistencia_id: 10, exequia_id: null, referencia_texto: null,
      referencia_snapshot: { tipo: 'ASISTENCIA', codigo: 'H360-10', nombre_ser_querido: 'María', contrato: 'C-1' },
    });
  });

  test('exequia: vigente y con snapshot', async () => {
    const { r } = resolutor();
    expect(await errorDe(() => r.resolver(propio({ motivo_id: 3, exequia_id: 21 })))).toMatchObject({ message: 'La exequia no existe o ya terminó' });
    const { columnas } = await r.resolver(propio({ motivo_id: 3, exequia_id: 20 }));
    expect(columnas.referencia_snapshot).toEqual({
      tipo: 'EXEQUIA', codigo: 'H360-10', nombre_ser_querido: 'María', fecha: '2026-10-30', hora: '10:00', tipo_exequia: 'Misa',
    });
  });

  test('proveedor: empresa, nombre y documento obligatorios; texto obligatorio; sin kilometraje', async () => {
    const { r } = resolutor();
    const proveedor = (datos) => ({ tipo: 'PROVEEDOR', sentido: 'INGRESO', datos: { motivo_id: 4, referencia_texto: 'Repuestos', ...datos } });
    expect(await errorDe(() => r.resolver(proveedor({ empresa: 'X', conductor_nombre: 'Ana' })))).toMatchObject({
      statusCode: 422, message: 'Escribe la empresa, el nombre y el documento del conductor',
    });
    expect(await errorDe(() => r.resolver(proveedor({ referencia_texto: null, empresa: 'X', conductor_nombre: 'Ana', conductor_documento: '1' })))).toMatchObject({
      message: 'Escribe la referencia',
    });
    const { columnas } = await r.resolver(proveedor({ empresa: 'X', conductor_nombre: 'Ana', conductor_documento: '1', kilometraje: 5, conductor_usuario: 'jperez' }));
    expect(columnas).toMatchObject({
      referencia_texto: 'Repuestos', empresa: 'X', conductor_nombre: 'Ana', conductor_documento: '1',
      conductor_usuario: null, conductor_otro: false, kilometraje: null,
    });
  });

  test('conductor "otro" exige nombre', async () => {
    const { r, conductores } = resolutor();
    expect(await errorDe(() => r.resolver(propio({ conductor_usuario: null, conductor_otro: true })))).toMatchObject({ message: 'Escribe el nombre del conductor' });
    const { columnas } = await r.resolver(propio({ conductor_usuario: null, conductor_otro: true, conductor_nombre: 'Pedro' }));
    expect(columnas).toMatchObject({ conductor_usuario: null, conductor_nombre: 'Pedro', conductor_otro: true });
    expect(conductores.buscar).not.toHaveBeenCalled();
  });

  test('conductor fuera de la lista: 422 si la lista está completa; aceptado si el AD no respondió', async () => {
    expect(await errorDe(() => resolutor().r.resolver(propio({ conductor_usuario: 'nadie', conductor_nombre: 'Nadie' })))).toMatchObject({
      statusCode: 422, message: 'El conductor no está en la lista. Elige "otro" y escribe el nombre.',
    });
    expect(await errorDe(() => resolutor().r.resolver(propio({ conductor_usuario: null })))).toMatchObject({ message: 'Selecciona el conductor' });
    const { r } = resolutor({ listaCompleta: false });
    expect(await errorDe(() => r.resolver(propio({ conductor_usuario: 'nadie' })))).toMatchObject({ statusCode: 422 });
    const { columnas } = await r.resolver(propio({ conductor_usuario: 'nadie', conductor_nombre: 'Nadie N' }));
    expect(columnas).toMatchObject({ conductor_usuario: 'nadie', conductor_nombre: 'Nadie N', conductor_otro: false });
  });

  test('conservar copia referencia y conductor sin consultar H360 ni el AD', async () => {
    const { r, h360, conductores } = resolutor();
    const datos = {
      motivo_id: 2, asistencia_id: 11, exequia_id: null, referencia_texto: null, referencia_snapshot: { codigo: 'VIEJA' },
      conductor_usuario: 'retirado', conductor_nombre: 'Retirado', conductor_documento: null, conductor_otro: false, empresa: null,
      kilometraje: 7, observaciones: null,
    };
    const { columnas } = await r.resolver({ tipo: 'PROPIO', sentido: 'SALIDA', datos, conservar: { referencia: true, conductor: true } });
    expect(columnas).toMatchObject({ asistencia_id: 11, referencia_snapshot: { codigo: 'VIEJA' }, conductor_usuario: 'retirado', kilometraje: 7 });
    expect(h360.obtenerAsistenciaVigente).not.toHaveBeenCalled();
    expect(conductores.buscar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/porteria/__tests__/detalleEvento.test.js` → FAIL (`Cannot find module '../services/detalleEvento'`).

- [ ] **Step 3: Write minimal implementation**

```js
// src/porteria/services/detalleEvento.js
// Validación de la entrada de un registro y resolución de su detalle (motivo, referencia y conductor),
// compartida por registrar y corregir. Todo dato de H360 y del AD se valida aquí, en el backend.
const PorteriaError = require('../utils/PorteriaError');
const { normalizarPlaca } = require('../utils/placa');
const { aplica } = require('../repositorios/motivos');

const SENTIDOS = ['INGRESO', 'SALIDA'];
const TIPOS = ['PROPIO', 'PROVEEDOR_ASISTENCIA', 'PROVEEDOR'];
const CAMPOS_REFERENCIA = ['motivo_id', 'asistencia_id', 'exequia_id', 'referencia_texto'];
const CAMPOS_CONDUCTOR = ['conductor_usuario', 'conductor_nombre', 'conductor_documento', 'conductor_otro', 'empresa'];
const CAMPOS_CORREGIBLES = [...CAMPOS_REFERENCIA, ...CAMPOS_CONDUCTOR, 'kilometraje', 'observaciones'];

const formato = (message) => new PorteriaError(400, 'VALIDACION', message);
const regla = (message) => new PorteriaError(422, 'VALIDACION', message);

/** Texto opcional: recortado; vacío → null; si no es texto o pasa de `max` → 400. */
function texto(valor, max, campo) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw formato(`Valor inválido en ${campo}`);
  const recortado = valor.trim();
  if (recortado.length > max) throw formato(`Texto demasiado largo en ${campo}`);
  return recortado === '' ? null : recortado;
}

/** Entero opcional en [min, max]; acepta '12'. */
function entero(valor, campo, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw formato(`Valor inválido en ${campo}`);
  return n;
}

const booleano = (v) => v === true || v === 'true' || v === 1 || v === '1';

function leerDetalle(body) {
  return {
    motivo_id: entero(body.motivo_id, 'motivo'),
    asistencia_id: entero(body.asistencia_id, 'asistencia'),
    exequia_id: entero(body.exequia_id, 'exequia'),
    referencia_texto: texto(body.referencia_texto, 255, 'referencia'),
    conductor_usuario: texto(body.conductor_usuario, 100, 'conductor'),
    conductor_nombre: texto(body.conductor_nombre, 150, 'nombre del conductor'),
    conductor_documento: texto(body.conductor_documento, 30, 'documento del conductor'),
    conductor_otro: booleano(body.conductor_otro),
    empresa: texto(body.empresa, 150, 'empresa'),
    kilometraje: entero(body.kilometraje, 'kilometraje', { min: 0, max: 5000000 }),
    observaciones: texto(body.observaciones, 500, 'observaciones'),
  };
}

const esObjeto = (body) => body !== null && typeof body === 'object' && !Array.isArray(body);

function leerEntradaRegistro(body) {
  if (!esObjeto(body)) throw formato('Datos inválidos');
  if (!SENTIDOS.includes(body.sentido)) throw formato('Indica si es ingreso o salida');
  const placa = typeof body.placa === 'string' ? normalizarPlaca(body.placa) : '';
  if (!placa || placa.length > 20) throw formato('Indica la placa');
  const tipo = body.tipo_vehiculo === undefined || body.tipo_vehiculo === null || body.tipo_vehiculo === '' ? null : body.tipo_vehiculo;
  if (tipo !== null && !TIPOS.includes(tipo)) throw formato('Tipo de vehículo inválido');
  const detalle = leerDetalle(body);
  if (!detalle.motivo_id) throw formato('Indica el motivo');
  return {
    sentido: body.sentido, placa, tipo_vehiculo: tipo, ...detalle,
    forzar: booleano(body.forzar), guardar_en_catalogo: booleano(body.guardar_en_catalogo),
  };
}

function leerCambiosCorreccion(body) {
  if (!esObjeto(body)) throw formato('Datos inválidos');
  if (['placa', 'sentido', 'tipo_vehiculo', 'sede_id'].some((c) => c in body)) {
    throw formato('La placa, el sentido, el tipo y la sede no se corrigen: anula el registro y regístralo de nuevo');
  }
  const leido = leerDetalle(body);
  const cambios = Object.fromEntries(CAMPOS_CORREGIBLES.filter((c) => c in body).map((c) => [c, leido[c]]));
  if (Object.keys(cambios).length === 0) throw formato('No hay cambios');
  if ('motivo_id' in cambios && !cambios.motivo_id) throw formato('Indica el motivo');
  return cambios;
}

function crearResolutorDetalle({ h360, conductores, motivos }) {
  const SIN_REFERENCIA = { asistencia_id: null, exequia_id: null, referencia_texto: null, referencia_snapshot: null };

  async function resolverReferencia(motivo, datos) {
    switch (motivo.tipo_referencia) {
      case 'ASISTENCIA': {
        if (!datos.asistencia_id) {
          if (motivo.referencia_obligatoria) throw regla('Selecciona la asistencia');
          return SIN_REFERENCIA;
        }
        const a = await h360.obtenerAsistenciaVigente(datos.asistencia_id);
        if (!a) throw regla('La asistencia no existe o ya no está activa');
        return {
          ...SIN_REFERENCIA,
          asistencia_id: a.id,
          referencia_snapshot: { tipo: 'ASISTENCIA', codigo: a.codigo, nombre_ser_querido: a.nombre_ser_querido, contrato: a.contrato },
        };
      }
      case 'EXEQUIA': {
        if (!datos.exequia_id) {
          if (motivo.referencia_obligatoria) throw regla('Selecciona la exequia');
          return SIN_REFERENCIA;
        }
        const e = await h360.obtenerExequiaVigente(datos.exequia_id);
        if (!e) throw regla('La exequia no existe o ya terminó');
        return {
          ...SIN_REFERENCIA,
          exequia_id: e.id,
          referencia_snapshot: {
            tipo: 'EXEQUIA', codigo: e.asistencia_codigo, nombre_ser_querido: e.nombre_ser_querido,
            fecha: e.fecha, hora: e.hora, tipo_exequia: e.tipo,
          },
        };
      }
      case 'TEXTO':
        if (!datos.referencia_texto && motivo.referencia_obligatoria) throw regla('Escribe la referencia');
        return { ...SIN_REFERENCIA, referencia_texto: datos.referencia_texto };
      default:
        return SIN_REFERENCIA;
    }
  }

  async function resolverConductor(tipo, datos) {
    if (tipo !== 'PROPIO') {
      if (!datos.empresa || !datos.conductor_nombre || !datos.conductor_documento) {
        throw regla('Escribe la empresa, el nombre y el documento del conductor');
      }
      return {
        conductor_usuario: null, conductor_nombre: datos.conductor_nombre, conductor_documento: datos.conductor_documento,
        conductor_otro: false, empresa: datos.empresa,
      };
    }
    if (datos.conductor_otro) {
      if (!datos.conductor_nombre) throw regla('Escribe el nombre del conductor');
      return {
        conductor_usuario: null, conductor_nombre: datos.conductor_nombre, conductor_documento: datos.conductor_documento,
        conductor_otro: true, empresa: null,
      };
    }
    if (!datos.conductor_usuario) throw regla('Selecciona el conductor');
    const { conductor, listaCompleta } = await conductores.buscar(datos.conductor_usuario);
    if (conductor) {
      return { conductor_usuario: conductor.usuario, conductor_nombre: conductor.nombre, conductor_documento: null, conductor_otro: false, empresa: null };
    }
    // Con el AD sin responder del todo no se bloquea la portería: se acepta el usuario con el nombre del front.
    if (listaCompleta || !datos.conductor_nombre) throw regla('El conductor no está en la lista. Elige "otro" y escribe el nombre.');
    return { conductor_usuario: datos.conductor_usuario, conductor_nombre: datos.conductor_nombre, conductor_documento: null, conductor_otro: false, empresa: null };
  }

  const copiar = (datos, campos) => Object.fromEntries(campos.map((c) => [c, datos[c] ?? null]));

  /**
   * Columnas de detalle de un evento. En una corrección, `conservar` copia lo que no cambió sin volver a
   * consultar H360 ni el AD (una asistencia ya cerrada no impide corregir el kilometraje).
   */
  async function resolver({ tipo, sentido, datos, conservar = {} }) {
    const motivo = await motivos.obtener(datos.motivo_id);
    if (!conservar.referencia && (!motivo || !motivo.activo || !aplica(motivo, tipo, sentido))) {
      throw regla('El motivo no aplica a este vehículo o sentido');
    }
    const referencia = conservar.referencia
      ? copiar(datos, ['asistencia_id', 'exequia_id', 'referencia_texto', 'referencia_snapshot'])
      : await resolverReferencia(motivo, datos);
    const conductor = conservar.conductor
      ? { ...copiar(datos, CAMPOS_CONDUCTOR), conductor_otro: Boolean(datos.conductor_otro) }
      : await resolverConductor(tipo, datos);
    return {
      motivo: { id: motivo.id, codigo: motivo.codigo, nombre: motivo.nombre },
      columnas: {
        motivo_id: motivo.id,
        ...referencia,
        ...conductor,
        kilometraje: tipo === 'PROPIO' ? datos.kilometraje ?? null : null,
        observaciones: datos.observaciones ?? null,
      },
    };
  }

  return { resolver };
}

module.exports = {
  leerEntradaRegistro, leerCambiosCorreccion, crearResolutorDetalle, CAMPOS_REFERENCIA, CAMPOS_CONDUCTOR, TIPOS, SENTIDOS,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/porteria/__tests__/detalleEvento.test.js` → PASS. Run: `npx jest src/porteria` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/services/detalleEvento.js src/porteria/__tests__/detalleEvento.test.js
git commit -m "feat(porteria): validación de entrada y detalle del evento (motivo, referencia y conductor)"
```

---

### Task 5: Servicio de eventos — registrar

**Files:**
- Create: `src/porteria/services/eventos.service.js`
- Test: `src/porteria/__tests__/eventos.registrar.int.test.js`

**Interfaces:**
- Consumes: `conTransaccion` (Task 1); repos `eventos`, `estado`, `auditoria`, `vehiculosExternos`, `motivos` (Task 2); `leerEntradaRegistro`, `crearResolutorDetalle` (Task 4); `h360.obtenerVehiculoPropioPorPlaca`.
- Produces: `crearServicioEventos({ bd, h360, conductores, motivos, vehiculosExternos }) → { registrar(body, sesion, ctx), listar(filtros, opciones), obtener(id) }` (Task 6 agrega `corregir` y `anular` al mismo objeto). `sesion` = `req.porUsuario` (`{ usuario, rol, sede_id, … }`); `ctx` = `{ ip, apiCodigo }`. `registrar` devuelve el evento (forma del repositorio).
  - 409 `SENTIDO_INCOHERENTE` con `errors: { estado: { dentro, sede_id, desde } }`.

- [ ] **Step 1: Write the failing integration test**

```js
// src/porteria/__tests__/eventos.registrar.int.test.js
// Placas E5…, ids 2501-2599.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');

let conn;
let bd;
let eventos;
let listaCompleta = true;
const m = {};
const sesionA = { usuario: 'guarda1', nombre: 'Guarda Uno', rol: 'guarda', sede_id: 2501, sede_nombre: 'E5 Norte' };
const sesionB = { ...sesionA, usuario: 'guarda2', sede_id: 2502, sede_nombre: 'E5 Sur' };
const errorDe = (p) => p.then(() => undefined, (e) => e);
const estadoDe = async (placa) => (await conn.query('SELECT * FROM por_estado_vehiculo WHERE placa = ?', [placa]))[0][0];

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo', 'por_vehiculos_externos']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'E5%'`);
  for (const t of ['asistencias', 'vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2500 AND 2599`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2501, 'E5N', 'E5 Norte', 'Cúcuta', 1), (2502, 'E5S', 'E5 Sur', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2501, 'E5P-001', 'Ford', 'F', 'CARROZA', 1), (2502, 'E5P 002', 'Kia', 'K', 'CARROZA', 1), (2503, 'E5P003', 'Kia', 'K', 'CARROZA', 1)");
  await conn.query("INSERT INTO asistencias (id, codigo, nombre_ser_querido, contrato, estado) VALUES (2501, 'H360-E5-2501', 'María Gómez', 'C-1', 'NUEVO'), (2502, 'H360-E5-2502', 'Ana', 'C-2', 'CERRADO')");
  const [motivos] = await conn.query('SELECT id, codigo FROM por_motivos');
  for (const { id, codigo } of motivos) m[codigo] = id;

  const conductores = {
    buscar: async (u) => ({ conductor: u === 'jperez' ? { usuario: 'jperez', nombre: 'Juan Pérez' } : null, listaCompleta }),
  };
  eventos = crearServicioEventos({
    bd, h360: crearH360Lectura(bd), conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos: crearRepositorioVehiculosExternos(bd),
  });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('propio sin historial: la primera salida es coherente y deja la salida abierta', async () => {
  const ev = await eventos.registrar(
    { sentido: 'SALIDA', placa: 'e5p 001', motivo_id: m.TANQUEO, conductor_usuario: 'jperez', kilometraje: 1000 },
    sesionA, { ip: '10.0.0.5', apiCodigo: 'POR-EVT-001' },
  );
  expect(ev).toMatchObject({
    placa: 'E5P001', tipo_vehiculo: 'PROPIO', vehiculo_id: 2501, sentido: 'SALIDA', sede_id: 2501, registrado_por: 'guarda1',
    conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez', kilometraje: 1000, inconsistente: false, evento_par_id: null,
    motivo: { codigo: 'TANQUEO' },
  });
  expect(await estadoDe('E5P001')).toMatchObject({ dentro: 0, sede_id: 2501, tipo_vehiculo: 'PROPIO', ultimo_evento_id: ev.id, salida_abierta_id: ev.id });
  const [[aud]] = await conn.query("SELECT * FROM por_auditoria WHERE entidad = 'evento' AND entidad_id = ?", [ev.id]);
  expect(aud).toMatchObject({ accion: 'CREAR', usuario: 'guarda1', api_codigo: 'POR-EVT-001', ip: '10.0.0.5' });
  expect(aud.despues).toMatchObject({ id: ev.id, placa: 'E5P001' });
});

test('el ingreso por otra sede cierra el viaje', async () => {
  const salida = (await estadoDe('E5P001')).salida_abierta_id;
  const ev = await eventos.registrar({ sentido: 'INGRESO', placa: 'E5P001', motivo_id: m.TANQUEO, conductor_usuario: 'jperez', kilometraje: 1042 }, sesionB);
  expect(ev).toMatchObject({ evento_par_id: salida, inconsistente: false, sede_id: 2502 });
  expect(await estadoDe('E5P001')).toMatchObject({ dentro: 1, sede_id: 2502, ultimo_evento_id: ev.id, salida_abierta_id: null });
});

test('ingreso estando dentro: 409; forzar exige observación y queda inconsistente', async () => {
  const cuerpo = { sentido: 'INGRESO', placa: 'E5P001', motivo_id: m.LAVADO, conductor_usuario: 'jperez' };
  const err = await errorDe(eventos.registrar(cuerpo, sesionA));
  expect(err).toMatchObject({ statusCode: 409, motivo: 'SENTIDO_INCOHERENTE' });
  expect(err.message).toMatch(/figura dentro/);
  expect(err.errors.estado).toMatchObject({ dentro: true, sede_id: 2502, desde: expect.any(Date) });

  expect(await errorDe(eventos.registrar({ ...cuerpo, forzar: true }, sesionA)))
    .toMatchObject({ statusCode: 422, message: 'Escribe una observación para registrar igual' });

  const ev = await eventos.registrar({ ...cuerpo, forzar: true, observaciones: 'Entró sin registrar salida' }, sesionA);
  expect(ev).toMatchObject({ inconsistente: true, inconsistencia_tipo: 'INGRESO_ESTANDO_DENTRO', evento_par_id: null });
  const [[aud]] = await conn.query("SELECT accion FROM por_auditoria WHERE entidad = 'evento' AND entidad_id = ?", [ev.id]);
  expect(aud.accion).toBe('FORZAR');
});

test('proveedor nuevo: exige tipo, se guarda en el catálogo y la próxima vez se autocompleta', async () => {
  const cuerpo = { sentido: 'INGRESO', placa: 'E5V-001', motivo_id: m.ENTREGA_MERCANCIA, empresa: 'Flores del Norte', conductor_nombre: 'Ana', conductor_documento: '123' };
  expect(await errorDe(eventos.registrar(cuerpo, sesionA))).toMatchObject({ statusCode: 422, message: 'Indica el tipo de vehículo' });

  const ingreso = await eventos.registrar({ ...cuerpo, tipo_vehiculo: 'PROVEEDOR', guardar_en_catalogo: true }, sesionA);
  expect(ingreso).toMatchObject({ tipo_vehiculo: 'PROVEEDOR', empresa: 'Flores del Norte', vehiculo_externo_id: expect.any(Number), kilometraje: null });
  const [[catalogo]] = await conn.query("SELECT * FROM por_vehiculos_externos WHERE placa = 'E5V001'");
  expect(catalogo).toMatchObject({ id: ingreso.vehiculo_externo_id, tipo: 'PROVEEDOR', empresa: 'Flores del Norte', created_by: 'guarda1' });

  const salida = await eventos.registrar({ sentido: 'SALIDA', placa: 'E5V001', motivo_id: m.ENTREGA_MERCANCIA, conductor_nombre: 'Ana', conductor_documento: '123' }, sesionA);
  expect(salida).toMatchObject({ tipo_vehiculo: 'PROVEEDOR', empresa: 'Flores del Norte', vehiculo_externo_id: catalogo.id, evento_par_id: null });
  expect(await estadoDe('E5V001')).toMatchObject({ dentro: 0, salida_abierta_id: null });
});

test('proveedor sin historial: su salida es incoherente', async () => {
  const err = await errorDe(eventos.registrar({
    sentido: 'SALIDA', placa: 'E5V002', tipo_vehiculo: 'PROVEEDOR', motivo_id: m.ENTREGA_MERCANCIA, empresa: 'X', conductor_nombre: 'Y', conductor_documento: '1',
  }, sesionA));
  expect(err).toMatchObject({ statusCode: 409, motivo: 'SENTIDO_INCOHERENTE', errors: { estado: { dentro: false, sede_id: null, desde: null } } });
  expect(await estadoDe('E5V002')).toBeUndefined();
});

test('una placa de la empresa siempre es PROPIO; PROPIO con placa desconocida → 422', async () => {
  const ev = await eventos.registrar({ sentido: 'SALIDA', placa: 'E5P002', tipo_vehiculo: 'PROVEEDOR', motivo_id: m.LAVADO, conductor_otro: true, conductor_nombre: 'Pedro' }, sesionA);
  expect(ev).toMatchObject({ tipo_vehiculo: 'PROPIO', vehiculo_id: 2502, conductor_otro: true, conductor_usuario: null, conductor_nombre: 'Pedro' });
  expect(await errorDe(eventos.registrar({ sentido: 'SALIDA', placa: 'E5X999', tipo_vehiculo: 'PROPIO', motivo_id: m.LAVADO, conductor_usuario: 'jperez' }, sesionA)))
    .toMatchObject({ statusCode: 422, message: 'La placa no está registrada como vehículo de la empresa' });
});

test('motivo y referencia se validan contra H360 y se guarda el snapshot', async () => {
  const base = { sentido: 'INGRESO', placa: 'E5P002', conductor_usuario: 'jperez' };
  expect(await errorDe(eventos.registrar({ ...base, motivo_id: m.ENTREGA_MERCANCIA }, sesionA)))
    .toMatchObject({ statusCode: 422, message: 'El motivo no aplica a este vehículo o sentido' });
  expect(await errorDe(eventos.registrar({ ...base, motivo_id: m.SERES_QUERIDOS }, sesionA)))
    .toMatchObject({ statusCode: 422, message: 'Selecciona la asistencia' });
  expect(await errorDe(eventos.registrar({ ...base, motivo_id: m.SERES_QUERIDOS, asistencia_id: 2502 }, sesionA)))
    .toMatchObject({ statusCode: 422, message: 'La asistencia no existe o ya no está activa' });

  const ev = await eventos.registrar({ ...base, motivo_id: m.SERES_QUERIDOS, asistencia_id: 2501 }, sesionA);
  expect(ev).toMatchObject({
    asistencia_id: 2501,
    referencia: { tipo: 'ASISTENCIA', codigo: 'H360-E5-2501', nombre_ser_querido: 'María Gómez', contrato: 'C-1' },
  });
});

test('conductor fuera de la lista: 422 con la lista completa; aceptado si el AD no respondió', async () => {
  const cuerpo = { sentido: 'SALIDA', placa: 'E5P002', motivo_id: m.LAVADO, conductor_usuario: 'nadie', conductor_nombre: 'Nadie N' };
  listaCompleta = true;
  expect(await errorDe(eventos.registrar(cuerpo, sesionA))).toMatchObject({ statusCode: 422 });
  listaCompleta = false;
  try {
    expect(await eventos.registrar(cuerpo, sesionA)).toMatchObject({ conductor_usuario: 'nadie', conductor_nombre: 'Nadie N' });
  } finally {
    listaCompleta = true;
  }
});

test('dos primeros registros simultáneos de una placa nueva: uno pasa y el otro es 409, nunca 500', async () => {
  const intento = () => eventos.registrar({
    sentido: 'INGRESO', placa: 'E5C001', tipo_vehiculo: 'PROVEEDOR', motivo_id: m.ENTREGA_MERCANCIA, empresa: 'X', conductor_nombre: 'Y', conductor_documento: '1',
  }, sesionA).then(() => 'ok', (e) => e.statusCode || e);
  const resultados = await Promise.all([intento(), intento()]);
  expect(resultados.sort()).toEqual([409, 'ok']);
  const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM por_eventos WHERE placa = 'E5C001'");
  expect(n).toBe(1);
});

test('dos salidas simultáneas de una placa con historial: una pasa y la otra es 409', async () => {
  const intento = () => eventos.registrar({ sentido: 'SALIDA', placa: 'E5P003', motivo_id: m.LAVADO, conductor_usuario: 'jperez' }, sesionA)
    .then(() => 'ok', (e) => e.statusCode || e);
  expect(await intento()).toBe('ok');
  await eventos.registrar({ sentido: 'INGRESO', placa: 'E5P003', motivo_id: m.LAVADO, conductor_usuario: 'jperez' }, sesionA);
  const resultados = await Promise.all([intento(), intento()]);
  expect(resultados.sort()).toEqual([409, 'ok']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:porteria:int` → FAIL (`Cannot find module '../services/eventos.service'`).

- [ ] **Step 3: Write minimal implementation**

```js
// src/porteria/services/eventos.service.js
// Registro de ingresos y salidas (diseño §7). Lo que viene de H360 y del AD se valida antes de abrir la
// transacción; dentro de ella se bloquea la placa, se decide la coherencia del sentido, se inserta el
// evento, se actualiza el estado y se audita.
const PorteriaError = require('../utils/PorteriaError');
const { conTransaccion } = require('../utils/transaccion');
const repoEventos = require('../repositorios/eventos');
const repoEstado = require('../repositorios/estado');
const { registrarAuditoria } = require('../repositorios/auditoria');
const { leerEntradaRegistro, crearResolutorDetalle } = require('./detalleEvento');

const regla = (message) => new PorteriaError(422, 'VALIDACION', message);

function crearServicioEventos({ bd, h360, conductores, motivos, vehiculosExternos }) {
  const resolutor = crearResolutorDetalle({ h360, conductores, motivos });

  async function resolverVehiculo(entrada) {
    const vehiculo = await h360.obtenerVehiculoPropioPorPlaca(entrada.placa);
    if (vehiculo) return { tipo: 'PROPIO', vehiculo, externo: null };
    if (entrada.tipo_vehiculo === 'PROPIO') throw regla('La placa no está registrada como vehículo de la empresa');
    const externo = await vehiculosExternos.obtenerPorPlaca(entrada.placa);
    const tipo = externo ? externo.tipo : entrada.tipo_vehiculo;
    if (!tipo) throw regla('Indica el tipo de vehículo');
    return { tipo, vehiculo: null, externo };
  }

  /** El id del catálogo: el existente, o uno nuevo si el guarda pidió guardarlo (sin duplicar en carreras). */
  async function idEnCatalogo(conn, { tipo, externo, entrada, empresa, usuario }) {
    if (tipo === 'PROPIO') return null;
    if (externo) return externo.id;
    if (!entrada.guardar_en_catalogo) return null;
    try {
      return await vehiculosExternos.crear({ placa: entrada.placa, tipo, empresa, descripcion: null, usuario }, conn);
    } catch (err) {
      if (err.motivo !== 'PLACA_DUPLICADA') throw err;
      return (await vehiculosExternos.obtenerPorPlaca(entrada.placa, conn)).id;
    }
  }

  async function registrar(body, sesion, ctx = {}) {
    const entrada = leerEntradaRegistro(body);
    const { tipo, vehiculo, externo } = await resolverVehiculo(entrada);
    const { columnas } = await resolutor.resolver({
      tipo, sentido: entrada.sentido, datos: { ...entrada, empresa: entrada.empresa ?? (externo && externo.empresa) ?? null },
    });

    return conTransaccion(bd, async (conn) => {
      const estado = await repoEstado.bloquear(conn, entrada.placa);
      const conHistoria = estado.ultimo_evento_id !== null;
      // Sin historial, un propio está en la sede (su primer movimiento es salir) y un proveedor está fuera.
      const dentro = conHistoria ? estado.dentro === 1 : tipo === 'PROPIO';
      const esIngreso = entrada.sentido === 'INGRESO';
      const incoherente = esIngreso === dentro;

      if (incoherente && !entrada.forzar) {
        const ultimo = conHistoria ? await repoEventos.obtener(conn, estado.ultimo_evento_id) : null;
        throw new PorteriaError(
          409, 'SENTIDO_INCOHERENTE',
          dentro
            ? 'Este vehículo figura dentro. Para registrar el ingreso igual, confírmalo y escribe una observación.'
            : 'Este vehículo figura fuera. Para registrar la salida igual, confírmalo y escribe una observación.',
          { estado: { dentro, sede_id: estado.sede_id, desde: ultimo ? ultimo.registrado_at : null } },
        );
      }
      if (incoherente && !columnas.observaciones) throw regla('Escribe una observación para registrar igual');

      const vehiculoExternoId = await idEnCatalogo(conn, { tipo, externo, entrada, empresa: columnas.empresa, usuario: sesion.usuario });
      const id = await repoEventos.insertar(conn, {
        sede_id: sesion.sede_id,
        sentido: entrada.sentido,
        tipo_vehiculo: tipo,
        placa: entrada.placa,
        vehiculo_id: vehiculo ? vehiculo.id : null,
        vehiculo_externo_id: vehiculoExternoId,
        ...columnas,
        // Solo los propios dejan salida abierta: su ingreso cierra el viaje, sin importar la sede.
        evento_par_id: esIngreso ? estado.salida_abierta_id : null,
        inconsistente: incoherente ? 1 : 0,
        inconsistencia_tipo: incoherente ? (esIngreso ? 'INGRESO_ESTANDO_DENTRO' : 'SALIDA_ESTANDO_FUERA') : null,
        registrado_por: sesion.usuario,
      });
      await repoEstado.guardar(conn, {
        placa: entrada.placa,
        tipo_vehiculo: tipo,
        sede_id: sesion.sede_id,
        dentro: esIngreso ? 1 : 0,
        ultimo_evento_id: id,
        salida_abierta_id: !esIngreso && tipo === 'PROPIO' ? id : null,
      });
      const creado = await repoEventos.obtener(conn, id);
      await registrarAuditoria(conn, {
        usuario: sesion.usuario, apiCodigo: ctx.apiCodigo, entidad: 'evento', entidadId: id,
        accion: incoherente ? 'FORZAR' : 'CREAR', despues: creado, ip: ctx.ip,
      });
      return creado;
    });
  }

  return {
    registrar,
    listar: (filtros, opciones) => repoEventos.listar(bd.obtener(), filtros, opciones),
    obtener: (id) => repoEventos.obtener(bd.obtener(), id),
  };
}

module.exports = { crearServicioEventos };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:porteria:int` → PASS (repite la corrida dos o tres veces: las pruebas de concurrencia no deben fallar de forma intermitente). Run: `npx jest src/porteria` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/services/eventos.service.js src/porteria/__tests__/eventos.registrar.int.test.js
git commit -m "feat(porteria): registro de ingresos y salidas con estado, coherencia de sentido y auditoría"
```

---

### Task 6: Servicio de eventos — corregir y anular

**Files:**
- Modify: `src/porteria/services/eventos.service.js` (+ `corregir`, `anular`)
- Test: `src/porteria/__tests__/eventos.edicion.int.test.js`

**Interfaces:**
- Consumes: Task 2, Task 4 (`leerCambiosCorreccion`, `CAMPOS_REFERENCIA`, `CAMPOS_CONDUCTOR`), `ROLES` (`auth.service.js`).
- Produces (en el objeto de `crearServicioEventos`):
  - `corregir(id, body, sesion, ctx) → evento`. 404 `NO_ENCONTRADO` `'El registro no existe'`; 409 `ANULADO` `'El registro está anulado'`; 403 `SIN_PERMISO` `'Solo puedes corregir o anular tus registros de los últimos 15 minutos'`; un registro forzado no puede quedar sin observación (422 `'El registro forzado necesita una observación'`).
  - `anular(id, body, sesion, ctx) → evento`. `body.motivo` obligatorio (≤255, 400 `'Escribe el motivo de la anulación'`); ya anulado → 409 `ANULADO` `'El registro ya está anulado'`. Recalcula el estado de la placa desde su último evento vigente; si no queda ninguno, borra su fila de estado.

- [ ] **Step 1: Write the failing integration test**

```js
// src/porteria/__tests__/eventos.edicion.int.test.js
// Placas E6…, ids 2601-2699.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');

let conn;
let bd;
let eventos;
const m = {};
const guarda1 = { usuario: 'guarda1', nombre: 'G1', rol: 'guarda', sede_id: 2601, sede_nombre: 'E6' };
const guarda2 = { ...guarda1, usuario: 'guarda2' };
const admin = { usuario: 'admin1', nombre: 'A', rol: 'admin_porteria', sede_id: 2601, sede_nombre: 'E6' };
const errorDe = (p) => p.then(() => undefined, (e) => e);
const estadoDe = async (placa) => (await conn.query('SELECT * FROM por_estado_vehiculo WHERE placa = ?', [placa]))[0][0];
const auditoriaDe = async (id, accion) => (await conn.query(
  "SELECT * FROM por_auditoria WHERE entidad = 'evento' AND entidad_id = ? AND accion = ? ORDER BY id DESC LIMIT 1", [id, accion],
))[0][0];
const salidaPropia = (placa, extra = {}) => ({ sentido: 'SALIDA', placa, motivo_id: m.TANQUEO, conductor_usuario: 'jperez', ...extra });

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo', 'por_vehiculos_externos']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'E6%'`);
  for (const t of ['asistencias', 'vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2600 AND 2699`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2601, 'E6', 'E6', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2601, 'E6P001', 'F', 'F', 'CARROZA', 1), (2602, 'E6P002', 'F', 'F', 'CARROZA', 1)");
  await conn.query("INSERT INTO asistencias (id, codigo, nombre_ser_querido, contrato, estado) VALUES (2601, 'H360-E6-2601', 'Luis', 'C-6', 'NUEVO')");
  const [motivos] = await conn.query('SELECT id, codigo FROM por_motivos');
  for (const { id, codigo } of motivos) m[codigo] = id;
  const conductores = { buscar: async (u) => ({ conductor: u === 'jperez' ? { usuario: 'jperez', nombre: 'Juan Pérez' } : null, listaCompleta: true }) };
  eventos = crearServicioEventos({
    bd, h360: crearH360Lectura(bd), conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos: crearRepositorioVehiculosExternos(bd),
  });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

describe('corregir', () => {
  let salida;
  beforeAll(async () => { salida = await eventos.registrar(salidaPropia('E6P001', { kilometraje: 10 }), guarda1); });

  test('el guarda corrige su registro reciente y queda auditado', async () => {
    const corregido = await eventos.corregir(salida.id, { motivo_id: m.LAVADO, kilometraje: 20 }, guarda1, { ip: '10.0.0.6', apiCodigo: 'POR-EVT-004' });
    expect(corregido).toMatchObject({ motivo: { codigo: 'LAVADO' }, kilometraje: 20, corregido_por: 'guarda1', placa: 'E6P001' });
    const aud = await auditoriaDe(salida.id, 'CORREGIR');
    expect(aud).toMatchObject({ usuario: 'guarda1', api_codigo: 'POR-EVT-004' });
    expect(aud.antes.motivo.codigo).toBe('TANQUEO');
    expect(aud.despues.motivo.codigo).toBe('LAVADO');
  });

  test('otro guarda o pasados 15 minutos → 403; el admin sí puede', async () => {
    const permiso = { statusCode: 403, motivo: 'SIN_PERMISO', message: 'Solo puedes corregir o anular tus registros de los últimos 15 minutos' };
    expect(await errorDe(eventos.corregir(salida.id, { kilometraje: 21 }, guarda2))).toMatchObject(permiso);
    await conn.query('UPDATE por_eventos SET registrado_at = NOW() - INTERVAL 16 MINUTE WHERE id = ?', [salida.id]);
    expect(await errorDe(eventos.corregir(salida.id, { kilometraje: 21 }, guarda1))).toMatchObject(permiso);
    expect(await eventos.corregir(salida.id, { kilometraje: 22 }, admin)).toMatchObject({ kilometraje: 22, corregido_por: 'admin1' });
  });

  test('placa o sentido no se corrigen; sin cambios → 400; inexistente → 404', async () => {
    expect(await errorDe(eventos.corregir(salida.id, { sentido: 'INGRESO' }, admin))).toMatchObject({ statusCode: 400 });
    expect(await errorDe(eventos.corregir(salida.id, {}, admin))).toMatchObject({ statusCode: 400, message: 'No hay cambios' });
    expect(await errorDe(eventos.corregir(999999999, { kilometraje: 1 }, admin))).toMatchObject({ statusCode: 404, motivo: 'NO_ENCONTRADO', message: 'El registro no existe' });
  });

  test('lo que no cambia no se revalida contra H360', async () => {
    const ingreso = await eventos.registrar({ sentido: 'INGRESO', placa: 'E6P001', motivo_id: m.SERES_QUERIDOS, asistencia_id: 2601, conductor_usuario: 'jperez' }, guarda1);
    await conn.query("UPDATE asistencias SET estado = 'CERRADO' WHERE id = 2601");
    try {
      expect(await eventos.corregir(ingreso.id, { kilometraje: 30 }, guarda1)).toMatchObject({ kilometraje: 30, asistencia_id: 2601 });
      expect(await errorDe(eventos.corregir(ingreso.id, { asistencia_id: 2601 }, guarda1)))
        .toMatchObject({ statusCode: 422, message: 'La asistencia no existe o ya no está activa' });
    } finally {
      await conn.query("UPDATE asistencias SET estado = 'NUEVO' WHERE id = 2601");
    }
  });

  test('un registro forzado no puede quedar sin observación', async () => {
    const forzado = await eventos.registrar(salidaPropia('E6P001', { forzar: true, observaciones: 'x', sentido: 'INGRESO' }), guarda1);
    expect(forzado.inconsistente).toBe(true);
    expect(await errorDe(eventos.corregir(forzado.id, { observaciones: '' }, guarda1)))
      .toMatchObject({ statusCode: 422, message: 'El registro forzado necesita una observación' });
  });
});

describe('anular', () => {
  test('anular el ingreso que cerraba el viaje reabre la salida', async () => {
    const salida = await eventos.registrar(salidaPropia('E6P002'), guarda1);
    const ingreso = await eventos.registrar({ ...salidaPropia('E6P002'), sentido: 'INGRESO' }, guarda1);
    expect(ingreso.evento_par_id).toBe(salida.id);

    const anulado = await eventos.anular(ingreso.id, { motivo: 'Se registró dos veces' }, guarda1, { ip: '10.0.0.7', apiCodigo: 'POR-EVT-005' });
    expect(anulado).toMatchObject({ anulado: true, anulado_por: 'guarda1', anulado_motivo: 'Se registró dos veces', evento_par_id: null });
    expect(await estadoDe('E6P002')).toMatchObject({ dentro: 0, ultimo_evento_id: salida.id, salida_abierta_id: salida.id });
    expect(await auditoriaDe(ingreso.id, 'ANULAR')).toMatchObject({ usuario: 'guarda1', api_codigo: 'POR-EVT-005' });

    expect(await errorDe(eventos.anular(ingreso.id, { motivo: 'otra vez' }, guarda1)))
      .toMatchObject({ statusCode: 409, motivo: 'ANULADO', message: 'El registro ya está anulado' });
    expect(await errorDe(eventos.corregir(ingreso.id, { kilometraje: 1 }, admin)))
      .toMatchObject({ statusCode: 409, motivo: 'ANULADO', message: 'El registro está anulado' });
  });

  test('anular la salida de un viaje cerrado suelta el par y deja el vehículo dentro', async () => {
    const ingresoNuevo = await eventos.registrar({ ...salidaPropia('E6P002'), sentido: 'INGRESO' }, guarda1);
    const ultimaSalida = (await conn.query("SELECT id FROM por_eventos WHERE placa = 'E6P002' AND sentido = 'SALIDA' AND anulado = 0"))[0][0].id;
    await eventos.anular(ultimaSalida, { motivo: 'No salió' }, admin);
    expect((await eventos.obtener(ingresoNuevo.id)).evento_par_id).toBeNull();
    expect(await estadoDe('E6P002')).toMatchObject({ dentro: 1, ultimo_evento_id: ingresoNuevo.id, salida_abierta_id: null });
  });

  test('anular el único evento de una placa borra su estado', async () => {
    const ev = await eventos.registrar({
      sentido: 'INGRESO', placa: 'E6V001', tipo_vehiculo: 'PROVEEDOR', motivo_id: m.ENTREGA_MERCANCIA, empresa: 'X', conductor_nombre: 'Y', conductor_documento: '1',
    }, guarda1);
    await eventos.anular(ev.id, { motivo: 'Placa equivocada' }, guarda1);
    expect(await estadoDe('E6V001')).toBeUndefined();
  });

  test('sin motivo → 400; de otro guarda → 403', async () => {
    const ev = await eventos.registrar({
      sentido: 'INGRESO', placa: 'E6V002', tipo_vehiculo: 'PROVEEDOR', motivo_id: m.ENTREGA_MERCANCIA, empresa: 'X', conductor_nombre: 'Y', conductor_documento: '1',
    }, guarda1);
    expect(await errorDe(eventos.anular(ev.id, { motivo: '  ' }, guarda1)))
      .toMatchObject({ statusCode: 400, message: 'Escribe el motivo de la anulación' });
    expect(await errorDe(eventos.anular(ev.id, {}, guarda1))).toMatchObject({ statusCode: 400 });
    expect(await errorDe(eventos.anular(ev.id, { motivo: 'x' }, guarda2))).toMatchObject({ statusCode: 403 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:porteria:int` → FAIL (`eventos.corregir is not a function`).

- [ ] **Step 3: Write minimal implementation**

En `src/porteria/services/eventos.service.js`, ampliar los `require` del inicio:

```js
const { ROLES } = require('./auth.service');
const {
  leerEntradaRegistro, leerCambiosCorreccion, crearResolutorDetalle, CAMPOS_REFERENCIA, CAMPOS_CONDUCTOR,
} = require('./detalleEvento');

const QUINCE_MINUTOS = 15 * 60;
const noExiste = () => new PorteriaError(404, 'NO_ENCONTRADO', 'El registro no existe');
```

Dentro de `crearServicioEventos`, antes del `return`, agregar:

```js
  async function verificarPermisoEdicion(evento, sesion) {
    if (sesion.rol === ROLES.ADMIN) return;
    const segundos = await repoEventos.antiguedadSegundos(bd.obtener(), evento.id);
    if (evento.registrado_por !== sesion.usuario || segundos > QUINCE_MINUTOS) {
      throw new PorteriaError(403, 'SIN_PERMISO', 'Solo puedes corregir o anular tus registros de los últimos 15 minutos');
    }
  }

  async function cargarEditable(id, sesion, mensajeAnulado) {
    const evento = await repoEventos.obtener(bd.obtener(), id);
    if (!evento) throw noExiste();
    if (evento.anulado) throw new PorteriaError(409, 'ANULADO', mensajeAnulado);
    await verificarPermisoEdicion(evento, sesion);
    return evento;
  }

  /** Lo que se corrige de un evento, tal como está guardado. */
  const datosDe = (e) => ({
    motivo_id: e.motivo_id, asistencia_id: e.asistencia_id, exequia_id: e.exequia_id, referencia_texto: e.referencia_texto,
    referencia_snapshot: e.referencia, conductor_usuario: e.conductor_usuario, conductor_nombre: e.conductor_nombre,
    conductor_documento: e.conductor_documento, conductor_otro: e.conductor_otro, empresa: e.empresa,
    kilometraje: e.kilometraje, observaciones: e.observaciones,
  });

  async function corregir(id, body, sesion, ctx = {}) {
    const cambios = leerCambiosCorreccion(body);
    const actual = await cargarEditable(id, sesion, 'El registro está anulado');
    const cambia = (campos) => campos.some((c) => c in cambios);
    const { columnas } = await resolutor.resolver({
      tipo: actual.tipo_vehiculo,
      sentido: actual.sentido,
      datos: { ...datosDe(actual), ...cambios },
      conservar: { referencia: !cambia(CAMPOS_REFERENCIA), conductor: !cambia(CAMPOS_CONDUCTOR) },
    });
    if (actual.inconsistente && !columnas.observaciones) throw regla('El registro forzado necesita una observación');

    return conTransaccion(bd, async (conn) => {
      const antes = await repoEventos.obtener(conn, id, { bloquear: true });
      if (antes.anulado) throw new PorteriaError(409, 'ANULADO', 'El registro está anulado');
      await repoEventos.actualizar(conn, id, columnas, sesion.usuario);
      const despues = await repoEventos.obtener(conn, id);
      await registrarAuditoria(conn, {
        usuario: sesion.usuario, apiCodigo: ctx.apiCodigo, entidad: 'evento', entidadId: id, accion: 'CORREGIR', antes, despues, ip: ctx.ip,
      });
      return despues;
    });
  }

  /** El estado de la placa vuelve a ser el de su último evento vigente; sin ninguno, la placa no tiene estado. */
  async function recalcularEstado(conn, placa) {
    const ultimo = await repoEventos.ultimoVigente(conn, placa);
    if (!ultimo) return repoEstado.borrar(conn, placa);
    return repoEstado.guardar(conn, {
      placa,
      tipo_vehiculo: ultimo.tipo_vehiculo,
      sede_id: ultimo.sede_id,
      dentro: ultimo.sentido === 'INGRESO' ? 1 : 0,
      ultimo_evento_id: ultimo.id,
      salida_abierta_id: ultimo.sentido === 'SALIDA' && ultimo.tipo_vehiculo === 'PROPIO' ? ultimo.id : null,
    });
  }

  async function anular(id, body, sesion, ctx = {}) {
    const motivo = typeof (body && body.motivo) === 'string' ? body.motivo.trim() : '';
    if (!motivo || motivo.length > 255) throw new PorteriaError(400, 'VALIDACION', 'Escribe el motivo de la anulación');
    const actual = await cargarEditable(id, sesion, 'El registro ya está anulado');

    return conTransaccion(bd, async (conn) => {
      // Mismo orden de bloqueo que registrar: primero la placa, después el evento.
      await repoEstado.bloquear(conn, actual.placa);
      const antes = await repoEventos.obtener(conn, id, { bloquear: true });
      if (antes.anulado) throw new PorteriaError(409, 'ANULADO', 'El registro ya está anulado');
      await repoEventos.anular(conn, id, { usuario: sesion.usuario, motivo });
      await recalcularEstado(conn, actual.placa);
      const despues = await repoEventos.obtener(conn, id);
      await registrarAuditoria(conn, {
        usuario: sesion.usuario, apiCodigo: ctx.apiCodigo, entidad: 'evento', entidadId: id, accion: 'ANULAR', antes, despues, ip: ctx.ip,
      });
      return despues;
    });
  }
```

y el `return` del servicio pasa a:

```js
  return {
    registrar,
    corregir,
    anular,
    listar: (filtros, opciones) => repoEventos.listar(bd.obtener(), filtros, opciones),
    obtener: (id) => repoEventos.obtener(bd.obtener(), id),
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:porteria:int` → PASS. Run: `npx jest src/porteria` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/services/eventos.service.js src/porteria/__tests__/eventos.edicion.int.test.js
git commit -m "feat(porteria): corrección y anulación auditadas, con recálculo del estado"
```

---

### Task 7: Servicio de estado

**Files:**
- Create: `src/porteria/services/estado.service.js`
- Test: `src/porteria/__tests__/estado.int.test.js`

**Interfaces:**
- Consumes: `repositorios/estado.js`, `repositorios/eventos.js` (Task 2), `normalizarPlaca`, `h360.obtenerVehiculoPropioPorPlaca`, `vehiculosExternos.obtenerPorPlaca`.
- Produces: `crearServicioEstado({ bd, h360, vehiculosExternos }) →`
  - `sugerir(placa) → { placa, tipo_vehiculo: 'PROPIO'|'PROVEEDOR_ASISTENCIA'|'PROVEEDOR'|null, vehiculo, vehiculo_externo, estado: { dentro, sede_id, desde } | null, sentido_sugerido: 'INGRESO'|'SALIDA', propuesta }`. Placa vacía → 400 `'Indica la placa'`. `propuesta` (solo propio fuera con salida abierta) = `{ motivo, asistencia_id, exequia_id, referencia_texto, referencia, conductor_usuario, conductor_nombre, conductor_otro }`; si no, `null`.
  - `dentro(sedeId) → evento[]`; `fuera(sedeId | null) → evento[]`.

- [ ] **Step 1: Write the failing integration test**

```js
// src/porteria/__tests__/estado.int.test.js
// Placas S7…, ids 2701-2799.
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');
const { crearServicioEstado } = require('../services/estado.service');

let conn;
let bd;
let eventos;
let estado;
let vehiculosExternos;
const m = {};
const sesion = { usuario: 'guarda1', nombre: 'G', rol: 'guarda', sede_id: 2701, sede_nombre: 'S7' };

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo', 'por_vehiculos_externos']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'S7%'`);
  for (const t of ['vehiculos', 'sedes']) await conn.query(`DELETE FROM ${t} WHERE id BETWEEN 2700 AND 2799`);
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2701, 'S7', 'S7', 'Cúcuta', 1)");
  await conn.query("INSERT INTO vehiculos (id, placa, marca, modelo, tipo, activo) VALUES (2701, 'S7P-001', 'Ford', 'F', 'CARROZA', 1)");
  const [motivos] = await conn.query('SELECT id, codigo FROM por_motivos');
  for (const { id, codigo } of motivos) m[codigo] = id;
  const h360 = crearH360Lectura(bd);
  vehiculosExternos = crearRepositorioVehiculosExternos(bd);
  const conductores = { buscar: async (u) => ({ conductor: u === 'jperez' ? { usuario: 'jperez', nombre: 'Juan Pérez' } : null, listaCompleta: true }) };
  eventos = crearServicioEventos({ bd, h360, conductores, motivos: crearRepositorioMotivos(bd), vehiculosExternos });
  estado = crearServicioEstado({ bd, h360, vehiculosExternos });
});
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('propio sin historial: sugiere salida', async () => {
  expect(await estado.sugerir('s7p 001')).toMatchObject({
    placa: 'S7P001', tipo_vehiculo: 'PROPIO', vehiculo: { id: 2701, placa: 'S7P001' }, vehiculo_externo: null,
    estado: null, sentido_sugerido: 'SALIDA', propuesta: null,
  });
});

test('propio fuera: sugiere ingreso y propone lo de su salida', async () => {
  await eventos.registrar({ sentido: 'SALIDA', placa: 'S7P001', motivo_id: m.TANQUEO, conductor_usuario: 'jperez' }, sesion);
  const s = await estado.sugerir('S7P001');
  expect(s).toMatchObject({
    sentido_sugerido: 'INGRESO',
    estado: { dentro: false, sede_id: 2701, desde: expect.any(Date) },
    propuesta: { motivo: { codigo: 'TANQUEO' }, conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez', conductor_otro: false },
  });
});

test('proveedor desconocido o del catálogo', async () => {
  expect(await estado.sugerir('S7V999')).toMatchObject({ tipo_vehiculo: null, sentido_sugerido: 'INGRESO', estado: null, propuesta: null });
  await vehiculosExternos.crear({ placa: 'S7V001', tipo: 'PROVEEDOR', empresa: 'Cofres SA', usuario: 'x' });
  expect(await estado.sugerir('S7V001')).toMatchObject({ tipo_vehiculo: 'PROVEEDOR', vehiculo_externo: { empresa: 'Cofres SA' } });
});

test('dentro de la sede y propios fuera', async () => {
  await eventos.registrar({ sentido: 'INGRESO', placa: 'S7V001', motivo_id: m.ENTREGA_MERCANCIA, conductor_nombre: 'Y', conductor_documento: '1' }, sesion);
  const dentro = await estado.dentro(2701);
  expect(dentro.map((e) => e.placa)).toContain('S7V001');
  expect(dentro.find((e) => e.placa === 'S7V001')).toMatchObject({ motivo: { codigo: 'ENTREGA_MERCANCIA' }, empresa: 'Cofres SA' });
  expect((await estado.fuera(2701)).map((e) => e.placa)).toEqual(expect.arrayContaining(['S7P001']));
  expect((await estado.fuera(2701)).map((e) => e.placa)).not.toContain('S7V001');
  expect((await estado.fuera(null)).map((e) => e.placa)).toContain('S7P001');
});

test('placa vacía → 400', async () => {
  await expect(estado.sugerir(' - ')).rejects.toMatchObject({ statusCode: 400, motivo: 'VALIDACION', message: 'Indica la placa' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:porteria:int` → FAIL (`Cannot find module '../services/estado.service'`).

- [ ] **Step 3: Write minimal implementation**

```js
// src/porteria/services/estado.service.js
// Dónde está cada vehículo: sugerencia al escribir la placa, vehículos dentro de una sede y propios fuera.
const PorteriaError = require('../utils/PorteriaError');
const { normalizarPlaca } = require('../utils/placa');
const repoEstado = require('../repositorios/estado');
const repoEventos = require('../repositorios/eventos');

function crearServicioEstado({ bd, h360, vehiculosExternos }) {
  async function sugerir(placaCruda) {
    const placa = normalizarPlaca(typeof placaCruda === 'string' ? placaCruda : '');
    if (!placa) throw new PorteriaError(400, 'VALIDACION', 'Indica la placa');

    const [vehiculo, externo, estado] = await Promise.all([
      h360.obtenerVehiculoPropioPorPlaca(placa),
      vehiculosExternos.obtenerPorPlaca(placa),
      repoEstado.obtener(bd.obtener(), placa),
    ]);
    const tipo = vehiculo ? 'PROPIO' : externo ? externo.tipo : null;
    // Mismo criterio que al registrar: sin historial, un propio está dentro y un proveedor fuera.
    const dentro = estado ? estado.dentro === 1 : tipo === 'PROPIO';

    let propuesta = null;
    if (tipo === 'PROPIO' && estado && estado.salida_abierta_id) {
      const s = await repoEventos.obtener(bd.obtener(), estado.salida_abierta_id);
      if (s) {
        propuesta = {
          motivo: s.motivo, asistencia_id: s.asistencia_id, exequia_id: s.exequia_id, referencia_texto: s.referencia_texto,
          referencia: s.referencia, conductor_usuario: s.conductor_usuario, conductor_nombre: s.conductor_nombre, conductor_otro: s.conductor_otro,
        };
      }
    }

    return {
      placa,
      tipo_vehiculo: tipo,
      vehiculo,
      vehiculo_externo: externo,
      estado: estado ? { dentro: estado.dentro === 1, sede_id: estado.sede_id, desde: estado.desde } : null,
      sentido_sugerido: dentro ? 'SALIDA' : 'INGRESO',
      propuesta,
    };
  }

  return {
    sugerir,
    dentro: (sedeId) => repoEstado.dentroDeSede(bd.obtener(), sedeId),
    fuera: (sedeId) => repoEstado.propiosFuera(bd.obtener(), sedeId),
  };
}

module.exports = { crearServicioEstado };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:porteria:int` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/services/estado.service.js src/porteria/__tests__/estado.int.test.js
git commit -m "feat(porteria): sugerencia por placa, vehículos dentro y propios fuera"
```

---

### Task 8: Rutas `/eventos`, `/estado`, `/vehiculos-externos` y montaje

**Files:**
- Modify: `src/porteria/utils/texto.js` (+ `textoOpcional`, movido)
- Modify: `src/porteria/routes/catalogos.routes.js` (usa `textoOpcional` de `utils/texto.js`)
- Create: `src/porteria/routes/eventos.routes.js`
- Create: `src/porteria/routes/estado.routes.js`
- Create: `src/porteria/routes/vehiculosExternos.routes.js`
- Modify: `src/porteria/routes/index.js`
- Modify: `src/porteria/testing/appPrueba.js` (fakes nuevos)
- Modify: `src/porteria/__tests__/montaje.test.js` (prueba nueva al final)
- Test: `src/porteria/__tests__/eventos.routes.test.js`, `estado.routes.test.js`, `vehiculosExternos.routes.test.js`, `flujo.int.test.js`

**Interfaces:**
- Consumes: servicios de Tasks 5–7, `crearRepositorioVehiculosExternos` (Task 2), `sedeDeConsulta`, `requiereSede`, `requiereRol` (Task 3), `aw`, `apiCodigo`, `ROLES`, `TIPOS` de `detalleEvento.js`.
- Produces:
  - `textoOpcional(valor, max = 50) → string | undefined` en `utils/texto.js` (mismo comportamiento y mensaje que tenía en catálogos).
  - `crearRouterPorteria({ bd, obtenerConfig, directorio, conductores, h360?, motivos?, vehiculosExternos?, eventos?, estado? })`: los tres últimos por defecto se construyen desde los anteriores.
  - Rutas (todas con sesión):
    - `POST /eventos` (`POR-EVT-001`, `requiereSede`) → 201 evento.
    - `GET /eventos?desde&hasta&placa&tipo_vehiculo&motivo_id&inconsistente&pagina[&sede_id]` (`POR-EVT-002`) → `{ items, total, pagina, por_pagina }`. Sede por `sedeDeConsulta(req, { todasParaAdmin: true })`. Fechas `AAAA-MM-DD` (si no → 400 `'Fecha inválida (usa AAAA-MM-DD)'`); `tipo_vehiculo` fuera de los tipos → 400 `'Tipo de vehículo inválido'`; `motivo_id`/`pagina` no enteros positivos → 400 `'Motivo inválido'` / `'Página inválida'`; `placa` normalizada; `inconsistente` `'1'|'true'` → true, otro valor → false.
    - `GET /eventos/:id` (`POR-EVT-003`): el guarda solo ve eventos de su sede (si no, 404 `'El registro no existe'`); id no entero positivo → 404.
    - `PATCH /eventos/:id` (`POR-EVT-004`) → `eventos.corregir(id, body, porUsuario, ctx)`.
    - `POST /eventos/:id/anular` (`POR-EVT-005`) → `eventos.anular(id, body, porUsuario, ctx)`.
    - `GET /estado/dentro[?sede_id]` (`POR-EST-001`, `sedeDeConsulta(req)`); `GET /estado/fuera[?sede_id]` (`POR-EST-002`, `todasParaAdmin`); `GET /estado/placa/:placa` (`POR-EST-003`).
    - `GET /vehiculos-externos?q=` (`POR-VEX-001`); `POST /vehiculos-externos` (`POR-VEX-002`) `{ placa, tipo, empresa, descripcion? }` → 201 (placa de la empresa → 409 `PLACA_PROPIA` `'La placa es de un vehículo de la empresa'`); `PATCH /vehiculos-externos/:id` (`POR-VEX-003`, solo admin) `{ tipo?, empresa?, descripcion?, activo? }` → 200 / 404 `'El vehículo no existe'`.
  - `ctx` que reciben los servicios: `{ ip: req.ip, apiCodigo: req.porApiCodigo }`.

- [ ] **Step 1: Move `textoOpcional`**

En `src/porteria/utils/texto.js` agregar y exportar (`module.exports = { patronContiene, textoOpcional };`), con `const PorteriaError = require('./PorteriaError');` al inicio:

```js
/** Texto opcional de la query: recortado, vacío → undefined, máximo `max` caracteres. */
function textoOpcional(valor, max = 50) {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string') throw new PorteriaError(400, 'VALIDACION', 'La búsqueda es demasiado larga');
  const texto = valor.trim();
  if (texto.length > max) throw new PorteriaError(400, 'VALIDACION', 'La búsqueda es demasiado larga');
  return texto === '' ? undefined : texto;
}
```

En `src/porteria/routes/catalogos.routes.js`, borrar la función local `textoOpcional` y agregar `const { textoOpcional } = require('../utils/texto');`. Correr `npx jest src/porteria/__tests__/catalogos.routes.test.js` → PASS (sin cambios de comportamiento).

- [ ] **Step 2: Update the test app helper**

En `src/porteria/testing/appPrueba.js`, agregar al objeto `todas` (antes de `...deps`):

```js
    vehiculosExternos: {
      buscar: jest.fn(async () => []),
      obtenerPorId: jest.fn(async () => null),
      crear: jest.fn(async () => 1),
      actualizar: jest.fn(async () => true),
    },
    eventos: {
      registrar: jest.fn(async () => ({})),
      listar: jest.fn(async () => ({ items: [], total: 0, pagina: 1, por_pagina: 50 })),
      obtener: jest.fn(async () => null),
      corregir: jest.fn(async () => ({})),
      anular: jest.fn(async () => ({})),
    },
    estado: {
      sugerir: jest.fn(async () => ({})),
      dentro: jest.fn(async () => []),
      fuera: jest.fn(async () => []),
    },
```

y agregar `obtenerVehiculoPropioPorPlaca: jest.fn(async () => null),` al fake `h360`.

- [ ] **Step 3: Write the failing route tests**

```js
// src/porteria/__tests__/eventos.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const BASE = '/api/porteria/v1/eventos';
const guardaConSede = () => tokenDe({ sede: { id: 3, nombre: 'Norte' } });
const adminSinSede = () => tokenDe({ usuario: 'admin1', rol: 'admin_porteria' });

async function llamar(metodo, ruta, { token = guardaConSede(), cuerpo, prueba = crearAppPrueba() } = {}) {
  let r = request(await servir(prueba.app))[metodo](`${BASE}${ruta}`).set('Authorization', `Bearer ${token}`);
  if (cuerpo !== undefined) r = r.send(cuerpo);
  return { res: await r, deps: prueba.deps };
}

describe('POST /eventos', () => {
  test('exige sede de turno', async () => {
    const { res } = await llamar('post', '', { token: tokenDe(), cuerpo: {} });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'POR-EVT-001', motivo: 'SEDE_REQUERIDA' });
  });

  test('registra con la sesión y el contexto', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.eventos.registrar.mockResolvedValue({ id: 9, placa: 'ABC123' });
    const { res } = await llamar('post', '', { cuerpo: { sentido: 'INGRESO', placa: 'ABC123' }, prueba });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { id: 9, placa: 'ABC123' } });
    expect(prueba.deps.eventos.registrar).toHaveBeenCalledWith(
      { sentido: 'INGRESO', placa: 'ABC123' },
      expect.objectContaining({ usuario: 'guarda1', rol: 'guarda', sede_id: 3 }),
      { ip: expect.any(String), apiCodigo: 'POR-EVT-001' },
    );
  });

  test('los errores del servicio salen con el contrato', async () => {
    const PorteriaError = require('../utils/PorteriaError');
    const prueba = crearAppPrueba();
    prueba.deps.eventos.registrar.mockRejectedValue(new PorteriaError(409, 'SENTIDO_INCOHERENTE', 'Figura dentro', { estado: { dentro: true } }));
    const { res } = await llamar('post', '', { cuerpo: {}, prueba });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: 'POR-EVT-001', motivo: 'SENTIDO_INCOHERENTE', message: 'Figura dentro', errors: { estado: { dentro: true } } });
  });
});

describe('GET /eventos', () => {
  test('el guarda siempre lista su sede', async () => {
    const prueba = crearAppPrueba();
    await llamar('get', '?sede_id=99&placa=abc-1&desde=2026-10-01&inconsistente=1', { prueba });
    expect(prueba.deps.eventos.listar).toHaveBeenCalledWith(
      { sedeId: 3, desde: '2026-10-01', hasta: undefined, placa: 'ABC1', tipoVehiculo: undefined, motivoId: undefined, inconsistente: true },
      { pagina: 1 },
    );
  });

  test('el admin sin sede ve todas; con ?sede_id una', async () => {
    const prueba = crearAppPrueba();
    await llamar('get', '?pagina=2', { token: adminSinSede(), prueba });
    expect(prueba.deps.eventos.listar).toHaveBeenLastCalledWith(expect.objectContaining({ sedeId: null }), { pagina: 2 });
    await llamar('get', '?sede_id=5&inconsistente=0', { token: adminSinSede(), prueba });
    expect(prueba.deps.eventos.listar).toHaveBeenLastCalledWith(expect.objectContaining({ sedeId: 5, inconsistente: false }), { pagina: 1 });
  });

  test.each([
    ['?desde=30-10-2026', 'Fecha inválida (usa AAAA-MM-DD)'],
    ['?tipo_vehiculo=CAMION', 'Tipo de vehículo inválido'],
    ['?motivo_id=x', 'Motivo inválido'],
    ['?pagina=0', 'Página inválida'],
  ])('%s → 400', async (query, message) => {
    const { res } = await llamar('get', query);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'POR-EVT-002', motivo: 'VALIDACION', message });
  });
});

describe('GET /eventos/:id', () => {
  test('el guarda no ve eventos de otra sede', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.eventos.obtener.mockResolvedValue({ id: 4, sede_id: 8 });
    const { res } = await llamar('get', '/4', { prueba });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'POR-EVT-003', motivo: 'NO_ENCONTRADO', message: 'El registro no existe' });
  });

  test('evento de su sede; id inválido → 404', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.eventos.obtener.mockResolvedValue({ id: 4, sede_id: 3 });
    expect((await llamar('get', '/4', { prueba })).res.body.data).toEqual({ id: 4, sede_id: 3 });
    expect(prueba.deps.eventos.obtener).toHaveBeenCalledWith(4);
    expect((await llamar('get', '/abc')).res.status).toBe(404);
  });
});

test('PATCH y anular delegan en el servicio', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.eventos.corregir.mockResolvedValue({ id: 5, kilometraje: 2 });
  prueba.deps.eventos.anular.mockResolvedValue({ id: 5, anulado: true });
  const corregir = await llamar('patch', '/5', { cuerpo: { kilometraje: 2 }, prueba });
  expect(corregir.res.body.data).toEqual({ id: 5, kilometraje: 2 });
  expect(prueba.deps.eventos.corregir).toHaveBeenCalledWith(5, { kilometraje: 2 }, expect.objectContaining({ usuario: 'guarda1' }), { ip: expect.any(String), apiCodigo: 'POR-EVT-004' });
  const anular = await llamar('post', '/5/anular', { cuerpo: { motivo: 'error' }, prueba });
  expect(anular.res.body.data).toEqual({ id: 5, anulado: true });
  expect(prueba.deps.eventos.anular).toHaveBeenCalledWith(5, { motivo: 'error' }, expect.objectContaining({ usuario: 'guarda1' }), { ip: expect.any(String), apiCodigo: 'POR-EVT-005' });
});
```

```js
// src/porteria/__tests__/estado.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const BASE = '/api/porteria/v1/estado';
const get = async (prueba, ruta, token) => request(await servir(prueba.app)).get(`${BASE}${ruta}`).set('Authorization', `Bearer ${token}`);

test('dentro: el guarda consulta su sede; el admin pide una', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.estado.dentro.mockResolvedValue([{ placa: 'ABC123' }]);
  const r = await get(prueba, '/dentro?sede_id=9', tokenDe({ sede: { id: 3, nombre: 'N' } }));
  expect(r.status).toBe(200);
  expect(r.headers['x-por-api']).toBe('POR-EST-001');
  expect(r.body.data).toEqual([{ placa: 'ABC123' }]);
  expect(prueba.deps.estado.dentro).toHaveBeenLastCalledWith(3);
  await get(prueba, '/dentro?sede_id=9', tokenDe({ rol: 'admin_porteria' }));
  expect(prueba.deps.estado.dentro).toHaveBeenLastCalledWith(9);
  const sinSede = await get(prueba, '/dentro', tokenDe({ rol: 'admin_porteria' }));
  expect(sinSede.status).toBe(400);
});

test('fuera: el admin sin sede ve todas', async () => {
  const prueba = crearAppPrueba();
  await get(prueba, '/fuera', tokenDe({ rol: 'admin_porteria' }));
  expect(prueba.deps.estado.fuera).toHaveBeenLastCalledWith(null);
});

test('placa: sugerencia', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.estado.sugerir.mockResolvedValue({ placa: 'ABC123', sentido_sugerido: 'INGRESO' });
  const r = await get(prueba, '/placa/abc-123', tokenDe());
  expect(r.headers['x-por-api']).toBe('POR-EST-003');
  expect(r.body.data).toEqual({ placa: 'ABC123', sentido_sugerido: 'INGRESO' });
  expect(prueba.deps.estado.sugerir).toHaveBeenCalledWith('abc-123');
});
```

```js
// src/porteria/__tests__/vehiculosExternos.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const BASE = '/api/porteria/v1/vehiculos-externos';
const guarda = () => tokenDe();
const admin = () => tokenDe({ usuario: 'admin1', rol: 'admin_porteria' });
const enviar = async (prueba, metodo, ruta, token, cuerpo) => request(await servir(prueba.app))[metodo](`${BASE}${ruta}`)
  .set('Authorization', `Bearer ${token}`).send(cuerpo);

test('buscar', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.vehiculosExternos.buscar.mockResolvedValue([{ placa: 'XYZ1' }]);
  const r = await request(await servir(prueba.app)).get(`${BASE}?q=%20flor%20`).set('Authorization', `Bearer ${guarda()}`);
  expect(r.headers['x-por-api']).toBe('POR-VEX-001');
  expect(r.body.data).toEqual([{ placa: 'XYZ1' }]);
  expect(prueba.deps.vehiculosExternos.buscar).toHaveBeenCalledWith('flor');
});

describe('crear', () => {
  test('el guarda crea; la placa se normaliza', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.vehiculosExternos.crear.mockResolvedValue(12);
    prueba.deps.vehiculosExternos.obtenerPorId.mockResolvedValue({ id: 12, placa: 'XYZ123' });
    const r = await enviar(prueba, 'post', '', guarda(), { placa: 'xyz-123', tipo: 'PROVEEDOR', empresa: ' Flores ', descripcion: '' });
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ id: 12, placa: 'XYZ123' });
    expect(prueba.deps.vehiculosExternos.crear).toHaveBeenCalledWith({ placa: 'XYZ123', tipo: 'PROVEEDOR', empresa: 'Flores', descripcion: null, usuario: 'guarda1' });
  });

  test('una placa de la empresa no entra al catálogo', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.h360.obtenerVehiculoPropioPorPlaca.mockResolvedValue({ id: 1, placa: 'ABC123' });
    const r = await enviar(prueba, 'post', '', guarda(), { placa: 'ABC123', tipo: 'PROVEEDOR', empresa: 'X' });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ error: 'POR-VEX-002', motivo: 'PLACA_PROPIA', message: 'La placa es de un vehículo de la empresa' });
    expect(prueba.deps.vehiculosExternos.crear).not.toHaveBeenCalled();
  });

  test.each([
    [{ placa: '-', tipo: 'PROVEEDOR', empresa: 'X' }, 'Indica la placa'],
    [{ placa: 'A1', tipo: 'PROPIO', empresa: 'X' }, 'Tipo de vehículo inválido'],
    [{ placa: 'A1', tipo: 'PROVEEDOR', empresa: ' ' }, 'Indica la empresa'],
  ])('%p → 400 %s', async (cuerpo, message) => {
    const r = await enviar(crearAppPrueba(), 'post', '', guarda(), cuerpo);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ motivo: 'VALIDACION', message });
  });
});

describe('actualizar', () => {
  test('solo el admin', async () => {
    const r = await enviar(crearAppPrueba(), 'patch', '/3', guarda(), { activo: false });
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: 'POR-VEX-003', motivo: 'SIN_PERMISO' });
  });

  test('el admin actualiza; inexistente → 404; sin cambios → 400', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.vehiculosExternos.obtenerPorId.mockResolvedValue({ id: 3, activo: false });
    const r = await enviar(prueba, 'patch', '/3', admin(), { activo: false, empresa: 'Nueva' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ id: 3, activo: false });
    expect(prueba.deps.vehiculosExternos.actualizar).toHaveBeenCalledWith(3, { activo: false, empresa: 'Nueva' }, 'admin1');
    prueba.deps.vehiculosExternos.actualizar.mockResolvedValue(false);
    expect((await enviar(prueba, 'patch', '/4', admin(), { activo: true })).status).toBe(404);
    expect((await enviar(prueba, 'patch', '/3', admin(), {})).status).toBe(400);
  });
});
```

```js
// src/porteria/__tests__/flujo.int.test.js
// Flujo HTTP completo con servicios reales sobre la base de pruebas. Placas F8…, ids 2801-2899.
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');
const { crearServicioEstado } = require('../services/estado.service');

let conn;
let bd;
let app;
let entrega;

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo', 'por_vehiculos_externos']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'F8%'`);
  await conn.query('DELETE FROM sedes WHERE id BETWEEN 2800 AND 2899');
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2801, 'F8', 'F8', 'Cúcuta', 1)");
  [[{ id: entrega }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'ENTREGA_MERCANCIA'");
  const h360 = crearH360Lectura(bd);
  const motivos = crearRepositorioMotivos(bd);
  const vehiculosExternos = crearRepositorioVehiculosExternos(bd);
  const conductores = { listar: async () => [], buscar: async () => ({ conductor: null, listaCompleta: true }) };
  ({ app } = crearAppPrueba({
    bd, h360, motivos, vehiculosExternos, conductores,
    eventos: crearServicioEventos({ bd, h360, conductores, motivos, vehiculosExternos }),
    estado: crearServicioEstado({ bd, h360, vehiculosExternos }),
  }));
});
afterEach(cerrarServidores);
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('ingreso y salida de un proveedor por HTTP', async () => {
  const guarda = tokenDe({ sede: { id: 2801, nombre: 'F8' } });
  const servidor = await servir(app);
  const conSesion = (r) => r.set('Authorization', `Bearer ${guarda}`);
  const proveedor = { placa: 'F8V-001', tipo_vehiculo: 'PROVEEDOR', motivo_id: entrega, empresa: 'Cofres SA', conductor_nombre: 'Ana', conductor_documento: '9' };

  const ingreso = await conSesion(request(servidor).post('/api/porteria/v1/eventos')).send({ ...proveedor, sentido: 'INGRESO' });
  expect(ingreso.status).toBe(201);
  expect(ingreso.body.data).toMatchObject({ placa: 'F8V001', sede_id: 2801, registrado_por: 'guarda1' });

  const dentro = await conSesion(request(servidor).get('/api/porteria/v1/estado/dentro'));
  expect(dentro.body.data.map((e) => e.placa)).toContain('F8V001');

  const sugerencia = await conSesion(request(servidor).get('/api/porteria/v1/estado/placa/f8v-001'));
  expect(sugerencia.body.data.sentido_sugerido).toBe('SALIDA');

  const repetido = await conSesion(request(servidor).post('/api/porteria/v1/eventos')).send({ ...proveedor, sentido: 'INGRESO' });
  expect(repetido.status).toBe(409);
  expect(repetido.body).toMatchObject({ error: 'POR-EVT-001', motivo: 'SENTIDO_INCOHERENTE' });

  const salida = await conSesion(request(servidor).post('/api/porteria/v1/eventos')).send({ ...proveedor, sentido: 'SALIDA' });
  expect(salida.status).toBe(201);

  const lista = await conSesion(request(servidor).get('/api/porteria/v1/eventos?placa=F8V001'));
  expect(lista.body.data).toMatchObject({ total: 2, pagina: 1, por_pagina: 50 });
  expect(lista.body.data.items.map((e) => e.sentido)).toEqual(['SALIDA', 'INGRESO']);
});
```

Agregar al final de `src/porteria/__tests__/montaje.test.js` (usa `completas()` del archivo):

```js
test('las rutas de la Fase 2 están montadas en la app real', async () => {
  completas();
  for (const [metodo, ruta, codigo] of [
    ['post', '/api/porteria/v1/eventos', 'POR-EVT-001'],
    ['get', '/api/porteria/v1/estado/placa/ABC123', 'POR-EST-003'],
    ['get', '/api/porteria/v1/vehiculos-externos', 'POR-VEX-001'],
  ]) {
    const r = await request(await servir(app))[metodo](ruta);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe(codigo);
  }
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx jest src/porteria/__tests__/eventos.routes.test.js src/porteria/__tests__/estado.routes.test.js src/porteria/__tests__/vehiculosExternos.routes.test.js src/porteria/__tests__/montaje.test.js` → FAIL (404 `POR-SIS-002`).

- [ ] **Step 5: Write the routers**

```js
// src/porteria/routes/eventos.routes.js
// Registro, consulta, corrección y anulación de ingresos y salidas.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { requiereSede, sedeDeConsulta } = require('../middleware/autenticacion');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');
const { normalizarPlaca } = require('../utils/placa');
const { ROLES } = require('../services/auth.service');
const { TIPOS } = require('../services/detalleEvento');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const invalido = (message) => new PorteriaError(400, 'VALIDACION', message);
const noExiste = () => new PorteriaError(404, 'NO_ENCONTRADO', 'El registro no existe');
const vacio = (v) => v === undefined || v === '';

function leerFiltros(query) {
  const fecha = (v) => {
    if (vacio(v)) return undefined;
    if (typeof v !== 'string' || !FECHA.test(v)) throw invalido('Fecha inválida (usa AAAA-MM-DD)');
    return v;
  };
  const positivo = (v, mensaje) => {
    if (vacio(v)) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw invalido(mensaje);
    return n;
  };
  const tipo = vacio(query.tipo_vehiculo) ? undefined : query.tipo_vehiculo;
  if (tipo !== undefined && !TIPOS.includes(tipo)) throw invalido('Tipo de vehículo inválido');
  return {
    filtros: {
      desde: fecha(query.desde),
      hasta: fecha(query.hasta),
      placa: typeof query.placa === 'string' ? normalizarPlaca(query.placa) || undefined : undefined,
      tipoVehiculo: tipo,
      motivoId: positivo(query.motivo_id, 'Motivo inválido'),
      inconsistente: vacio(query.inconsistente) ? undefined : ['1', 'true'].includes(query.inconsistente),
    },
    pagina: positivo(query.pagina, 'Página inválida') ?? 1,
  };
}

const idDe = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw noExiste();
  return id;
};
const ctx = (req) => ({ ip: req.ip, apiCodigo: req.porApiCodigo });

function crearRouterEventos({ autenticar, eventos }) {
  const router = express.Router();

  router.post('/', apiCodigo('POR-EVT-001'), autenticar, requiereSede, aw(async (req, res) => {
    res.status(201).json({ success: true, data: await eventos.registrar(req.body, req.porUsuario, ctx(req)) });
  }));

  router.get('/', apiCodigo('POR-EVT-002'), autenticar, aw(async (req, res) => {
    const { filtros, pagina } = leerFiltros(req.query);
    const sedeId = sedeDeConsulta(req, { todasParaAdmin: true });
    res.json({ success: true, data: await eventos.listar({ sedeId, ...filtros }, { pagina }) });
  }));

  router.get('/:id', apiCodigo('POR-EVT-003'), autenticar, aw(async (req, res) => {
    const evento = await eventos.obtener(idDe(req));
    const ajeno = evento && req.porUsuario.rol !== ROLES.ADMIN && evento.sede_id !== req.porUsuario.sede_id;
    if (!evento || ajeno) throw noExiste();
    res.json({ success: true, data: evento });
  }));

  router.patch('/:id', apiCodigo('POR-EVT-004'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await eventos.corregir(idDe(req), req.body, req.porUsuario, ctx(req)) });
  }));

  router.post('/:id/anular', apiCodigo('POR-EVT-005'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await eventos.anular(idDe(req), req.body, req.porUsuario, ctx(req)) });
  }));

  return router;
}

module.exports = { crearRouterEventos };
```

Nota: en la prueba "el guarda siempre lista su sede" el objeto esperado empieza por `sedeId` y luego los filtros; `toHaveBeenCalledWith` compara por valor, el orden de las claves no importa.

```js
// src/porteria/routes/estado.routes.js
// Vehículos dentro de una sede, propios fuera y sugerencia por placa.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { sedeDeConsulta } = require('../middleware/autenticacion');
const aw = require('../utils/aw');

function crearRouterEstado({ autenticar, estado }) {
  const router = express.Router();

  router.get('/dentro', apiCodigo('POR-EST-001'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await estado.dentro(sedeDeConsulta(req)) });
  }));

  router.get('/fuera', apiCodigo('POR-EST-002'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await estado.fuera(sedeDeConsulta(req, { todasParaAdmin: true })) });
  }));

  router.get('/placa/:placa', apiCodigo('POR-EST-003'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await estado.sugerir(req.params.placa) });
  }));

  return router;
}

module.exports = { crearRouterEstado };
```

```js
// src/porteria/routes/vehiculosExternos.routes.js
// Catálogo de vehículos de proveedor: el guarda busca y crea; el admin además corrige e inactiva.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const { requiereRol } = require('../middleware/autenticacion');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');
const { normalizarPlaca } = require('../utils/placa');
const { textoOpcional } = require('../utils/texto');
const { ROLES } = require('../services/auth.service');

const TIPOS_EXTERNOS = ['PROVEEDOR_ASISTENCIA', 'PROVEEDOR'];
const invalido = (message) => new PorteriaError(400, 'VALIDACION', message);

function textoCampo(valor, max, mensaje) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string' || valor.trim().length > max) throw invalido(mensaje);
  return valor.trim() || null;
}

function crearRouterVehiculosExternos({ autenticar, vehiculosExternos, h360 }) {
  const router = express.Router();

  router.get('/', apiCodigo('POR-VEX-001'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await vehiculosExternos.buscar(textoOpcional(req.query.q)) });
  }));

  router.post('/', apiCodigo('POR-VEX-002'), autenticar, aw(async (req, res) => {
    const body = req.body || {};
    const placa = typeof body.placa === 'string' ? normalizarPlaca(body.placa) : '';
    if (!placa || placa.length > 20) throw invalido('Indica la placa');
    if (!TIPOS_EXTERNOS.includes(body.tipo)) throw invalido('Tipo de vehículo inválido');
    const empresa = textoCampo(body.empresa, 150, 'Indica la empresa');
    if (!empresa) throw invalido('Indica la empresa');
    const descripcion = textoCampo(body.descripcion, 255, 'La descripción es demasiado larga');
    if (await h360.obtenerVehiculoPropioPorPlaca(placa)) {
      throw new PorteriaError(409, 'PLACA_PROPIA', 'La placa es de un vehículo de la empresa');
    }
    const id = await vehiculosExternos.crear({ placa, tipo: body.tipo, empresa, descripcion, usuario: req.porUsuario.usuario });
    res.status(201).json({ success: true, data: await vehiculosExternos.obtenerPorId(id) });
  }));

  router.patch('/:id', apiCodigo('POR-VEX-003'), autenticar, requiereRol(ROLES.ADMIN), aw(async (req, res) => {
    const id = Number(req.params.id);
    const noExiste = new PorteriaError(404, 'NO_ENCONTRADO', 'El vehículo no existe');
    if (!Number.isInteger(id) || id <= 0) throw noExiste;
    const body = req.body || {};
    const cambios = {};
    if ('tipo' in body) {
      if (!TIPOS_EXTERNOS.includes(body.tipo)) throw invalido('Tipo de vehículo inválido');
      cambios.tipo = body.tipo;
    }
    if ('empresa' in body) {
      cambios.empresa = textoCampo(body.empresa, 150, 'Indica la empresa');
      if (!cambios.empresa) throw invalido('Indica la empresa');
    }
    if ('descripcion' in body) cambios.descripcion = textoCampo(body.descripcion, 255, 'La descripción es demasiado larga');
    if ('activo' in body) {
      if (typeof body.activo !== 'boolean') throw invalido('Activo inválido');
      cambios.activo = body.activo;
    }
    if (Object.keys(cambios).length === 0) throw invalido('No hay cambios');
    if (!(await vehiculosExternos.actualizar(id, cambios, req.porUsuario.usuario))) throw noExiste;
    res.json({ success: true, data: await vehiculosExternos.obtenerPorId(id) });
  }));

  return router;
}

module.exports = { crearRouterVehiculosExternos };
```

En `src/porteria/routes/index.js`: agregar los `require`

```js
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');
const { crearServicioEstado } = require('../services/estado.service');
const { crearRouterEventos } = require('./eventos.routes');
const { crearRouterEstado } = require('./estado.routes');
const { crearRouterVehiculosExternos } = require('./vehiculosExternos.routes');
```

cambiar la firma de la fábrica (y su comentario) a:

```js
/**
 * Fábrica inyectable (tests). `bd` = { ping(), obtener() }; `obtenerConfig()` devuelve leerEntorno().config;
 * `directorio` = { validarCredenciales }; `conductores` = { listar(), buscar() }. Lo demás se construye desde ahí.
 */
function crearRouterPorteria({
  bd, obtenerConfig, directorio, conductores,
  h360 = crearH360Lectura(bd),
  motivos = crearRepositorioMotivos(bd),
  vehiculosExternos = crearRepositorioVehiculosExternos(bd),
  eventos = crearServicioEventos({ bd, h360, conductores, motivos, vehiculosExternos }),
  estado = crearServicioEstado({ bd, h360, vehiculosExternos }),
}) {
```

y montar, debajo de `/catalogos` y antes del 404:

```js
  router.use('/eventos', crearRouterEventos({ autenticar, eventos }));
  router.use('/estado', crearRouterEstado({ autenticar, estado }));
  router.use('/vehiculos-externos', crearRouterVehiculosExternos({ autenticar, vehiculosExternos, h360 }));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/porteria` → PASS. Run: `npm run test:porteria:int` → PASS (incluye `flujo.int.test.js`).

- [ ] **Step 7: Commit**

```bash
git add src/porteria/utils/texto.js src/porteria/routes src/porteria/testing/appPrueba.js src/porteria/__tests__
git commit -m "feat(porteria): rutas de eventos, estado y catálogo de proveedores"
```

---

### Task 9: Verificación de cierre de la Fase 2

- [ ] **Step 1: Pruebas**

Run: `npx jest src/porteria src/h360/services` → PASS.
Run: `npm run test:porteria:int` → PASS. Repetir 3 veces seguidas: las pruebas de concurrencia no deben fallar de forma intermitente.
Run: `npx jest` → solo fallan las 3 suites de la línea base.

- [ ] **Step 2: Documentación**

En `docs/superpowers/specs/2026-10-29-porteria-design.md` §8, cambiar `&page=` por `&pagina=` en `GET /eventos` y agregar debajo de la línea de `GET /eventos`: `(respuesta: { items, total, pagina, por_pagina }; 50 por página)`.

```bash
git add docs/superpowers/specs/2026-10-29-porteria-design.md
git commit -m "docs(porteria): paginación de /eventos"
```

- [ ] **Step 3: Revisión**

`superpowers:requesting-code-review` sobre el diff de la fase y `superpowers:verification-before-completion`.
