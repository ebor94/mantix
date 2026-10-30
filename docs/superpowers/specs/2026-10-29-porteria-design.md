# Diseño — Módulo PORTERÍA (ingresos y salidas de vehículos)

- **Fecha:** 2026-10-29 · **Estado:** aprobado en brainstorming
- **Insumo:** `spec-porteria.md` (requerimientos originales). Este documento lo reemplaza donde difieran.
- **Repos:** backend `ebor94/mantix` (`src/porteria/`), frontend `ebor94/porteriasfn` (repo nuevo).

## 1. Objetivo y alcance

Los guardas de portería de todas las sedes de Serfunorte Los Olivos registran cada ingreso y salida de vehículos con su motivo. El sistema sabe en todo momento qué vehículos están dentro o fuera y deja trazabilidad completa.

Tipos de vehículo: `PROPIO` (tabla `vehiculos` de H360), `PROVEEDOR_ASISTENCIA` (proveedores de asistencias tercerizadas) y `PROVEEDOR` (proveedores generales).

**Fuera de alcance:** peatones, lectura automática de placas, talanqueras, GPS, fotos, modo sin conexión, alertas a Google Chat (se evalúan después del piloto) y cualquier cambio en H360.

## 2. Decisiones tomadas

| # | Tema | Decisión |
|---|---|---|
| 1 | Repo del front | Repo nuevo `ebor94/porteriasfn`. |
| 2 | Sede del guarda | La elige al iniciar turno; viaja en el token. Sin grupos AD por sede. |
| 3 | Conductor de propio | Lista del AD + opción "otro" con nombre libre (`conductor_otro = 1`). |
| 4 | Exequias listadas | Estados no terminales (excluye `REALIZADA`, `CANCELADA`) con `fecha` entre ayer y mañana; primero las que tienen asignado ese vehículo; si hay una sola, se preselecciona. |
| 5 | Motivos de proveedores | `SERES_QUERIDOS_TERCERIZADA`, `ENTREGA_MERCANCIA`, `MANTENIMIENTO_SERVICIO`, `OTRO` (ver §5). |
| 6 | Kilometraje | Opcional en propios (salida e ingreso). Sin fotos. |
| 7 | Conectividad | Red estable. Sin modo offline; la hora siempre la pone el servidor. |
| 8 | Alertas | No en V1. Inconsistencias y propios fuera se ven en el dashboard admin. |
| — | Viaje entre sedes | El estado es por placa, no por sede. Un propio que sale de A e ingresa en B cierra el viaje con normalidad. |
| — | Acceso a BD | Pool `mysql2` propio y SQL explícito (patrón Big Day), migrador con tabla de control (patrón TRK). |

## 3. Arquitectura del backend

```
src/porteria/
  config/        entorno.js          leerEntorno() → { ok, faltantes } (nunca lanza)
                 verificarEntorno.js secreto JWT presente y distinto de JWT_SECRET / IDENTIDAD_JWT_SECRET
                 apiCodigos.js       registro de códigos POR-xxx-nnn
  db.js          pool mysql2 perezoso: utf8mb4, credenciales DB_* de Mantix; cada conexión ejecuta
                 SET time_zone = '-05:00' (la opción timezone de mysql2 solo convierte Date de JS)
  repositorios/  eventos, estado, motivos, vehiculosExternos, auditoria (SQL explícito, reciben conexión/transacción)
  services/      h360Lectura.service.js   único punto que lee vehiculos, asistencias, exequias (H360) y sedes (Mantix)
                 conductores.service.js   listarMiembrosGrupo() de H360 + caché en memoria 10 min
                 auth.service.js, eventos.service.js, estado.service.js, motivos.service.js, reportes.service.js
  middleware/    porteriaAuth.js (JWT), requiereRol.js, requiereSede.js, errorHandler.js
  routes/  controllers/  migrations/  scripts/migrador.js
  testing/       docker-compose.yml (MySQL 8 en 127.0.0.1:3308, -05:00), globalSetup.js, env.js, repos en memoria
  __tests__/
```

