# Agenda de Masajes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Follow `superpowers:test-driven-development` in every task: failing test → minimal code → green → commit.

**Goal:** Módulo de agenda virtual de masajes en Mantix (+ vistas Vue) con login AD, cupo mensual, semanas habilitadas, Google Calendar, correo al spa y recordatorios por correo/SMS (Háblame).

**Spec:** `2026-11-09-agenda-masajes-design.md` — léela completa antes de empezar. Ante cualquier duda de regla de negocio o de seguridad (§17), la spec manda.

**Notas de reconocimiento:** `notas-masajes.md` (Tarea 0 ya hecha): estructura real del repo, patrón de Portería y hallazgos de seguridad.

**Repo:** `/Users/Shared/Files From c.localized/apps/mantix/mantix-git` (no `mantix-backend`, que es una copia vieja).

**Architecture:** Módulo `src/masajes/` que **copia el patrón de Portería** (`src/porteria/`):
- Login AD propio y JWT `scope: 'masajes'` con secreto propio.
- Pool mysql2 propio y perezoso, en la misma base; migraciones `.sql` numeradas.
- Fábricas inyectables (`crearServicioX({ bd, … })`, `crearRouterX({ autenticar, … })`).
- `apiCodigo` por ruta, `MasajesError` y error handler del módulo.
- Si la configuración es inválida, el router responde 503 y Mantix sigue arriba.
- Concurrencia vía índices UNIQUE (`slot_key`, `cupo_key`). Efectos externos (Google, correo, SMS) vía outbox `msj_notificaciones` procesado por node-cron.

**Tech Stack:** Node.js (CommonJS) · Express 4 · mysql2/promise · jsonwebtoken 9 · ldapjs (vía `src/h360/services/ldap.service.js`) · dayjs (utc, timezone) · googleapis · nodemailer (`src/services/emailService.js`) · axios · node-cron · exceljs · multer · express-rate-limit · joi · Jest + supertest + nock · Vue 3 + Pinia + Tailwind.

**Estructura objetivo** (espejo de `src/porteria/`):
```
src/masajes/
  config/entorno.js            leerEntorno(), leerConexion(), leerIntegraciones() — nunca lanzan
  db.js                        crearBdPerezosa() — pool mysql2, time_zone -05:00
  migrations/NNN_*.sql
  scripts/{migrador,migrar,importarBeneficiarios}.js
  dominio/{tiempo,franjas,festivos,reglas,telefono}.js     puro, sin BD
  repositorios/{beneficiarios,semanas,citas,notificaciones}.js
  services/{auth,disponibilidad,citas,semanas,beneficiarios,outbox,recordatorios}.service.js
  adapters/{googleCalendar,hablameSms,correo}.js + plantillas/
  middleware/{apiCodigo,autenticacion,errorHandler,subidaXlsx}.js
  routes/{index,auth,empleado,admin}.routes.js
  jobs/index.js
  utils/{MasajesError,errorSeguro,aw,redactar}.js
  testing/{env,bd,globalSetup,appPrueba}.js + docker-compose.yml + sql/
  __tests__/*.test.js (unit) · *.int.test.js (integración)
```

**Reglas transversales (aplican a todas las tareas):**
- SQL **solo** con placeholders `?` (`conn.execute(sql, params)`). Nunca concatenar ni interpolar valores.
- Los servicios reciben `reloj = () => new Date()` por inyección para los tests. Los controllers **nunca** toman la hora de la petición.
- Logs con `errorParaLog(err)` (copia de Portería): nunca `message`, `sqlMessage`, `sql` ni `parameters` de errores de BD.
- Cada handler async va envuelto en `aw()`. Cada ruta empieza con `apiCodigo('MSJ-XXX-NNN')`.

---

## Task 0: Reconocimiento ✅ (hecho el 2026-11-09)

Resultado en `notas-masajes.md`. Pendiente de esta tarea:

- [ ] **Step 1:** Dependencias. Ya están instaladas: `exceljs`, `multer`, `express-rate-limit`, `joi`, `node-cron`, `axios`, `nodemailer`, `jsonwebtoken`, `mysql2`, `ldapjs`. Faltan:
  ```bash
  npm i dayjs googleapis colombian-holidays
  npm i -D nock supertest
  npm audit --omit=dev
  ```
  **No instales `xlsx`** (CVEs conocidos; spec §17.7) ni `zod` (ya hay `joi`). Antes de `colombian-holidays`, revisa mantenedores y descargas en npm; si no da confianza, usa la tabla fija de la Tarea 3. Verifica si `supertest` y `nock` ya están en `devDependencies` antes de instalarlos.
- [ ] **Step 2:** Copia `notas-masajes.md` a `docs/masajes/notas-masajes.md` en el repo. Commit `chore(masajes): notas de reconocimiento y dependencias`.

---

## Task 1: Esqueleto del módulo, configuración y montaje

**Files:**
- Create: `src/masajes/config/entorno.js`, `src/masajes/utils/{MasajesError,errorSeguro,aw}.js`, `src/masajes/middleware/{apiCodigo,errorHandler}.js`, `src/masajes/routes/index.js` (solo `/health` y 404), `src/masajes/db.js`, `src/masajes/masajes.env.example`
- Create: `src/masajes/__tests__/entorno.test.js`, `__tests__/contratoError.test.js`
- Modify: `src/routes/index.js` → `router.use('/masajes/v1', masajesRoutes)`
- Modify: `src/app.js` → parser de 10 KB y error handler del módulo, antes de los parsers globales (junto a los de Portería y BigDay, ~líneas 90–101)

- [ ] **Step 1: Tests que fallan**
```js
// __tests__/entorno.test.js
const { leerEntorno } = require('../config/entorno');
const BASE = {
  DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p',
  JWT_SECRET: 'a'.repeat(40), PORTERIA_JWT_SECRET: 'b'.repeat(40),
  MASAJES_JWT_SECRET: 'm'.repeat(40),
  MSJ_GRUPO_ADMIN_DN: 'CN=GG-Masajes-Admin,OU=Grupos,DC=olivos,DC=local',
};
const leer = (extra = {}) => leerEntorno({ ...BASE, ...extra });

it('valores por defecto', () => {
  const { ok, config } = leer();
  expect(ok).toBe(true);
  expect(config.tz).toBe('America/Bogota');
  expect(config.franjas).toEqual(['08:00', '09:00', '10:00', '14:00', '15:00', '16:00']);
  expect(config.duracionMin).toBe(60);
  expect(config.anticipacionAgendarH).toBe(24);
  expect(config.anticipacionModificarH).toBe(24);
  expect(config.jwtExpires).toBe('8h');
  expect(config.grupoAdminDn).toBe('cn=gg-masajes-admin,ou=grupos,dc=olivos,dc=local');
});
it('lee overrides', () => expect(leer({ MSJ_ANTICIPACION_AGENDAR_H: '2' }).config.anticipacionAgendarH).toBe(2));
it('número inválido → no ok (nunca NaN silencioso)', () => {
  expect(leer({ MSJ_ANTICIPACION_AGENDAR_H: 'veinticuatro' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/MSJ_ANTICIPACION_AGENDAR_H/) });
});
it('franjas mal formadas → no ok', () => expect(leer({ MSJ_FRANJAS: '08:00, 9am' }).ok).toBe(false));
it('secreto ausente, corto o repetido de otro módulo → no ok', () => {
  expect(leer({ MASAJES_JWT_SECRET: '' }).ok).toBe(false);
  expect(leer({ MASAJES_JWT_SECRET: 'corto' }).ok).toBe(false);
  expect(leer({ MASAJES_JWT_SECRET: 'b'.repeat(40) }).ok).toBe(false); // = PORTERIA_JWT_SECRET
});
it('grupo admin debe ser DN completo, no CN suelto', () => {
  expect(leer({ MSJ_GRUPO_ADMIN_DN: 'GG-Masajes-Admin' }).ok).toBe(false);
  expect(leer({ MSJ_GRUPO_ADMIN_DN: '' }).ok).toBe(false);
});
it('nunca lanza', () => expect(() => leerEntorno({})).not.toThrow());
```
```js
// __tests__/contratoError.test.js — con appPrueba (supertest)
// GET /api/masajes/v1/health con BD caída → 503 { success:false, error:'MSJ-SIS-001', motivo:'NO_DISPONIBLE' } sin detalle del error
// Ruta inexistente → 404 { error:'MSJ-SIS-002', motivo:'NO_ENCONTRADO' }
// JSON malformado → 400 { motivo:'VALIDACION' } con el contrato del módulo (parser montado en app.js)
// Body de 11 KB → 413
// Config inválida → 503 'MSJ-SIS-000' y el resto de Mantix responde normal
// Error no controlado → 500 { motivo:'ERROR_INTERNO', message:'Error interno del servidor' }, sin stack ni sqlMessage
```
- [ ] **Step 2:** `npx jest src/masajes/__tests__/entorno.test.js` → FAIL.
- [ ] **Step 3: Implementación de `entorno.js`** (mismo estilo que `src/porteria/config/entorno.js`: devuelve `{ ok, motivo, advertencia, config }` y nunca lanza)

  Un `NaN` en una anticipación hace que toda comparación `<`/`>` dé `false` y la regla de 24 h deja de aplicarse sin que nadie lo note. Por eso un valor inválido deja el módulo en 503 en lugar de seguir funcionando mal.
