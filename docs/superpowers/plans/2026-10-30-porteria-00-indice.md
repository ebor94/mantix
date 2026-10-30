# Portería — Índice de planes por fase

**Diseño:** `docs/superpowers/specs/2026-10-29-porteria-design.md`
**Rama:** `feature/porteria` (backend, este repo) · front en `ebor94/porteriasfn`.

Cada fase tiene su propio plan detallado (tareas TDD con código completo). El plan de una fase se escribe
cuando la anterior está cerrada y revisada, sobre el código real que dejó: así las interfaces que consume
son las que existen y no las supuestas. Cada fase termina en software que funciona y se puede probar.

| Fase | Plan | Estado | Entrega |
|---|---|---|---|
| 0 — Base | `2026-10-30-porteria-fase0-base.md` | cerrada (revisión final + correcciones) | Módulo montado, 503 sin configuración, `/health`, esquema + seed + vista, pruebas de integración |
| 1 — Auth + catálogos | `2026-10-30-porteria-fase1-auth-catalogos.md` | listo para ejecutar | Login AD con roles de portería, sede activa, catálogos de H360 |
| 2 — Eventos | por escribir | — | Registro de ingreso/salida con todas las reglas, estado, corrección, anulación, auditoría |
| 3 — Front del guarda | por escribir (repo `porteriasfn`) | — | SPA pantallas 1–5 contra el backend de fases 1–2 |
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
- `utils/placa.js` (`normalizarPlaca`), repositorios `eventos`, `estado`, `motivos`, `vehiculosExternos`, `auditoria` (reciben la conexión de la transacción).
- `services/eventos.service.js`: `registrar`, `corregir`, `anular` con las reglas del diseño §7; `estado.service.js`: `sugerir(placa)`, `dentro(sedeId)`, `fuera()`.
- Rutas `/eventos`, `/estado/*`, `/vehiculos-externos`.
- Helper `conTransaccion(fn)` sobre `bd.obtener().getConnection()`: los repositorios reciben la conexión.
- Bloqueo de la primera placa (diseño §7.5): fila provisional en `por_estado_vehiculo` antes del `FOR UPDATE`. Requiere una migración `004` que permita representar "sin eventos" (p. ej. `ultimo_evento_id` y `sede_id` NULL, `dentro` 0); reintento único ante 1213.
- Integración: concurrencia (dos ingresos simultáneos **de una placa nueva** y de una existente → uno pasa y el otro 409, nunca 500), viaje entre sedes, recalcular estado al anular (orden `registrado_at DESC, id DESC`), ventana de 15 min.

### Fase 3 — Front del guarda (`porteriasfn`)
- Scaffold Vue 3 + Vite + Tailwind + Pinia + Vue Router + Vitest, PWA solo con manifest.
- Cliente axios con interceptores 401/503; stores `auth`, `catalogos`, `estado`, `eventos`.
- Pantallas 1–5 del diseño §9, incluido el diálogo de 409 con `forzar`.

### Fase 4 — Admin
- Backend: `/admin/motivos` (CRUD, inactivar o 409 si tiene eventos), `PATCH /vehiculos-externos/:id`, `GET /eventos` con filtros para admin, `/admin/reportes/movimientos.xlsx` en streaming, Swagger de todas las rutas.
- Front: pantallas 6–8 y store `motivos`.

### Fase 5 — Despliegue
- Variables en `srv-backend`, `npm run porteria:migrate` en producción, origen del front en `CORS_ORIGIN`, sitio nginx del front, grupos AD creados, piloto en una sede con checklist.