- **Montaje:** `router.use('/porteria/v1', require('../porteria/routes').router)` en `src/routes/index.js`. Ningún `require` del módulo lanza por configuración: el router revisa `leerEntorno()` y `verificarEntorno()` en cada request y responde **503 `PORTERIA_DESHABILITADO`** si algo falta (se registra una vez en el log). Mantix arranca siempre.
- **Rate limit:** `/api/porteria/` se excluye del limitador global (`src/app.js`, como TRK/Big Day). `/auth/login` tiene su propio limitador.
- **Contrato de error** (igual a TRK): `{ success:false, error:'POR-EVT-003', motivo, message, errors? }`. Motivos según el status: 400/422 `VALIDACION`, 401 `NO_AUTENTICADO`, 403 `SIN_PERMISO`, 404 `NO_ENCONTRADO`, 409 `CONFLICTO` o específico (`SENTIDO_INCOHERENTE`), 429 `DEMASIADOS_INTENTOS`, 503 `PORTERIA_DESHABILITADO`. Un test verifica que cada ruta tenga su código registrado.
- **Swagger:** se agrega `./src/porteria/routes/*.js` a `apis` en `src/config/swagger.js` y se documentan las rutas con `@swagger`.
- **Dependencias externas:** H360 está en la misma base, así que sus datos siempre se validan en el backend. La única dependencia externa es el AD: si falla, la lista de conductores viene vacía (el front ofrece "otro") y el login nuevo no es posible (las sesiones abiertas duran `PORTERIA_JWT_EXPIRES`, 12 h).
- **Escrituras:** Portería nunca escribe en tablas de H360 ni de Mantix.

## 4. Autenticación y roles

- `POST /auth/login { usuario, password }`:
  1. `validarCredenciales(usuario, password)` de `src/h360/services/ldap.service.js` (extraída de `autenticarLDAP`, que ahora la usa) valida las credenciales con **un único bind por DN** y devuelve `{ usuario, nombre, email, memberOf }` sin exigir rol de H360. Sus errores llevan `codigo` (`CREDENCIALES_INVALIDAS` o `AD_NO_DISPONIBLE`). La pertenencia a grupos se lee de `memberOf` (solo membresía directa; los grupos anidados no cuentan).
  2. Rol: `LDAP_GROUP_PORTERIA_ADMIN` o `LDAP_GROUP_ADMIN` → `admin_porteria`; si no, `LDAP_GROUP_PORTERIA_GUARDA` → `guarda`; si no, 403.
  3. Responde `{ token, user, sedes }`. El token aún no tiene sede.
- `POST /auth/sede { sede_id }` → nuevo token con `sede_id` (la sede debe estar activa) y **el mismo vencimiento** del token recibido: elegir sede no extiende la sesión.
- Login con dos limitadores que solo cuentan respuestas 401: 10 por usuario+IP y 100 por IP, en ventanas de 15 minutos.
- JWT firmado con `PORTERIA_JWT_SECRET`, `scope: 'porteria'`, expira en `PORTERIA_JWT_EXPIRES` (12h).
- `requiereSede` en todas las rutas operativas. Todo evento queda en la sede del token, nunca la del cuerpo.
- Un admin consulta cualquier sede con `?sede_id=`. Para registrar también elige sede.

| Acción | guarda | admin_porteria |
|---|:-:|:-:|
| Registrar ingreso / salida en su sede | ✔ | ✔ |
| Ver dentro / fuera / movimientos | su sede | todas |
| Corregir / anular (motivo obligatorio, auditado) | solo propios, ≤ 15 min (hora servidor) | ✔ |
| CRUD motivos | — | ✔ |
| Catálogo de vehículos de proveedor | crear | ✔ |
| Reportes y Excel | — | ✔ |

## 5. Motivos

Tabla `por_motivos` como en la spec: `id, codigo UNIQUE, nombre, descripcion, aplica_propio, aplica_proveedor_asistencia, aplica_proveedor, aplica_ingreso, aplica_salida, tipo_referencia ENUM('NINGUNA','ASISTENCIA','EXEQUIA','TEXTO'), referencia_obligatoria, orden, activo, created_at, updated_at, updated_by`.

Los motivos usados se inactivan; el borrado físico solo procede si no tienen eventos (si no, 409).

Seed (todos aplican a ingreso y salida):

| Código | Nombre | Aplica a | Referencia |
|---|---|---|---|
| `SERES_QUERIDOS` | Seres queridos (asistencia) | propio | ASISTENCIA, obligatoria |
| `EXEQUIAS` | Exequias | propio | EXEQUIA, obligatoria |
| `TRASLADOS` | Traslados | propio | TEXTO, obligatoria |
| `RECOGIDA_COFRES` | Recogida de cofres | propio | ninguna |
| `EQUIPOS_VELACION` | Equipos de velación | propio | ninguna |
| `TANQUEO` | Tanqueo | propio | ninguna |
| `LAVADO` | Lavado | propio | ninguna |
| `MANTENIMIENTO` | Mantenimiento | propio | ninguna |
| `SERES_QUERIDOS_TERCERIZADA` | Seres queridos (asistencia tercerizada) | proveedor asistencia | ASISTENCIA, obligatoria |
| `ENTREGA_MERCANCIA` | Entrega de mercancía | proveedor | ninguna |
| `MANTENIMIENTO_SERVICIO` | Mantenimiento / servicio técnico | proveedor | ninguna |
| `OTRO` | Otro | proveedor asistencia, proveedor | TEXTO, obligatoria |