```js
// src/masajes/config/entorno.js
// Variables del módulo Masajes. Nunca lanza: si algo falta, el router responde 503 y Mantix sigue arrancando.
const vacia = (v) => v === undefined || v === null || String(v).trim() === '';
const recortada = (v) => (vacia(v) ? undefined : String(v).trim());

const CONEXION = ['DB_HOST', 'DB_USER', 'DB_PASSWORD'];
const OTROS_SECRETOS = ['JWT_SECRET', 'IDENTIDAD_JWT_SECRET', 'TRK_JWT_SECRET', 'PORTERIA_JWT_SECRET'];
const FRANJAS_DEFECTO = '08:00,09:00,10:00,14:00,15:00,16:00';

function entero(env, nombre, porDefecto, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const v = recortada(env[nombre]);
  if (v === undefined) return { ok: true, valor: porDefecto };
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false, motivo: `${nombre} inválido: "${v}"` };
  return { ok: true, valor: n };
}

/** Solo la conexión (la usan también los scripts de migración e importación). */
function leerConexion(env = process.env) {
  const faltan = CONEXION.filter((n) => vacia(env[n]));
  if (faltan.length) return { ok: false, motivo: `Faltan variables: ${faltan.join(', ')}` };
  // Usuario de mínimo privilegio para el módulo (spec §17.8); si no está, se usa el de Mantix con advertencia.
  const propio = !vacia(env.MSJ_DB_USER) && !vacia(env.MSJ_DB_PASSWORD);
  return {
    ok: true,
    advertencia: propio ? null : 'Masajes usa DB_USER de Mantix: define MSJ_DB_USER/MSJ_DB_PASSWORD con mínimo privilegio',
    db: {
      host: env.DB_HOST,
      port: parseInt(env.DB_PORT, 10) || 3306,
      user: propio ? env.MSJ_DB_USER : env.DB_USER,
      password: propio ? env.MSJ_DB_PASSWORD : env.DB_PASSWORD,
      database: vacia(env.DB_NAME) ? 'serfuweb' : env.DB_NAME,
    },
  };
}

function leerEntorno(env = process.env) {
  const conexion = leerConexion(env);
  if (!conexion.ok) return conexion;

  const secreto = recortada(env.MASAJES_JWT_SECRET);
  if (!secreto) return { ok: false, motivo: 'Falta MASAJES_JWT_SECRET' };
  if (secreto.length < 32) return { ok: false, motivo: 'MASAJES_JWT_SECRET debe tener al menos 32 caracteres' };
  if (OTROS_SECRETOS.some((k) => recortada(env[k]) === secreto)) {
    return { ok: false, motivo: `MASAJES_JWT_SECRET debe ser distinto de ${OTROS_SECRETOS.join(', ')}` };
  }
  const jwtExpires = recortada(env.MASAJES_JWT_EXPIRES) ?? '8h';
  if (!/^([1-9]\d*)(m|h)$/.test(jwtExpires)) return { ok: false, motivo: 'MASAJES_JWT_EXPIRES inválido (usa p. ej. 8h)' };

  // DN completo; se compara exacto y case-insensitive, nunca por CN ni por subcadena (spec §9.2).
  const grupoAdminDn = recortada(env.MSJ_GRUPO_ADMIN_DN);
  if (!grupoAdminDn || !/^cn=[^,]+,(ou|cn|dc)=/i.test(grupoAdminDn)) {
    return { ok: false, motivo: 'MSJ_GRUPO_ADMIN_DN debe ser un DN completo (CN=…,OU=…,DC=…)' };
  }

  const franjas = (recortada(env.MSJ_FRANJAS) ?? FRANJAS_DEFECTO).split(',').map((s) => s.trim());
  if (!franjas.every((f) => /^([01]\d|2[0-3]):00$/.test(f))) return { ok: false, motivo: 'MSJ_FRANJAS inválido (usa HH:00 separados por coma)' };

  const nums = {
    duracionMin: entero(env, 'MSJ_DURACION_MIN', 60, { min: 15, max: 240 }),
    anticipacionAgendarH: entero(env, 'MSJ_ANTICIPACION_AGENDAR_H', 24, { max: 720 }),
    anticipacionModificarH: entero(env, 'MSJ_ANTICIPACION_MODIFICAR_H', 24, { max: 720 }),
    smsTopeDiario: entero(env, 'MSJ_SMS_TOPE_DIARIO', 100, { min: 1, max: 10000 }),
  };
  const malo = Object.values(nums).find((r) => !r.ok);
  if (malo) return { ok: false, motivo: malo.motivo };
  const valores = Object.fromEntries(Object.entries(nums).map(([k, r]) => [k, r.valor]));

  return {
    ok: true,
    advertencia: conexion.advertencia,
    config: {
      tz: 'America/Bogota',
      franjas,
      ...valores,
      jwtSecret: secreto,
      jwtExpires,
      grupoAdminDn: grupoAdminDn.toLowerCase(),
      dominiosAutovinculo: (recortada(env.MSJ_DOMINIOS_AUTOVINCULO) ?? 'losolivos.co')
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      appUrl: recortada(env.MSJ_APP_URL) ?? 'https://mantix.losolivos.co/masajes',
      outboxMaxIntentos: 5,
      db: conexion.db,
    },
  };
}

/** Integraciones externas: las exige el worker del outbox, no el router (Tarea 13). */
function leerIntegraciones(env = process.env) {
  const req = ['MSJ_SPA_EMAIL', 'MSJ_GOOGLE_CALENDAR_ID', 'MSJ_GOOGLE_IMPERSONAR', 'MSJ_GOOGLE_SA_JSON', 'MSJ_HABLAME_URL', 'MSJ_HABLAME_API_KEY'];
  const faltan = req.filter((n) => vacia(env[n]));
  if (faltan.length) return { ok: false, motivo: `Faltan variables: ${faltan.join(', ')}` };
  if (!/^https:\/\//.test(env.MSJ_HABLAME_URL)) return { ok: false, motivo: 'MSJ_HABLAME_URL debe ser https' };
  return {
    ok: true,
    config: {
      spa: { nombre: recortada(env.MSJ_SPA_NOMBRE) ?? 'Spa', email: env.MSJ_SPA_EMAIL.trim(), direccion: recortada(env.MSJ_SPA_DIRECCION) ?? '', enEvento: env.MSJ_SPA_EN_EVENTO === 'true' },
      google: { calendarId: env.MSJ_GOOGLE_CALENDAR_ID.trim(), impersonar: env.MSJ_GOOGLE_IMPERSONAR.trim(), credencialesPath: env.MSJ_GOOGLE_SA_JSON.trim() },
      hablame: { url: env.MSJ_HABLAME_URL.trim(), cuenta: recortada(env.MSJ_HABLAME_CUENTA), apiKey: env.MSJ_HABLAME_API_KEY.trim(), token: recortada(env.MSJ_HABLAME_TOKEN) },
    },
  };
}

module.exports = { leerEntorno, leerConexion, leerIntegraciones };
```
- [ ] **Step 4:** Copia y adapta de Portería con prefijo `MSJ`: `MasajesError` (extiende `src/utils/AppError`), `errorSeguro`, `aw`, `apiCodigo` (cabecera `X-MSJ-API`, `req.msjLog`, `req.msjApiCodigo`, log sin query string) y `masajesErrorHandler`. `db.js` igual al de Portería (`timezone: '-05:00'` + `SET time_zone` por conexión). Agrega una nota en cada archivo copiado: "copia de src/porteria/… — si se corrige allá, corregir aquí". Router con guardián 503 como `src/porteria/routes/index.js`.
- [ ] **Step 5: Montaje.** En `src/app.js`, junto a Portería y BigDay y **antes** de `app.use(express.json({ limit: '10mb' }))`:
  ```js
  app.use('/api/masajes', express.json({ limit: '10kb' }));
  app.use('/api/masajes', express.urlencoded({ limit: '10kb', extended: false }));
  app.use('/api/masajes', require('./masajes/middleware/errorHandler').masajesErrorHandler);
  ```
  Masajes **no** se excluye del limitador global de `/api/` (no hay IP compartida masiva); agrega además sus límites propios en las Tareas 6 y 11. En `src/routes/index.js`: `router.use('/masajes/v1', require('../masajes/routes').router)`.
