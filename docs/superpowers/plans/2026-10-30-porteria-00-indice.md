# Portería — Índice de planes por fase

**Diseño:** `docs/superpowers/specs/2026-10-29-porteria-design.md`
**Rama:** `feature/porteria` (backend, este repo) · front en `ebor94/porteriasfn`.

Cada fase tiene su propio plan detallado (tareas TDD con código completo). El plan de una fase se escribe
cuando la anterior está cerrada y revisada, sobre el código real que dejó: así las interfaces que consume
son las que existen y no las supuestas. Cada fase termina en software que funciona y se puede probar.

| Fase | Plan | Estado | Entrega |
|---|---|---|---|
| 0 — Base | `2026-10-30-porteria-fase0-base.md` | cerrada (revisión final + correcciones) | Módulo montado, 503 sin configuración, `/health`, esquema + seed + vista, pruebas de integración |
| 1 — Auth + catálogos | `2026-10-30-porteria-fase1-auth-catalogos.md` | cerrada (revisión final + correcciones) | Login AD con roles de portería, sede activa, catálogos de H360 |
| 2 — Eventos | `2026-10-30-porteria-fase2-eventos.md` | cerrada (revisión final + correcciones) | Registro de ingreso/salida con todas las reglas, estado, corrección, anulación, auditoría |
| 2b — Puesta en marcha | `2026-10-30-porteria-fase2b-arranque.md` | cerrada | Siembra de propios por sede, propios fuera para el guarda, salida por otra sede inconsistente |
| 3 — Front del guarda | `2026-10-31-porteria-fase3-front-guarda.md` (repo `porteriasfn`, rama `feature/guarda`) | cerrada (revisión final + correcciones) | SPA pantallas 1–5 contra el backend de fases 1–2 |
| 4 — Admin | por escribir | — | Motivos, catálogo de proveedores, consulta, Excel, Swagger, pantallas 6–8 |
| 5 — Despliegue | por escribir | — | `srv-backend` + nginx, build del front, piloto en una sede |

## Alcance de las fases pendientes (para escribir sus planes)

### Fase 1 — Auth + catálogos
- `src/h360/services/ldap.service.js`: agregar `validarCredenciales(usuario, password)` (bind + datos, sin exigir rol H360) y `perteneceAGrupos(usuario, grupos[])`. Sin cambiar `autenticarLDAP` ni `detectarRoles`; pruebas con el cliente LDAP simulado.
- `services/auth.service.js`: rol por grupo (diseño §4), JWT con `scope:'porteria'`, `sede_id` opcional. Middlewares `porteriaAuth`, `requiereRol`, `requiereSede`.
- Rutas `POST /auth/login` (con limitador propio), `POST /auth/sede`, `GET /auth/me`.
- `services/h360Lectura.service.js`: `listarSedes`, `buscarVehiculoPropioPorPlaca`, `buscarVehiculosPropios(q)`, `buscarAsistencias(q)`, `obtenerAsistencia(id)`, `buscarExequias({q, placa, hoy})`, `obtenerExequia(id)`. Normalización de placa en SQL.
- `services/conductores.service.js`: caché 10 min; `[]` si el AD falla.
- Rutas `/catalogos/*`.
- Primer paso de la fase: contrastar `testing/sql/h360_minimo.sql` con `SHOW CREATE TABLE` de la base real, **incluida la collation** de `vehiculos.placa` (si es `utf8mb4_0900_ai_ci`, comparar con `por_*.placa` falla con error 1267: usar `COLLATE` explícito o igualar). Revisar también `SHOW GRANTS` del usuario `DB_USER` (CREATE VIEW, REFERENCES) y `@@global.time_zone` en serfuweb.
- El limitador de `/auth/login` entra en el mismo cambio que la ruta (el módulo está exento del limitador global).
- `ldap.service.js` lanza `Error` simples: el login debe mapearlos a `PorteriaError` (401 credenciales, 503 AD caído), no dejar que salgan como 500.
- `bd` exportado por `routes/index.js` lanza un error claro si se usa sin configuración válida; los servicios lo usan solo detrás del guardián.