## 6. Modelo de datos

Migraciones `src/porteria/migrations/NNN_nombre.sql`, aplicadas por `scripts/migrador.js` con control en `por_migraciones(nombre PK, aplicada_at)`. Todas las tablas usan el prefijo `por_`, InnoDB y utf8mb4.

**Placa normalizada:** mayúsculas, sin espacios ni guiones (`normalizarPlaca()` en JS). Al cruzar con H360 se normaliza también `vehiculos.placa` en SQL: `UPPER(REPLACE(REPLACE(placa,' ',''),'-',''))`.

**`por_vehiculos_externos`:** `id, placa UNIQUE, tipo ENUM('PROVEEDOR_ASISTENCIA','PROVEEDOR'), empresa, descripcion, activo, created_at, created_by, updated_at, updated_by`. Se rechaza (409) una placa que exista en `vehiculos`.

**`por_eventos`:**
- `id, sede_id, sentido ENUM('INGRESO','SALIDA'), tipo_vehiculo ENUM('PROPIO','PROVEEDOR_ASISTENCIA','PROVEEDOR')`
- `placa, vehiculo_id NULL, vehiculo_externo_id NULL`
- `conductor_usuario NULL, conductor_nombre, conductor_documento NULL, conductor_otro TINYINT`
- `empresa NULL`
- `motivo_id, asistencia_id NULL, exequia_id NULL, referencia_texto NULL, referencia_snapshot JSON NULL`
- `evento_par_id NULL, kilometraje INT NULL, observaciones NULL`
- `inconsistente TINYINT DEFAULT 0, inconsistencia_tipo ENUM('INGRESO_ESTANDO_DENTRO','SALIDA_ESTANDO_FUERA') NULL`
- `registrado_at` (servidor), `registrado_por`
- `corregido_at NULL, corregido_por NULL`
- `anulado TINYINT DEFAULT 0, anulado_por, anulado_at, anulado_motivo`
- Índices: `(sede_id, registrado_at)`, `(placa, registrado_at)`, `(motivo_id)`, `(inconsistente)`.

**`por_estado_vehiculo`:** un registro por placa (no por sede).
`placa PK, tipo_vehiculo, sede_id, dentro TINYINT, ultimo_evento_id, salida_abierta_id NULL, actualizado_at`, índice `(sede_id, dentro)`.
- `dentro = 1` → el vehículo está en `sede_id`.
- `dentro = 0` → está fuera; `sede_id` es la sede por donde salió y `salida_abierta_id` la salida pendiente de cierre.

**`por_auditoria`:** `id, usuario, api_codigo, entidad, entidad_id, accion ENUM('CREAR','CORREGIR','ANULAR','FORZAR'), antes JSON, despues JSON, ip, created_at` (equivalente a `trk_auditoria`, con usuario AD en texto).

**Vista `v_por_movimientos`** (para Superset): evento + nombre de sede + motivo + datos del vehículo. Para los ingresos con par, agrega la duración del viaje (minutos) y los km recorridos (si ambos eventos tienen kilometraje). Excluye los anulados.

## 7. Reglas de registro (`eventos.service`)

`POST /eventos`, en este orden:

1. **Placa y sede:** normaliza la placa. La sede viene del token.
2. **Tipo de vehículo:** si la placa está en `vehiculos` activos → `PROPIO` (se ignora lo que mande el cliente). Si se envía `vehiculo_externo_id`, el tipo sale del catálogo. Si no, el que envíe el guarda; `PROPIO` con una placa que no está en `vehiculos` → 422.
3. **Motivo:** debe estar activo y aplicar al tipo y al sentido (422). Si `referencia_obligatoria`:
   - `ASISTENCIA`: existe y está en `NUEVO` o `ASISTENCIA`.
   - `EXEQUIA`: existe y no está en `REALIZADA` ni `CANCELADA`.
   - `TEXTO`: `referencia_texto` no vacío.
   - Para asistencia o exequia se guarda `referencia_snapshot` (código, nombre del ser querido / tipo, fecha, contrato).
4. **Conductor:**
   - Propio: `conductor_usuario` que esté en la lista del AD (caché), o `conductor_otro = 1` con `conductor_nombre`.
   - Proveedor: `empresa`, `conductor_nombre` y `conductor_documento` obligatorios.