- [ ] **Step 6:** `masajes.env.example` con todas las variables y **sin valores reales** (`cambia-esto`). Confirma que `.env` está en `.gitignore`. Agrega a `package.json`: `test:masajes`, `test:masajes:int`, `masajes:db:test`, `masajes:migrate`, `masajes:importar`. Tests → PASS.
- [ ] **Step 7:** Commit `feat(masajes): esqueleto del modulo, configuracion y montaje`.

---

## Task 2: Migraciones SQL e infraestructura de pruebas

**Files:**
- Create: `src/masajes/migrations/001_esquema.sql`
- Create: `src/masajes/scripts/{migrador,migrar}.js` (copia del de Portería con tabla `msj_migraciones` y `DIR_MIGRACIONES` propio)
- Create: `src/masajes/testing/{env,bd,globalSetup,appPrueba}.js`, `testing/docker-compose.yml`, `jest.masajes-int.config.js`
- Create: `src/masajes/__tests__/esquema.int.test.js`

- [ ] **Step 1: Infra de pruebas** copiando la de Portería:
  - `docker-compose.yml`: contenedor `mysql-masajes-test` en `127.0.0.1:3309` (otro puerto, para correr en paralelo con Portería) y `tmpfs`.
  - `env.js`: `DB_NAME=masajes_test`, `MASAJES_JWT_SECRET` de prueba de ≥ 32 caracteres y distinto del de Portería, `MSJ_GRUPO_ADMIN_DN=CN=GG-Masajes-Admin,OU=Grupos,DC=olivos,DC=local`.
  - `bd.js`: **mantén la guarda `validarBdPrueba`** (solo bases `*_test` y solo host local), porque el setup hace `DROP DATABASE`.
- [ ] **Step 2: Test que falla**
```js
// __tests__/esquema.int.test.js
it('slot_key es único pero admite múltiples NULL', async () => {
  const b1 = await insertarBeneficiario(conn, { nombre: 'A', correo: 'x@olivos.co', celular: '573000000001' });
  const b2 = await insertarBeneficiario(conn, { nombre: 'B', correo: 'x@olivos.co', celular: '573000000002' }); // correo repetido OK
  const s = await insertarSemana(conn, { fecha_inicio: '2026-11-23', estado: 'publicada', creado_por: 't' });
  const base = { semana_id: s, inicio: '2026-11-24 09:00:00', fin: '2026-11-24 10:00:00', periodo: '2026-11', estado: 'agendada', creado_por: 't' };
  await insertarCita(conn, { ...base, beneficiario_id: b1, slot_key: '2026-11-24T09:00#1', cupo_key: `${b1}:2026-11` });
  await expect(insertarCita(conn, { ...base, beneficiario_id: b2, slot_key: '2026-11-24T09:00#1', cupo_key: `${b2}:2026-11` }))
    .rejects.toMatchObject({ code: 'ER_DUP_ENTRY', sqlMessage: expect.stringContaining('uq_msj_citas_slot_key') });
  await insertarCita(conn, { ...base, beneficiario_id: b2, estado: 'cancelada', slot_key: null, cupo_key: null });
  await insertarCita(conn, { ...base, beneficiario_id: b2, estado: 'cancelada', slot_key: null, cupo_key: null });
});
it('migrar dos veces no reaplica', async () => expect(await aplicarMigraciones(conn)).toEqual([]));
```
  Los helpers `insertar*` van en `testing/` y usan `conn.execute` con `?`.
- [ ] **Step 3:** `npm run masajes:db:test && npm run test:masajes:int` → FAIL.
- [ ] **Step 4: `001_esquema.sql`** con las 6 tablas de la spec §7 (`InnoDB`, `utf8mb4_unicode_ci`, FKs explícitas):
  - Índices UNIQUE con nombre explícito: `uq_msj_beneficiarios_ad_usuario`, `uq_msj_semanas_fecha_inicio`, `uq_msj_citas_slot_key`, `uq_msj_citas_cupo_key`, `uq_msj_notificaciones_clave`. El mapeo de errores de la Tarea 8 depende de estos nombres.
  - Índices simples en `msj_citas(inicio, estado)` y `msj_notificaciones(estado, proximo_intento)`.
  - `msj_cita_historial` con `ip`, `user_agent`, `request_id`, `motivo` y `accion` incluyendo `'autovinculacion'`.
  - `CHECK (estado <> 'cancelada' OR (slot_key IS NULL AND cupo_key IS NULL))` en `msj_citas`: una cita cancelada nunca retiene franja ni cupo, aunque falle el código.
- [ ] **Step 5:** Deja en `docs/masajes/permisos-bd.sql` el SQL para el DBA: `MSJ_DB_USER` con `SELECT, INSERT, UPDATE, DELETE` sobre `msj_*` (salvo historial y migraciones) y **solo `SELECT, INSERT`** sobre `msj_cita_historial`; las migraciones corren con otro usuario (`DB_USER` del administrador). Test → PASS.
- [ ] **Step 6:** Commit `feat(masajes): esquema msj_* e infraestructura de pruebas`.

---

## Task 3: Dominio — franjas y festivos

**Files:**
- Create: `src/masajes/dominio/{tiempo,franjas,festivos}.js`
- Create: `src/masajes/__tests__/franjas.test.js`

El dominio es puro: recibe `franjas` y `duracionMin` como parámetros (de `leerEntorno().config`) en vez de leer variables de entorno.

- [ ] **Step 1: Tests que fallan**
```js
const { crearFranjas } = require('../dominio/franjas');
const { festivosEntre } = require('../dominio/festivos');
const { franjasDeSemana, slotKey, periodoDe, esFranjaValida, lunesDe } = crearFranjas({
  franjas: ['08:00', '09:00', '10:00', '14:00', '15:00', '16:00'], duracionMin: 60,
});

it('genera 30 franjas L-V para una semana sin festivos', () => {
  const f = franjasDeSemana('2026-11-23', { festivos: [] });
  expect(f).toHaveLength(30);
  expect(f[0].inicioLocal).toBe('2026-11-23T08:00');
  expect(f[29].inicioLocal).toBe('2026-11-27T16:00');
});
it('excluye festivos', () => {
  const f = franjasDeSemana('2026-11-16', { festivos: ['2026-11-16'] });
  expect(f).toHaveLength(24);
  expect(f.some((x) => x.inicioLocal.startsWith('2026-11-16'))).toBe(false);
});
it('rechaza fecha_inicio que no es lunes', () => {
  expect(() => franjasDeSemana('2026-11-24', { festivos: [] })).toThrow('LUNES_REQUERIDO');
});
it('instante absoluto correcto (Bogotá = UTC-5)', () => {
  const [p] = franjasDeSemana('2026-11-23', { festivos: [] });
  expect(p.inicio.toISOString()).toBe('2026-11-23T13:00:00.000Z');
});
it('slotKey y periodo usan hora local', () => {
  expect(periodoDe(new Date('2026-12-01T04:30:00Z'))).toBe('2026-11'); // 30-nov 23:30 local
  expect(slotKey(new Date('2026-11-23T13:00:00Z'), 1)).toBe('2026-11-23T08:00#1');
});
it('esFranjaValida: solo inicios configurados en día hábil', () => {
  expect(esFranjaValida(new Date('2026-11-23T13:00:00Z'))).toBe(true);      // lun 8:00
  expect(esFranjaValida(new Date('2026-11-23T16:00:00Z'))).toBe(false);     // lun 11:00
  expect(esFranjaValida(new Date('2026-11-28T13:00:00Z'))).toBe(false);     // sábado
  expect(esFranjaValida(new Date('2026-11-23T13:00:00.500Z'))).toBe(false); // milisegundos
  expect(esFranjaValida(new Date('no-es-fecha'))).toBe(false);              // Invalid Date
  expect(esFranjaValida('2026-11-23T13:00:00Z')).toBe(false);               // no es Date
});
it('lunesDe', () => expect(lunesDe(new Date('2026-11-27T21:00:00Z'))).toBe('2026-11-23'));
it('festivosEntre incluye 16-nov-2026, 8-dic-2026 y 25-dic-2026', () => {
  expect(festivosEntre('2026-11-01', '2026-12-31')).toEqual(expect.arrayContaining(['2026-11-16', '2026-12-08', '2026-12-25']));
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implementación**
```js
// dominio/tiempo.js
const dayjs = require('dayjs');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));
const TZ = 'America/Bogota';
const local = (d) => dayjs(d).tz(TZ);
const deLocal = (str) => dayjs.tz(str, TZ);
module.exports = { dayjs, local, deLocal, TZ };