### Fase 2 — Eventos
- Heredado de la revisión de la Fase 1:
  - `requiereSede` solo para escrituras. Para lecturas, helper `sedeEfectiva(req)`: el guarda usa la sede del token; el admin, `?sede_id=` o la de su token (diseño §4).
  - `conductores.existe()` responde `false` también cuando el AD no está disponible o la lista es parcial: el registro no debe rechazar por eso. Si el conductor no está en la lista, 422 con "elige 'otro'", o aceptar el usuario si la lista no es completa (decidir en el plan).
  - Las lecturas de H360 usan el pool, no la conexión de la transacción. Para la validación y el snapshot dentro de `POST /eventos`, permitir pasar una conexión opcional o documentar que se acepta la ventana entre validar e insertar.
  - Validar `asistencia_id` y `exequia_id` como enteros positivos antes de leerlos. Rechazar la placa que normaliza a vacío en `POST /eventos` y en `/estado/placa/:placa`. Usar siempre `.query()` (nunca `.execute()`), por los `IN (?)` con arrays.
  - `obtenerExequiaVigente` usa JOIN con asistencias: una exequia sin asistencia cuenta como inexistente (igual que en H360).
- `utils/placa.js` (`normalizarPlaca`), repositorios `eventos`, `estado`, `motivos`, `vehiculosExternos`, `auditoria` (reciben la conexión de la transacción).
- `services/eventos.service.js`: `registrar`, `corregir`, `anular` con las reglas del diseño §7; `estado.service.js`: `sugerir(placa)`, `dentro(sedeId)`, `fuera()`.
- Rutas `/eventos`, `/estado/*`, `/vehiculos-externos`.
- Helper `conTransaccion(fn)` sobre `bd.obtener().getConnection()`: los repositorios reciben la conexión.
- Bloqueo de la primera placa (diseño §7.5): fila provisional en `por_estado_vehiculo` antes del `FOR UPDATE`. Requiere una migración `004` que permita representar "sin eventos" (p. ej. `ultimo_evento_id` y `sede_id` NULL, `dentro` 0); reintento único ante 1213.
- Integración: concurrencia (dos ingresos simultáneos **de una placa nueva** y de una existente → uno pasa y el otro 409, nunca 500), viaje entre sedes, recalcular estado al anular (orden `registrado_at DESC, id DESC`), ventana de 15 min.

### Fase 3 — Front del guarda (`porteriasfn`)
- Heredado de la revisión de la Fase 2:
  - Diálogo de 409 `SENTIDO_INCOHERENTE`: `errors.estado = { dentro, sede_id, desde, sin_historial }`; `sede_id` y `desde` pueden ser null; `desde` es un instante ISO (UTC). Con `sin_historial` mostrar "Primer registro de esta placa". Reenviar con `forzar: true` y `observaciones` (si no, 422).
  - 409 `OCUPADO` (otro registro de la placa en curso) y `MODIFICADO` (el registro cambió mientras se editaba): mensaje y reintento.
  - "Movimientos del día": la ventana de 15 minutos la decide el servidor; considerar exponer `puede_editar`/`editable_hasta` por ítem en `/eventos` para no depender del reloj de la tablet.
  - Al corregir el conductor, enviar el bloque completo (usuario u "otro" + nombre; proveedor: empresa, nombre y documento): un cambio parcial del conductor responde 422.
  - `sugerir` trae `propuesta` para un propio fuera (motivo, referencia, conductor) y para un proveedor dentro (motivo, empresa, nombre y documento del conductor).