5. **Transacción:**
   1. `SELECT … FROM por_estado_vehiculo WHERE placa = ? FOR UPDATE`. Con REPEATABLE READ, un `FOR UPDATE` sobre una placa sin fila solo toma un *gap lock*, que no serializa dos primeros registros simultáneos. Por eso, si la placa no tiene fila, antes se inserta una fila provisional (`INSERT … ON DUPLICATE KEY UPDATE placa = placa`, marcada como "sin eventos") y luego se bloquea. Un *deadlock* (1213) se reintenta una vez; si persiste, responde 409. Al recalcular el estado se ordena por `registrado_at DESC, id DESC` (DATETIME tiene resolución de segundos).
   2. Coherencia: si no hay fila, la placa se toma como fuera. `INGRESO` con `dentro = 1` o `SALIDA` con `dentro = 0` → **409 `SENTIDO_INCOHERENTE`** con el estado actual (sede, desde cuándo). Con `forzar: true` y `observaciones` no vacías se registra con `inconsistente = 1`, el `inconsistencia_tipo` y auditoría `FORZAR`.
   3. Un `INGRESO` con `salida_abierta_id` se enlaza (`evento_par_id`) con esa salida, sin importar la sede.
   4. Inserta el evento, hace upsert del estado (`dentro`, `sede_id`, `ultimo_evento_id`, `salida_abierta_id` = la salida o NULL) y escribe la auditoría `CREAR`.
6. **Catálogo:** si es proveedor, la placa no está en el catálogo y viene `guardar_en_catalogo: true`, se crea en `por_vehiculos_externos` en la misma transacción.

**Sugerencia (`GET /estado/placa/:placa`):** devuelve tipo (de `vehiculos` o del catálogo), estado actual y sentido sugerido (lo contrario del estado; si no hay estado, `INGRESO` para proveedores y `SALIDA` para propios). Para un propio que está fuera también propone el motivo y la referencia de su salida abierta.

**Corrección (`PATCH /eventos/:id`):** solo cambia motivo, referencia, conductor, kilometraje y observaciones, y revalida las reglas 3–4. No cambia la placa, el sentido, el tipo ni la sede: para eso se anula y se registra de nuevo. Marca `corregido_*` y audita antes/después.

**Anulación (`POST /eventos/:id/anular { motivo }`):** en una transacción con bloqueo de la placa:
- Marca el evento como anulado y quita `evento_par_id` del ingreso que lo apunte (y el propio).
- Recalcula `por_estado_vehiculo` desde el último evento no anulado de la placa. Si no queda ninguno, borra la fila de estado (es tabla derivada, no histórico).
- Audita `ANULAR`.

**Permisos de corrección y anulación:** un guarda solo puede corregir o anular los eventos que él registró, dentro de los 15 minutos de `registrado_at` (hora del servidor). El admin puede cualquiera. Nunca se hace `DELETE` de eventos.

## 8. API `/api/porteria/v1`

```
POST   /auth/login                 { usuario, password } → { token, user, sedes }
POST   /auth/sede                  { sede_id } → { token }
GET    /auth/me
GET    /health                     (sin auth; reporta config y ping a BD)

GET    /catalogos/sedes
GET    /catalogos/vehiculos-propios?q=
GET    /catalogos/conductores                       (AD, caché 10 min; [] si el AD falla)
GET    /catalogos/asistencias?q=                    (NUEVO, ASISTENCIA)
GET    /catalogos/exequias?q=&placa=                (no terminales, fecha ayer..mañana, primero las de la placa)
GET    /catalogos/motivos?tipo_vehiculo=&sentido=   (solo activos)

GET    /vehiculos-externos?q=      POST /vehiculos-externos (guarda, admin)   PATCH /vehiculos-externos/:id (admin)

POST   /eventos                    { sentido, placa, tipo_vehiculo?, vehiculo_externo_id?, conductor..., motivo_id,
                                     asistencia_id?, exequia_id?, referencia_texto?, kilometraje?, observaciones?,
                                     forzar?, guardar_en_catalogo?, empresa? }
GET    /eventos?sede_id=&desde=&hasta=&placa=&tipo_vehiculo=&motivo_id=&inconsistente=&pagina=
                                   (respuesta: { items, total, pagina, por_pagina }; 50 por página)
GET    /eventos/:id
PATCH  /eventos/:id                corrección
POST   /eventos/:id/anular         { motivo }

GET    /estado/dentro?sede_id=
GET    /estado/fuera               propios fuera, con motivo, sede de salida y desde cuándo
GET    /estado/placa/:placa   (no se limita por sede: el viaje de un propio puede cerrar en otra sede)

GET    /admin/motivos   POST /admin/motivos   PATCH /admin/motivos/:id   DELETE /admin/motivos/:id
GET    /admin/reportes/movimientos.xlsx?…mismos filtros que /eventos   (exceljs en streaming)
```