// dominio/franjas.js
const { local, deLocal } = require('./tiempo');

function crearFranjas({ franjas, duracionMin }) {
  function franjasDeSemana(fechaLunes, { festivos }) {
    const lunes = deLocal(`${fechaLunes}T00:00`);
    if (!lunes.isValid() || lunes.day() !== 1) throw new Error('LUNES_REQUERIDO');
    const out = [];
    for (let i = 0; i < 5; i++) {
      const fecha = lunes.add(i, 'day').format('YYYY-MM-DD');
      if (festivos.includes(fecha)) continue;
      for (const hhmm of franjas) {
        const ini = deLocal(`${fecha}T${hhmm}`);
        out.push({ inicioLocal: ini.format('YYYY-MM-DDTHH:mm'), inicio: ini.toDate(), fin: ini.add(duracionMin, 'minute').toDate() });
      }
    }
    return out;
  }
  const slotKey = (inicio, n = 1) => `${local(inicio).format('YYYY-MM-DDTHH:mm')}#${n}`;
  const periodoDe = (inicio) => local(inicio).format('YYYY-MM');
  function esFranjaValida(inicio) {
    if (!(inicio instanceof Date) || Number.isNaN(inicio.getTime())) return false;
    const l = local(inicio);
    return l.day() >= 1 && l.day() <= 5 && l.second() === 0 && l.millisecond() === 0 && franjas.includes(l.format('HH:mm'));
  }
  const lunesDe = (inicio) => { const l = local(inicio).startOf('day'); return l.subtract((l.day() + 6) % 7, 'day').format('YYYY-MM-DD'); };
  return { franjasDeSemana, slotKey, periodoDe, esFranjaValida, lunesDe };
}
module.exports = { crearFranjas };
```
`festivos.js`: envuelve `colombian-holidays` (verifica su API exportada en el README instalado) y devuelve fechas `YYYY-MM-DD` del rango. Si el paquete no se instaló o falla, usa una tabla fija 2026–2027 en el mismo archivo.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit `feat(masajes): dominio de franjas y festivos`.

---

## Task 4: Dominio — reglas, teléfono y errores

**Files:**
- Create: `src/masajes/dominio/{reglas,telefono}.js`
- Modify: `src/masajes/utils/MasajesError.js` (fábricas de errores de dominio)
- Create: `src/masajes/__tests__/reglas.test.js`

- [ ] **Step 1: Tests que fallan**
```js
const { crearReglas, estadoConsumeCupo } = require('../dominio/reglas');
const { normalizarCelular, enmascararCelular } = require('../dominio/telefono');
const { puedeAgendar, puedeModificar } = crearReglas({ anticipacionAgendarH: 24, anticipacionModificarH: 24 });
const ahora = new Date('2026-11-23T13:00:00Z'); // lun 8:00 local

it('empleado: agendar requiere 24h', () => {
  expect(puedeAgendar({ ahora, inicio: new Date('2026-11-24T13:00:00Z'), esAdmin: false })).toBe(true);
  expect(puedeAgendar({ ahora, inicio: new Date('2026-11-24T12:59:00Z'), esAdmin: false })).toBe(false);
});
it('admin ignora anticipación pero no el pasado', () => {
  expect(puedeAgendar({ ahora, inicio: new Date('2026-11-23T14:00:00Z'), esAdmin: true })).toBe(true);
  expect(puedeAgendar({ ahora, inicio: new Date('2026-11-23T12:00:00Z'), esAdmin: true })).toBe(false);
});
it('modificar: solo agendada y con 24h (empleado)', () => {
  const cita = { estado: 'agendada', inicio: new Date('2026-11-24T14:00:00Z') };
  expect(puedeModificar({ ahora, cita, esAdmin: false })).toBe(true);
  expect(puedeModificar({ ahora, cita: { ...cita, estado: 'cancelada' }, esAdmin: true })).toBe(false);
});
it('estados que consumen cupo', () => {
  expect(['agendada', 'asistio', 'no_asistio'].every(estadoConsumeCupo)).toBe(true);
  expect(estadoConsumeCupo('cancelada')).toBe(false);
});
it('normaliza y valida celulares móviles colombianos', () => {
  expect(normalizarCelular('3152884079')).toBe('573152884079');
  expect(normalizarCelular('+57 315 288 4079')).toBe('573152884079');
  expect(normalizarCelular('6075551234')).toBeNull(); // fijo, no móvil
  expect(normalizarCelular('12345')).toBeNull();
});
it('enmascara para logs', () => expect(enmascararCelular('573152884079')).toBe('57315****079'));
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementa. `normalizarCelular` exige `^573\d{9}$` tras normalizar. En `MasajesError.js`, las fábricas de dominio:
```js
const AppError = require('../../utils/AppError');
class MasajesError extends AppError {
  constructor(statusCode, motivo, message, errors) { super(message, statusCode); this.motivo = motivo; if (errors) this.errors = errors; }
}
const E = {
  NO_AUTENTICADO: () => new MasajesError(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida'),
  NO_BENEFICIARIO: () => new MasajesError(403, 'NO_BENEFICIARIO', 'No estás en el listado de beneficiarios. Comunícate con Talento Humano.'),
  NO_ADMIN: () => new MasajesError(403, 'NO_ADMIN', 'No tienes permisos de administrador de la agenda.'),
  NO_ENCONTRADA: () => new MasajesError(404, 'NO_ENCONTRADA', 'La cita no existe.'),
  SLOT_OCUPADO: () => new MasajesError(409, 'SLOT_OCUPADO', 'Esa franja acaba de ser tomada. Elige otra.'),
  CUPO_MES_USADO: () => new MasajesError(409, 'CUPO_MES_USADO', 'Ya tienes una sesión agendada para ese mes.'),
  SLOT_CON_CITA: () => new MasajesError(409, 'SLOT_CON_CITA', 'Esa franja tiene una cita activa: reprográmala antes de bloquearla.'),
  FUERA_DE_VENTANA: () => new MasajesError(422, 'FUERA_DE_VENTANA', 'Esa franja no está habilitada.'),
  ANTICIPACION_INSUFICIENTE: () => new MasajesError(422, 'ANTICIPACION_INSUFICIENTE', 'Los cambios se permiten hasta 24 horas antes de la cita.'),
  ESTADO_INVALIDO: () => new MasajesError(422, 'ESTADO_INVALIDO', 'La cita ya no se puede modificar.'),
  VALIDACION: (errors) => new MasajesError(400, 'VALIDACION', 'Revisa los datos enviados.', errors),
};
module.exports = MasajesError;
module.exports.E = E;
```
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit `feat(masajes): reglas de negocio y errores de dominio`.

---

## Task 5: Importación de beneficiarios

**Files:**
- Create: `src/masajes/repositorios/beneficiarios.js`, `services/beneficiarios.service.js`
- Create: `src/masajes/scripts/importarBeneficiarios.js` (`npm run masajes:importar -- <ruta.xlsx>`)
- Create: `src/masajes/__tests__/fixtures/listado.xlsx` (5 filas, incluye un correo compartido, una celda con fórmula y un nombre con `<b>`)
- Create: `src/masajes/__tests__/beneficiarios.int.test.js`

- [ ] **Step 1: Tests que fallan**
  - Importa el fixture: crea 5 beneficiarios, celulares normalizados, nombres en título (`Edwin Brandon Ortega Ramirez`), `ad_usuario` NULL.
  - Reimportar el mismo archivo **no duplica** (match por nombre normalizado + celular) y actualiza cargo/correo.
  - Columnas esperadas por encabezado: `NOMBRE`, `CARGO`, `NUEMRODECELULAR` (sic, también acepta `CELULAR`), `CORREO ELECTRONICO`. La primera fila de título se ignora.
  - Devuelve resumen `{ creados, actualizados, errores: [{ fila, motivo }] }`.
  - **Seguridad:** la celda con fórmula se guarda por su `result` como texto (nunca la fórmula); el nombre con `<b>` se guarda tal cual (se escapa al mostrarlo, no al guardarlo); más de 500 filas → error sin importar nada; un error en una fila intermedia no deja la importación a medias (todo en una transacción).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementa con `exceljs` (`workbook.xlsx.load(buffer)`): lee solo las columnas esperadas y toma `cell.text` o `cell.result` para fórmulas. El script CLI lee el archivo y llama al servicio con un `buffer`, el mismo camino que usará el endpoint de la Tarea 11.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit `feat(masajes): importacion del listado de beneficiarios`.

---

## Task 6: Login AD, token y middlewares de identidad