- Decisiones de producto tomadas (Fase 2b): siembra de propios por sede desde H360 (los proveedores arrancan fuera; lo que no cuadre se corrige con la primera inconsistencia); el guarda ve todos los propios fuera; la salida por otra sede es inconsistente (`SALIDA_OTRA_SEDE`, `errors.estado.otra_sede`). En "vehículos dentro" las filas sembradas llegan con `carga_inicial: true`, `id` y `motivo` nulos.
- El interceptor de 503 debe distinguir `motivo`: `PORTERIA_DESHABILITADO` (módulo) vs `DIRECTORIO_NO_DISPONIBLE` (login). El interceptor de 401 no aplica a la respuesta de `/auth/login`.
- Scaffold Vue 3 + Vite + Tailwind + Pinia + Vue Router + Vitest, PWA solo con manifest.
- Cliente axios con interceptores 401/503; stores `auth`, `catalogos`, `estado`, `eventos`.
- Pantallas 1–5 del diseño §9, incluido el diálogo de 409 con `forzar`.

### Fase 4 — Admin
- Heredado de la Fase 3: confirmaciones con un diálogo propio en vez de `window.confirm` (Chrome puede suprimirlo); autocompletar del catálogo de proveedores en el asistente (`catalogos.vehiculosExternos` ya existe); paginar Movimientos; un composable común de carga/error/reintento.
- Idempotencia de `POST /eventos` (clave enviada por el cliente y deduplicada en el backend) para que un reintento tras un corte de red no cree un registro duplicado.
- Auditar los cambios del catálogo de proveedores (alta y PATCH) y la limpieza del par al anular.
- Backend: `/admin/motivos` (CRUD, inactivar o 409 si tiene eventos), `PATCH /vehiculos-externos/:id`, `GET /eventos` con filtros para admin, `/admin/reportes/movimientos.xlsx` en streaming, Swagger de todas las rutas.
- Front: pantallas 6–8 y store `motivos`.

### Fase 5 — Despliegue
- Front: HTTPS obligatorio (sin él no hay service worker ni instalación), fallback de SPA para `/porteria/` y `no-cache` en `index.html`/`sw.js` (ver README de `porteriasfn`); íconos PNG 192/512 para instalar en Android; `npm audit` de dependencias de producción; checklist del piloto: recargar en una ruta profunda, instalar la PWA, recargar en modo avión, backend detenido (502), AD caído en el login, token que vence a mitad de turno.
- Antes del piloto: `npm run porteria:migrate` (hasta 006) **antes de reiniciar el servicio**; luego, por sede, `npm run porteria:sembrar -- --sede <id> --placas … --simular` para revisar y después sin `--simular` (`--todos` siembra todos los propios activos sin estado en esa sede). El comando imprime la base y la sede antes de actuar, nunca pisa un estado existente, se puede repetir y sale con código 2 si una placa pedida no se reconoce. Para deshacer la siembra de una sede (solo filas sin eventos): `DELETE FROM por_estado_vehiculo WHERE sede_id = ? AND ultimo_evento_id IS NULL AND sembrado_at IS NOT NULL`.
- `SELECT VERSION()` en serfuweb: `FOR UPDATE OF` exige MySQL ≥ 8.0.1 (MariaDB y 5.7 lo rechazan; corregir/anular fallarían con 500). Aplicar migraciones 001–004 en orden. El pool (10 conexiones) comparte esperas de bloqueo: revisar `innodb_lock_wait_timeout` frente al timeout de nginx.
- Confirmar que nginx es el único salto (`trust proxy` = 1) y que el puerto de Node no es accesible directo; si no, `req.ip` es falsificable o es el del balanceador. Los limitadores viven en memoria por proceso (se reinician con el servicio). Pendientes de serfuweb: `exequias.fecha` es DATE, collation/charset de las tablas de H360, placas con tabulaciones o espacios no separables.
- Variables en `srv-backend`, `npm run porteria:migrate` en producción, origen del front en `CORS_ORIGIN`, sitio nginx del front, grupos AD creados, piloto en una sede con checklist.