## 9. Frontend (`ebor94/porteriasfn`)

- **Stack:** Vue 3 + Vite + Tailwind + Pinia + Vue Router; axios con `VITE_API_URL`. PWA instalable solo como acceso directo (manifest e íconos, sin caché offline de datos).
- **Interceptores:** 401 → limpia sesión y va al login. 503 → pantalla "Portería no disponible".
- **Diseño para la caseta:** tablet o celular en vertical, botones de al menos 56 px, alto contraste, poco texto, flujo de 3–4 toques.
- **Pantallas del guarda:**
  1. Login AD → elegir sede de turno.
  2. Inicio: *Registrar ingreso* / *Registrar salida*, buscador de placa, contadores "dentro ahora" y "propios fuera".
  3. Asistente de registro: placa (consulta `/estado/placa`, sugiere tipo y sentido) → tipo → conductor (lista AD o "otro"; proveedor: autocompletado desde el catálogo) → motivo filtrado → referencia (asistencias / exequias con búsqueda, o texto) → km y observaciones → confirmar. Un 409 abre el diálogo "Este vehículo figura *dentro* desde las 14:20. ¿Registrar igual?" con observación obligatoria y reenvía con `forzar`.
  4. Vehículos dentro / fuera con acción rápida de registrar desde la fila.
  5. Movimientos del día, con corregir o anular los propios recientes (≤ 15 min).
- **Pantallas del admin:** 6. Motivos. 7. Catálogo de proveedores. 8. Consulta y reportes con filtros, exportación a Excel y marcas de inconsistencia.
- **Stores Pinia:** `auth` (token, rol, sede; persistido en localStorage), `catalogos` (caché 10 min), `eventos`, `estado`, `motivos`.
- **Tests:** Vitest para stores, cliente HTTP y lógica del asistente.

## 10. Configuración

Backend (`.env`):
```
PORTERIA_JWT_SECRET=          # ≥ 32 caracteres, distinto de JWT_SECRET e IDENTIDAD_JWT_SECRET
PORTERIA_JWT_EXPIRES=12h
LDAP_GROUP_PORTERIA_GUARDA=
LDAP_GROUP_PORTERIA_ADMIN=
```
Se agrega el origen del front a `CORS_ORIGIN`. Front: `VITE_API_URL`.

## 11. Pruebas

- **TDD obligatorio.** Unitarias (`npm run test:porteria`): reglas de `eventos.service` con repositorios en memoria y `h360Lectura` y `conductores` simulados; normalización de placa; roles; contrato de error; paridad entre rutas y códigos.
- **Integración** (`npm run test:porteria:int`, `jest.porteria-int.config.js`, `--runInBand`): MySQL 8 de `testing/docker-compose.yml` (`npm run porteria:db:test`). `globalSetup` recrea la base `porteria_test`, carga `src/porteria/testing/sql/h360_minimo.sql` y corre las migraciones. No se usa `mantix_base.sql` de TRK: solo trae `roles` y `usuarios`, y los `CREATE TABLE` de `sedes`, `vehiculos`, `asistencias` y `exequias` no están en el repo. `h360_minimo.sql` define solo las columnas que lee Portería. En la fase 1 se contrasta con `SHOW CREATE TABLE` de la base real. Cubre:
  - Lecturas reales de H360.
  - Transacción con bloqueo: dos ingresos simultáneos de la misma placa → uno pasa y el otro da 409.
  - Recalcular el estado al anular.
  - Viaje entre sedes.
  - La vista `v_por_movimientos`.

## 12. Fases

0. **Base:** esqueleto, `db.js`, migrador, migraciones (esquema + seed de motivos + vista), `entorno`/`verificarEntorno`, `/health`, montaje con 503 y scripts npm.
1. **Auth + catálogos:** `validarCredenciales` / `perteneceAGrupos`, login, sede activa, `h360Lectura`, caché de conductores y endpoints de catálogos.
2. **Eventos:** reglas de §7, estado, corrección, anulación y auditoría.
3. **Front del guarda:** scaffold de `porteriasfn` y pantallas 1–5.
4. **Admin:** motivos, catálogo de proveedores, consulta, Excel y Swagger.
5. **Despliegue:** en `srv-backend` con Mantix, detrás de nginx; build del front; piloto en una sede.

Cada fase cierra con `requesting-code-review` y `verification-before-completion`.