**Files:**
- Create: `src/masajes/services/auth.service.js` (calcado de `src/porteria/services/auth.service.js`)
- Create: `src/masajes/middleware/autenticacion.js` (`crearAutenticacion`, `requiereRol`, `crearResolverBeneficiario`)
- Create: `src/masajes/routes/auth.routes.js` (`POST /auth/login`, `GET /auth/sesion`)
- Create: `src/masajes/__tests__/{auth.service,autenticacion}.test.js`, `__tests__/auth.routes.int.test.js`

- [ ] **Step 1: Tests que fallan**
  - `auth.service`:
    1. `rolDesdeGrupos(memberOf, dn)`: DN exacto → `admin_masajes`. **Mismo CN en otra OU** (`CN=GG-Masajes-Admin,OU=Otra,DC=olivos,DC=local`) → `empleado`. Grupo cuyo DN **contiene** el nombre (`CN=GG-Masajes-Admin-Viejo,…`) → `empleado`. Comparación case-insensitive y sin espacios alrededor de las comas.
    2. `firmarToken` + `verificarToken` (ida y vuelta). Token de Portería (otro secreto) → 401. Token con `scope: 'porteria'` firmado con el secreto de Masajes → 401. Rol fuera de la lista → 401. `alg: none` → 401. Sin `exp` → 401.
  - `POST /auth/login` (directorio mockeado, BD de prueba):
    1. Credenciales malas → 401 `NO_AUTENTICADO`; AD caído → 503 y no cuenta para el rate limit.
    2. Beneficiario vinculado → 200 con `{ token, usuario: { usuario, nombre, rol, beneficiario: { id, nombre } } }`; el token **no** contiene celular, correo ni `beneficiario_id`.
    3. Sin vínculo, `email` corporativo que coincide con **un** beneficiario sin vincular → autovincula, guarda `ad_usuario` normalizado y escribe historial `autovinculacion`.
    4. `email` que coincide con **dos** beneficiarios (buzón compartido) → no vincula → 403 `NO_BENEFICIARIO`.
    5. `email` de dominio no corporativo (`@gmail.com`) → no autovincula aunque coincida.
    6. Beneficiario `activo=0` y no admin → 403, sin token.
    7. Admin no beneficiario → 200 con `rol: 'admin_masajes'` y `beneficiario: null`.
    8. `OLIVOS\\EOrtega` y `eortega@olivos.local` se normalizan a `eortega`.
    9. 11 fallos del mismo usuario+IP en 15 min → 429; los logins exitosos no cuentan.
    10. La contraseña no aparece en ningún log (espía sobre el logger).
  - Middlewares:
    1. `resolverBeneficiario` relee en cada request: desactivar al beneficiario después del login → la siguiente petición de empleado da 403.
    2. `requiereRol('admin_masajes')` con rol `empleado` → 403 `NO_ADMIN`.
    3. Rutas de empleado con `req.msjBeneficiario = null` → 403 `NO_BENEFICIARIO`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implementación de `auth.service.js`**
```js
// Rol de Masajes desde los grupos del AD y JWT propio del módulo (scope 'masajes'). Patrón de Portería.
const jwt = require('jsonwebtoken');
const { E } = require('../utils/MasajesError');

const ROLES = Object.freeze({ ADMIN: 'admin_masajes', EMPLEADO: 'empleado' });
const SCOPE = 'masajes';

// memberOf trae DNs completos. Se compara el DN EXACTO (spec §9.2): ni subcadena (el error de detectarRoles
// en H360) ni solo CN (Portería), porque un grupo homónimo en otra OU daría permisos de admin.
const normalizarDn = (dn) => String(dn).split(',').map((p) => p.trim()).join(',').toLowerCase();

function rolDesdeGrupos(memberOf, grupoAdminDn) {
  const objetivo = normalizarDn(grupoAdminDn || '');
  const esAdmin = Boolean(grupoAdminDn) && (memberOf || []).some((dn) => normalizarDn(dn) === objetivo);
  return esAdmin ? ROLES.ADMIN : ROLES.EMPLEADO;
}

function firmarToken({ usuario, nombre, rol }, { jwtSecret, jwtExpires }) {
  return jwt.sign({ scope: SCOPE, nombre, rol }, jwtSecret, { subject: usuario, algorithm: 'HS256', expiresIn: jwtExpires });
}

function verificarToken(token, jwtSecret) {
  let p;
  try {
    p = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw E.NO_AUTENTICADO();
  }
  if (p.scope !== SCOPE || !p.sub || !Number.isInteger(p.exp) || !Object.values(ROLES).includes(p.rol)) throw E.NO_AUTENTICADO();
  return { usuario: p.sub, nombre: p.nombre, rol: p.rol, exp: p.exp };
}

module.exports = { ROLES, SCOPE, rolDesdeGrupos, firmarToken, verificarToken, normalizarDn };
```
- [ ] **Step 4:** `auth.routes.js` copiando de Portería `normalizarUsuario`, los dos limitadores (`skipSuccessfulRequests` + `requestWasSuccessful: res.statusCode !== 401`) y el manejo de errores del directorio. Valida `usuario` (≤ 100) y `contrasena` (≤ 200) como texto no vacío. La autovinculación va en `beneficiarios.service.vincularPorCorreo({ usuario, email, auditoria })`, dentro de una transacción con `SELECT … FOR UPDATE` para que dos logins simultáneos no vinculen dos veces.
- [ ] **Step 5:** Tests → PASS.
- [ ] **Step 6:** Commit `feat(masajes): login AD, token propio y middlewares de identidad`.

---

## Task 7: Disponibilidad

**Files:**
- Create: `src/masajes/repositorios/{semanas,citas}.js`, `services/disponibilidad.service.js`
- Create: `src/masajes/__tests__/disponibilidad.int.test.js`

- [ ] **Step 1: Tests que fallan**
  - Semana `borrador` → no aparece para empleado; sí para admin (`incluirNoPublicadas`).
  - Semana publicada sin citas → 30 franjas `libre` (o menos si hay festivo).
  - Cita activa → esa franja `ocupada`. Para empleado la respuesta **no contiene** nombre, correo, celular ni `beneficiario_id` (busca en el JSON serializado); el admin sí ve nombre.
  - Bloqueo de 08:00–12:00 → 3 franjas `bloqueada`.
  - Franjas con inicio < ahora + anticipación → `pasada` para empleado.
  - Rango `desde`–`hasta` > 31 días → `VALIDACION`.
  - `esFranjaHabilitada(conn, inicio)` devuelve `{ semanaId, capacidad }` o `null`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementa: `franjasDeSemana` (los festivos ya están como bloqueos, pero filtra igual) − bloqueos − citas activas (`slot_key IS NOT NULL`). La respuesta del empleado se arma con una lista blanca de campos (`{ inicio, estado }`), nunca con la fila de BD.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit `feat(masajes): servicio de disponibilidad`.

---

## Task 8: Agendar (núcleo)

**Files:**
- Create: `src/masajes/services/citas.service.js`, `services/outbox.service.js` (solo `encolar` en esta tarea)
- Create: `src/masajes/__tests__/agendar.int.test.js`, `__tests__/mapDuplicado.test.js`

- [ ] **Step 1: Tests que fallan**
```js
it('agenda y encola calendar + spa + confirmación', async () => {
  const cita = await citas.agendar({ beneficiarioId: b1, inicio: lun9, actor: 'eortega', esAdmin: false, auditoria });
  expect(cita.estado).toBe('agendada');
  expect(cita.periodo).toBe('2026-11');
  const [tipos] = await conn.execute('SELECT tipo FROM msj_notificaciones WHERE cita_id = ? ORDER BY tipo', [cita.id]);
  expect(tipos.map((t) => t.tipo)).toEqual(['calendar_upsert', 'empleado_confirmacion', 'spa_nueva']);
  const [[h]] = await conn.execute("SELECT COUNT(*) n FROM msj_cita_historial WHERE cita_id = ? AND accion = 'creada'", [cita.id]);
  expect(h.n).toBe(1);
});
it('dos reservas simultáneas de la misma franja: una gana', async () => {
  const r = await Promise.allSettled([
    citas.agendar({ beneficiarioId: b1, inicio: lun9, actor: 'a', esAdmin: false, auditoria }),
    citas.agendar({ beneficiarioId: b2, inicio: lun9, actor: 'b', esAdmin: false, auditoria }),
  ]);
  expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(r.find((x) => x.status === 'rejected').reason.motivo).toBe('SLOT_OCUPADO');
});
it('capacidad 2: dos reservas simultáneas entran (#1 y #2), la tercera no', async () => { /* ... */ });
it('segunda cita del mes → CUPO_MES_USADO', async () => { /* ... */ });
it('cita en diciembre no choca con cupo de noviembre', async () => { /* ... */ });
it('semana no publicada → FUERA_DE_VENTANA', async () => { /* ... */ });
it('hora no válida (11:00) → FUERA_DE_VENTANA', async () => { /* ... */ });
it('empleado con < 24h → ANTICIPACION_INSUFICIENTE; admin pasa', async () => { /* ... */ });
it('beneficiario inactivo (admin agendando por él) → VALIDACION', async () => { /* ... */ });
```
```js
// __tests__/mapDuplicado.test.js
const dup = (k) => ({ code: 'ER_DUP_ENTRY', sqlMessage: `Duplicate entry 'x' for key 'msj_citas.${k}'` });
expect(mapDuplicado(dup('uq_msj_citas_cupo_key')).motivo).toBe('CUPO_MES_USADO');
expect(mapDuplicado(dup('uq_msj_citas_slot_key')).motivo).toBe('SLOT_OCUPADO');
expect(mapDuplicado(dup('otro_indice'))).toEqual(dup('otro_indice')); // no se disfraza: termina en 500
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implementación**

  En InnoDB, un `ER_DUP_ENTRY` solo deshace **esa sentencia**, no la transacción. Por eso, con capacidad > 1, se reintenta el siguiente `#n` dentro de la misma transacción, sin leer antes un "primer índice libre" que podría quedar obsoleto.
```js
// services/citas.service.js
const { E } = require('../utils/MasajesError');

// Decide por nombre de índice (Tarea 2). Un duplicado de otro índice NO se disfraza de SLOT_OCUPADO.
// sqlMessage se lee para decidir, pero NUNCA se registra (contiene datos): ver errorParaLog.
function mapDuplicado(err) {
  if (!err || err.code !== 'ER_DUP_ENTRY') return err;
  const m = String(err.sqlMessage || '');
  if (m.includes('uq_msj_citas_cupo_key')) return E.CUPO_MES_USADO();
  if (m.includes('uq_msj_citas_slot_key')) return E.SLOT_OCUPADO();
  return err;
}

async function enTransaccion(bd, fn) {
  const conn = await bd.obtener().getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

const SQL_INSERT_CITA = `INSERT INTO msj_citas
  (beneficiario_id, semana_id, inicio, fin, periodo, estado, slot_key, cupo_key, creado_por, actualizado_por)
  VALUES (?, ?, ?, ?, ?, 'agendada', ?, ?, ?, ?)`;

function crearServicioCitas({ bd, config, franjas, reglas, disponibilidad, beneficiarios, outbox, reloj = () => new Date() }) {
  async function insertarConIndice(conn, d, capacidad) {
    for (let n = 1; n <= capacidad; n++) {
      try {
        const [r] = await conn.execute(SQL_INSERT_CITA, [
          d.beneficiarioId, d.semanaId, d.inicio, d.fin, d.periodo,
          franjas.slotKey(d.inicio, n), `${d.beneficiarioId}:${d.periodo}`, d.actor, d.actor,
        ]);
        return r.insertId;
      } catch (err) {
        const e = mapDuplicado(err);
        if (e.motivo === 'SLOT_OCUPADO' && n < capacidad) continue; // probar el siguiente cupo de la franja
        throw e;
      }
    }
    throw E.SLOT_OCUPADO();
  }

  async function agendar({ beneficiarioId, inicio, actor, esAdmin, auditoria = {} }) {
    inicio = new Date(inicio);
    if (!franjas.esFranjaValida(inicio)) throw E.FUERA_DE_VENTANA();
    if (!reglas.puedeAgendar({ ahora: reloj(), inicio, esAdmin })) throw E.ANTICIPACION_INSUFICIENTE();
    const periodo = franjas.periodoDe(inicio);
    const fin = new Date(inicio.getTime() + config.duracionMin * 60000);

    return enTransaccion(bd, async (conn) => {
      if (!(await beneficiarios.estaActivo(conn, beneficiarioId))) throw E.VALIDACION([{ campo: 'beneficiarioId', motivo: 'inactivo' }]);
      const hab = await disponibilidad.esFranjaHabilitada(conn, inicio);
      if (!hab) throw E.FUERA_DE_VENTANA();
      const id = await insertarConIndice(conn, { beneficiarioId, semanaId: hab.semanaId, inicio, fin, periodo, actor }, hab.capacidad);
      await conn.execute(
        `INSERT INTO msj_cita_historial (cita_id, accion, inicio_nuevo, usuario, es_admin, ip, user_agent, request_id)
         VALUES (?, 'creada', ?, ?, ?, ?, ?, ?)`,
        [id, inicio, actor, esAdmin ? 1 : 0, auditoria.ip ?? null, auditoria.userAgent?.slice(0, 255) ?? null, auditoria.requestId ?? null],
      );
      const cita = { id, beneficiario_id: beneficiarioId, inicio, fin, periodo, estado: 'agendada' };
      await outbox.encolar(conn, cita, [['calendar_upsert', 'google'], ['spa_nueva', 'email'], ['empleado_confirmacion', 'email']]);
      return cita;
    });
  }

  return { agendar };
}

module.exports = { crearServicioCitas, mapDuplicado, enTransaccion };
```
`outbox.encolar(conn, cita, pares)` hace `INSERT IGNORE` con `clave = ${cita.id}:${tipo}:${canal}:${cita.inicio.toISOString()}`.
- [ ] **Step 4:** Tests → PASS. Corre 5 veces el de concurrencia: `for i in 1 2 3 4 5; do npm run test:masajes:int -- -t simultáneas || break; done`.
- [ ] **Step 5:** Commit `feat(masajes): agendar cita con control de concurrencia y cupo`.

---

## Task 9: Reprogramar y cancelar

**Files:**
- Modify: `src/masajes/services/citas.service.js`
- Create: `src/masajes/__tests__/reprogramar-cancelar.int.test.js`

- [ ] **Step 1: Tests que fallan**
  - Cancelar: estado `cancelada`, `slot_key`/`cupo_key` NULL, historial, encola `calendar_delete`, `spa_cancelada`, `empleado_cancelacion`; la franja queda libre y el beneficiario puede volver a agendar ese mes.
  - Reprogramar: misma fila, nuevo `inicio`/`slot_key`/`periodo`/`cupo_key`; encola `calendar_upsert` y `spa_reprogramada` con la clave del **nuevo** inicio; historial con anterior y nuevo.
  - Reprogramar a franja ocupada → `SLOT_OCUPADO` y la cita original queda intacta (rollback).
  - Reprogramar a otro mes donde ya tiene cita → `CUPO_MES_USADO`.
  - Empleado con < 24h → `ANTICIPACION_INSUFICIENTE`; admin pasa.
  - **IDOR:** un empleado no puede tocar citas de otro beneficiario → `404 NO_ENCONTRADA` y la cita queda intacta. Se valida **en el servicio** (no solo en la ruta) y se prueba aquí y otra vez en la Tarea 11.
  - Admin cancela sin motivo → `VALIDACION` (spec §5.5).
  - Cita `cancelada`/`asistio` → `ESTADO_INVALIDO`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementa `reprogramar({ citaId, inicio, actor, esAdmin, beneficiarioIdActor, auditoria })` y `cancelar({ citaId, motivo, actor, esAdmin, beneficiarioIdActor, auditoria })` dentro de `enTransaccion`:
  - Lectura con `SELECT … FROM msj_citas WHERE id = ? [AND beneficiario_id = ?] FOR UPDATE`; el filtro de propiedad se agrega siempre que `!esAdmin`. Sin fila → `E.NO_ENCONTRADA()`.
  - Al reprogramar o cancelar, marca `descartado` las notificaciones `pendiente` de recordatorio cuya clave tenga el inicio anterior.
- [ ] **Step 4:** Tests → PASS.
- [ ] **Step 5:** Commit `feat(masajes): reprogramar y cancelar citas`.

---

## Task 10: Administración de semanas, bloqueos y asistencia

**Files:**
- Create: `src/masajes/services/semanas.service.js`
- Modify: `src/masajes/services/citas.service.js` (`marcarAsistencia`)
- Create: `src/masajes/__tests__/semanas.int.test.js`

- [ ] **Step 1: Tests que fallan**
  - Crear semana con fecha no-lunes → `VALIDACION`; duplicada → 409 (`uq_msj_semanas_fecha_inicio`).
  - Crear semana 2026-11-16 → genera el bloqueo `festivo` del lunes 16.
  - Publicar/cerrar cambian estado; cerrar no toca citas.
  - Agregar bloqueo sobre franja con cita activa → 409 `SLOT_CON_CITA` (el admin debe reprogramar primero).
  - Eliminar bloqueo libera franjas. Un bloqueo de otra semana no se puede borrar desde esta (`WHERE id = ? AND semana_id = ?`).
  - Resumen de ocupación: `{ total, ocupadas, libres, bloqueadas }`.
  - `marcarAsistencia` solo sobre citas pasadas `agendada` → `asistio`/`no_asistio` (el cupo sigue consumido).
- [ ] **Step 2–4:** FAIL → implementa → PASS.
- [ ] **Step 5:** Commit `feat(masajes): administracion de semanas, bloqueos y asistencia`.

---

## Task 11: Rutas, validación y Swagger

**Files:**
- Create: `src/masajes/routes/{empleado,admin}.routes.js` (fábricas `crearRouterEmpleado({ autenticar, resolverBeneficiario, citas, disponibilidad })`, etc.)
- Create: `src/masajes/middleware/{validar,subidaXlsx}.js`
- Modify: `src/masajes/routes/index.js` (compone sub-routers como Portería)
- Create: `src/masajes/testing/appPrueba.js`, `src/masajes/__tests__/api.int.test.js`

- [ ] **Step 1: Tests que fallan** — uno por endpoint de la spec §8, verificando HTTP, `motivo` y `error` (código de API):
  - Sin token → 401 en **todas** las rutas salvo `/auth/login` y `/health`. El test recorre los routers montados para que una ruta nueva no quede pública por olvido.
  - Token de Portería o del auth principal de Mantix → 401.
  - Usuario fuera del listado → 403 `NO_BENEFICIARIO`.
  - `GET /me` devuelve `{ beneficiario, cupos: { '2026-11': {...}, '2026-12': {...} }, citas }`, sin `ad_usuario` ni campos internos (`slot_key`, `cupo_key`).
  - `GET /disponibilidad` como empleado no contiene nombres, correos ni celulares; rango > 31 días → 400.
  - `POST /citas` como empleado ignora `beneficiarioId` del body (siempre usa el propio). Con campos extra (`estado`, `slot_key`) → 400 `VALIDACION`.
  - `inicio` sin zona horaria (`2026-11-24T09:00`) → 400; string basura → 400.
  - `PATCH /citas/:id/reprogramar` de otra persona → **404** `NO_ENCONTRADA`; `:id` no numérico → 400.
  - Rutas `/admin/*` con rol `empleado` → 403 `NO_ADMIN`.
  - `POST /admin/beneficiarios/importar`: acepta multipart xlsx; > 2 MB → 413; `.xlsx` renombrado que no es zip → 400.
  - Error inesperado (servicio mock que lanza) → 500 `{ motivo: 'ERROR_INTERNO', message: 'Error interno del servidor' }`, **sin** `stack`, SQL ni mensaje original.
  - 21 escrituras en un minuto del mismo usuario → 429.
- [ ] **Step 2–4:** FAIL → implementa → PASS:
  - `validar.js`: middleware con `joi` (ya instalado) para `body`/`query`/`params`, con `{ allowUnknown: false, abortEarly: false, convert: false }`. Si falla → `E.VALIDACION(detalles)`, con los detalles reducidos a `{ campo, motivo }` sin eco del valor recibido. Esquema de `inicio`: `Joi.string().isoDate().pattern(/(Z|[+-]\d{2}:\d{2})$/)` y sin milisegundos.
  - Orden en `routes/index.js`: `apiCodigo` → `autenticar` → `rateLimit` por usuario (`keyGenerator: req => req.msjUsuario.usuario`; escrituras 20/min, lecturas 120/min, importación 5/h) → `resolverBeneficiario` → rutas. `requiereRol('admin_masajes')` va en `router.use('/admin', …)`, no ruta por ruta.
  - `subidaXlsx.js`: `multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 } })` + extensión `.xlsx` + MIME de OpenXML + magic bytes `PK\x03\x04`. El archivo **nunca** se escribe en disco (y menos en `/uploads`, que se sirve sin autenticación).
  - Cada ruta arma `auditoria = { ip: req.ip, userAgent: req.get('user-agent'), requestId: req.msjApiCodigo }`. `trust proxy = 1` ya está en `app.js`; confirma que en producción hay exactamente un proxy delante.
- [ ] **Step 5:** Anotaciones Swagger con el tag `Masajes`. **Ojo:** `/api-docs` se publica hoy sin condición también en producción (`notas-masajes.md` H3). No expongas ahí ejemplos con datos reales y abre la tarea aparte para protegerlo.
- [ ] **Step 6:** Commit `feat(masajes): API REST, validacion y documentacion swagger`.

---

## Task 12: Adaptadores externos

**Files:**
- Create: `src/masajes/adapters/{googleCalendar,hablameSms,correo}.js` + `plantillas/*.js`
- Create: `src/masajes/utils/redactar.js`
- Create: `src/masajes/__tests__/adapters.test.js`

- [ ] **Step 1: Confirmar contrato Háblame.** Revisa la documentación vigente de la API de Háblame (panel ecare.hablame.co → sección API / desarrolladores) y anota en `docs/masajes/notas-masajes.md`: URL, método, headers de autenticación, payload y respuestas de éxito y error. **No inventes el contrato**: si no se puede confirmar, deja el adaptador parametrizado por env y marca la tarea como bloqueada para revisión humana.
- [ ] **Step 2: Tests que fallan**
  - `googleCalendar.upsert(cita, beneficiario)` sin `google_event_id` → `events.insert` con `timeZone: 'America/Bogota'`, `visibility: 'private'`, `attendees` del empleado, `sendUpdates: 'all'`, **sin** celular ni cargo; devuelve id. Con id → `events.patch`. `eliminar(id)` → `events.delete`; un 404/410 de Google se trata como éxito. (Mock del cliente `googleapis`.)
  - `hablameSms.enviar('573152884079', texto)` → request correcto (`nock`), API key en header y no en la URL. Una respuesta de error lanza con un mensaje legible y sin headers. Con `nock.delay` mayor al timeout lanza en ≤ 10 s. Una respuesta 3xx no se sigue.
  - Plantillas: `recordatorioSms(cita)` ≤ 160 caracteres y sin tildes/ñ; `esHoyEmail` contiene "¡Es hoy! ¡Es hoy!", fecha "jueves 26 de noviembre", hora "9:00 a. m." y dirección del spa; los correos al spa incluyen nombre, cargo y celular.
  - **Escape:** un beneficiario llamado `<img src=x onerror=alert(1)>` y un motivo `"><script>` aparecen escapados (`&lt;img…`) en **todas** las plantillas HTML. Un nombre con `\r\nBcc: x@y.co` no altera el asunto.
  - `redactar(err)` quita `Authorization`, API keys, query strings y celulares completos, y trunca a 1000 caracteres.
- [ ] **Step 3–4:** FAIL → implementa → PASS.
  - Google: `google.auth.JWT` con keyFile = `MSJ_GOOGLE_SA_JSON`, `subject` = `MSJ_GOOGLE_IMPERSONAR` tomado **solo** de `leerIntegraciones()` y scope **`https://www.googleapis.com/auth/calendar.events`** (no `.../auth/calendar`, más amplio de lo necesario).
  - Correo: usa `src/services/emailService.js` (revisa su función de envío y el `EMAIL_FROM`). Helper `esc()` (`& < > " '`) en cada valor interpolado y asuntos con `.replace(/[\r\n]+/g, ' ')`. El destinatario sale solo de config (spa) o del registro del beneficiario.
  - Háblame: `axios.create({ timeout: 10000, maxRedirects: 0 })` y errores envueltos sin `config.headers`.
- [ ] **Step 5:** Commit `feat(masajes): adaptadores google calendar, correo y sms hablame`.

---

## Task 13: Worker del outbox

**Files:**
- Modify: `src/masajes/services/outbox.service.js` (`procesarPendientes`)
- Create: `src/masajes/__tests__/outbox.int.test.js`

- [ ] **Step 1: Tests que fallan** (adaptadores mockeados)
  - Procesa `calendar_upsert` → guarda `google_event_id` en la cita y marca `enviado`.
  - Fallo del adaptador → `intentos+1`, `proximo_intento` = ahora + 2^intentos min, `ultimo_error = redactar(err)`; al 5.º → `fallido`.
  - Recordatorio cuya cita ya está `cancelada` o cuyo `inicio` no coincide con la clave → `descartado` sin llamar al adaptador.
  - Dos `procesarPendientes()` concurrentes no envían el mismo registro dos veces (`FOR UPDATE SKIP LOCKED` + cambio de estado dentro de la transacción).
  - Despacho por `tipo`/`canal` a la plantilla correcta.
  - `ultimo_error` de un fallo de axios **no contiene** la API key, `Authorization` ni el celular completo, y mide ≤ 1000 caracteres.
  - Al alcanzar `MSJ_SMS_TOPE_DIARIO`, los SMS restantes quedan `pendiente` para el día siguiente y se registra un log de alerta.
  - Con `leerIntegraciones()` no ok, el worker no procesa nada y registra el motivo una sola vez.
- [ ] **Step 2–4:** FAIL → implementa → PASS. `SELECT … WHERE estado = 'pendiente' AND proximo_intento <= ? ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED` con `conn.execute(sql, [ahora])`. El `LIMIT` va fijo en el SQL, no como parámetro.
- [ ] **Step 5:** Commit `feat(masajes): worker de outbox con reintentos e idempotencia`.

---

## Task 14: Jobs programados

**Files:**
- Create: `src/masajes/jobs/index.js` (exporta `start()`, como los jobs de SerVentas)
- Create: `src/masajes/services/recordatorios.service.js`
- Modify: `server.js` → junto a los otros `require('./src/…/jobs/…').start()`: `if (process.env.MSJ_JOBS_ENABLED === 'true') require('./src/masajes/jobs').start();`
- Create: `src/masajes/__tests__/recordatorios.int.test.js`

- [ ] **Step 1: Tests que fallan** (reloj inyectado)
  - `encolarRecordatorios2d(ahora = 2026-11-24 07:00 local)` encola email+sms para citas `agendada` del 26-nov; ejecutarlo dos veces no duplica.
  - Una cita creada el 25-nov para el 26-nov no recibe `recordatorio_2d`.
  - `encolarEsHoy(ahora = 2026-11-26 06:30 local)` encola `es_hoy` solo para las citas `agendada` de hoy.
  - Cita reprogramada después de encolar → el recordatorio viejo termina `descartado` al procesar.
  - Un job que lanza no tumba el proceso: se registra con `errorParaLog` y el siguiente tick corre normal.
- [ ] **Step 2–4:** FAIL → implementa → PASS.
  - Crons: `*/2 * * * *` outbox, `0 7 * * *` recordatorio 2d (también fines de semana, porque el recordatorio de una cita del lunes sale el sábado) y `30 6 * * 1-5` es-hoy.
  - Todos con `{ timezone: 'America/Bogota' }`.
  - Si `leerEntorno()` no está ok, `start()` registra el motivo y no programa nada.
- [ ] **Step 5:** Commit `feat(masajes): jobs de recordatorios y es hoy`.

---

## Task 15: Frontend — vista empleado

**Files (repo frontend `mantix-frontend`, ajustar a su estructura; replicar cómo lo hace Portería):**
- Create: `src/modules/masajes/api.js`, `stores/masajes.js` (Pinia)
- Create: `src/modules/masajes/views/{Login,MiAgenda}.vue`, `components/{TarjetaBono,GrillaSemana,ModalConfirmar}.vue`
- Modify: router (`/masajes`, guard de sesión **con el token de Masajes**, separado del de Mantix)

- [ ] **Step 1:** Tests de store (Vitest si existe): login guarda el token de Masajes donde Portería guarda el suyo (Q10); carga `/me` y disponibilidad; `agendar` refresca ambas; muestra `message` del error; un 401 limpia la sesión y redirige al login.
- [ ] **Step 2:** `TarjetaBono`: estado del mes actual y siguiente; botones Reprogramar/Cancelar deshabilitados con tooltip si faltan < 24 h.
- [ ] **Step 3:** `GrillaSemana`: selector de semanas publicadas, días × franjas, colores por estado (Tailwind); en móvil, lista por día.
- [ ] **Step 4:** Flujos: agendar → modal → toast; reprogramar = elegir nueva franja en la grilla con el banner "Reprogramando tu cita del …"; cancelar = modal con motivo opcional.
- [ ] **Step 4b: Seguridad frontend:** nada de `v-html` con datos del API (activa `vue/no-v-html` como error en el módulo). El token no se escribe en logs, en la URL ni en mensajes de error. Los errores muestran `message` del API, nunca `error.response` crudo. La contraseña del login no se guarda en el store.
- [ ] **Step 5:** Verificación manual en navegador (desktop y 375 px). Commit `feat(masajes-web): agenda del empleado`.

---

## Task 16: Frontend — vista admin

**Files:** `views/admin/{Semanas,Citas,Beneficiarios,Notificaciones}.vue`, guard por `rol === 'admin_masajes'`. El guard es solo de UX: la autorización real está en el backend.

- [ ] **Step 1:** Semanas: crear por lunes, ver festivos detectados, bloquear franjas desde la grilla, publicar/cerrar, % de ocupación.
- [ ] **Step 2:** Citas: tabla con filtros, agendar por un beneficiario (buscador), reprogramar, cancelar (motivo obligatorio), marcar asistencia.
- [ ] **Step 3:** Beneficiarios: importar xlsx (muestra el resumen), vincular `ad_usuario`, activar/desactivar, filtro "sin vincular". Celulares enmascarados en la tabla, completos solo al editar.
- [ ] **Step 4:** Notificaciones: fallidas con su error (ya redactado en el backend) y botón reintentar.
- [ ] **Step 5:** Indicador "x / N bonos agendados en {mes}". Commit `feat(masajes-web): panel de administracion`.

---

## Task 17: Revisión de seguridad

**Files:** solo lectura, más correcciones puntuales donde haga falta.

- [ ] **Step 1:** Recorre la spec §17 y §9 punto por punto y anota en `docs/masajes/notas-masajes.md` cada control como ✅ implementado (con archivo y test), ⚠️ riesgo aceptado (con quién lo aceptó) o ❌ pendiente.
- [ ] **Step 2:** Búsqueda de secretos y patrones peligrosos en el módulo:
  ```bash
  git grep -nE "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{6,}" -- src/masajes
  git grep -nE "v-html|eval\(|new Function|\{\{\{" -- src/masajes
  git grep -nE "execute\(\`[^\`]*\\$\{|query\(\`[^\`]*\\$\{" -- src/masajes
  git grep -nE "sqlMessage|err\.message" -- src/masajes | grep -iE "log|warn|error\("
  git grep -nE "\.includes\(" -- src/masajes/services/auth.service.js
  ```
  Cada coincidencia se justifica o se corrige. La tercera búsqueda detecta SQL con interpolación de valores; la cuarta, datos de BD que podrían filtrarse en logs.
- [ ] **Step 3:** `npm audit --omit=dev` → sin vulnerabilidades altas ni críticas. Si aparece alguna, actualiza la dependencia o documenta por qué no es explotable.
- [ ] **Step 4:** Prueba manual de IDOR y de escalada con dos usuarios TIC de prueba: A intenta `PATCH`/`POST` sobre la cita de B cambiando el `id` → 404; un usuario sin el grupo intenta `/admin/*` → 403; un token de Portería contra `/api/masajes/v1/me` → 401.
- [ ] **Step 5:** Usa el skill `security-review` (o `superpowers:requesting-code-review` con foco en seguridad) sobre el diff completo del módulo.
- [ ] **Step 6:** Commit `chore(masajes): revision de seguridad`.

---

## Task 18: Verificación final y despliegue

- [ ] **Step 1:** Suites completas verdes: `npm run test:masajes` y `npm run test:masajes:int`. Además `npm run test:porteria` sigue verde (Masajes no tocó Portería).
- [ ] **Step 2:** Usa `superpowers:requesting-code-review` sobre el diff completo del módulo.
- [ ] **Step 3:** En staging: `npm run masajes:migrate`, `npm run masajes:importar -- "LISTADO MASAJES 53 BONOS.xlsx"`, crear una semana de prueba y vincular 2–3 usuarios TIC.
- [ ] **Step 4:** E2E manual contra los **criterios de aceptación §16 de la spec**, uno por uno y anotando evidencia: agendar → evento en Calendar + correo al spa; colisión de franja; cupo mensual; restricción de 24 h empleado vs admin; recordatorio 2d (forzar el job con fecha) por correo + SMS real a un celular TIC; "¡Es hoy!"; festivo no disponible; usuario fuera del listado; IDOR.
- [ ] **Step 5:** Producción (`srv-backend`):
  - Variables `MASAJES_JWT_SECRET` (≥ 32 caracteres, generado con `openssl rand -base64 48`, distinto de los demás) y `MSJ_*`.
  - Usuario de BD `MSJ_DB_USER` con mínimo privilegio (`docs/masajes/permisos-bd.sql`).
  - JSON de la cuenta de servicio fuera del repo, con permisos `600` y dueño el usuario del proceso; delegación de dominio autorizada **solo** para `calendar.events`.
  - `MSJ_JOBS_ENABLED=true` en una sola instancia pm2.
  - Migraciones, importación del listado y creación del grupo AD admin (anota su DN exacto en `MSJ_GRUPO_ADMIN_DN`).
  - Agenda la rotación de la llave de Google a 90 días.
- [ ] **Step 6:** Usa `superpowers:finishing-a-development-branch`. Commit/tag `release(masajes): v1.0.0`.
