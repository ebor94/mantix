# Permisos de `/api/sv/gestiones` — diseño

Fecha: 2026-11-18 · Rama: `fix/permisos-gestiones` · Módulo: `sv` (GenFlow / SerVentas)

## Problema

`src/sv/routes/gestiones.routes.js` monta tres endpoints detrás de `svAuth` y
`svAreaGuard`. El guard arma `req.scope`, pero el controlador
`src/sv/controllers/gestiones.controller.js` no lo usa:

1. `POST /api/sv/gestiones` no verifica que `gest_prosp_id` esté en el alcance
   del usuario. Un ASESOR puede registrar gestiones, y con ellas cambiar el
   estado o la próxima gestión, sobre el cliente de otro asesor o de otra área.
2. El esquema `gestiones.create` acepta `gest_asesor_id` y
   `gestiones.service.crear` lo usa (`payload.gest_asesor_id || asesorId`).
   Cualquiera puede atribuir una gestión a otro asesor, y
   `reportes.service.js` cuenta gestiones por `gest_asesor_id`.
3. `GET /api/sv/gestiones?prosp_id=` devuelve el historial de cualquier
   prospecto.
4. `GET /api/sv/gestiones/resumen-dia?asesor_id=` devuelve el resumen del día
   de cualquier asesor.
5. `create`, `list` y `resumenDia` son `async` sin `try/catch`. En Express 4 la
   promesa rechazada no llega al middleware de errores y `server.js` hace
   `process.exit(1)` ante un `unhandledRejection`: un error de base de datos
   tumba el backend.

## Hallazgos que condicionan el diseño

- El frontend (`crm-frontend/src`) nunca envía `gest_asesor_id`:
  `RegistrarGestion.vue`, `NuevaGestionPapModal.vue` y `KanbanPipeline.vue`
  arman el payload sin él. El único llamador interno de `gestiones.crear`
  (`propuestas.service.js`) tampoco lo envía. No existe el caso de un
  supervisor que registre a nombre de un asesor.
- El frontend llama `resumen-dia` sin `asesor_id` (`PanelDia.vue`,
  `PanelSvc.vue`).
- `validate()` usa `stripUnknown: true`: un campo que sale del esquema se
  descarta en silencio, sin 422.
- Las colas SVC sin asignar (`prosp_asesor_id = null`, creadas por
  `recuperacionAuto.service`) las atiende el supervisor del grupo; el
  AGENTE_SVC trabaja prospectos ya asignados.
- `src/app.js` tiene un `errorHandler` global: `next(e)` produce una respuesta
  500 en vez de un rechazo sin manejar.

## Decisiones tomadas con el usuario

- `resumen-dia` se cierra en esta misma rama.
- GERENTE_GENERAL y DIRECTOR_COMERCIAL (cross-área) conservan la regla actual
  de `getOne`: sin restricción. Limitarlos por `sv_org_usuario_areas` es un
  seguimiento aparte para todo el módulo.
- Enfoque A: helper puro + verificación en el controlador (no middleware, no
  verificación dentro del servicio).

## Diseño

### 1. Regla de alcance: `src/sv/utils/alcanceProspecto.js`

```js
fueraDeAlcance(user, scope, prospecto) // → null | string (mensaje del 403)
```

Función pura, sin base de datos. Evalúa en orden y se detiene en la primera
rama que aplica:

| # | Condición del scope | Roles | Acceso si… | Mensaje si no |
|---|---|---|---|---|
| 1 | `crossArea` | SUPER_ADMIN, GERENTE_GENERAL, DIRECTOR_COMERCIAL | siempre | — |
| 2 | `asesorId` | ASESOR, AGENTE_SVC | `prosp_asesor_id === asesorId` | `Fuera de tu alcance` |
| 3 | `grupoId` | SUPERVISOR, COORDINADOR_PREVISION, JEFE_PAP | `prosp_grupo_id ∈ grupoIdsAccesibles(user) ∪ {scope.grupoId}` | `Fuera de tu grupo` |
| 4 | `areaId` | ADMIN_AREA | `prosp_area_id ∈ areaIdsAccesibles(user) ∪ {scope.areaId}` | `Fuera de tu área` |
| 5 | ninguna | rol desconocido, ADMIN_AREA sin área | nunca (falla cerrado) | `Sin alcance definido` |

Las comparaciones de ids se hacen con `Number(...)` para no depender de si
Sequelize o el token entregan número o texto.

`prospectos.controller.getOne` pasa a usar el helper. Diferencias deliberadas
frente al comportamiento actual de `getOne`:

- **JEFE_PAP**: hoy se valida contra `grupoIdsAccesibles(user)`, que usa su
  `usr_grupo_id`, y no contra el grupo PAP fijo que le asigna `svAreaGuard`.
  La unión con `scope.grupoId` le garantiza el acceso a PAP.
- **Sin alcance**: hoy un usuario sin `areaId`/`grupoId`/`asesorId` ni
  `crossArea` ve cualquier prospecto; pasa a recibir 403.

Los mensajes del 403 de `getOne` no cambian.

### 2. Carga liviana del prospecto

`prospectos.service.obtenerAlcance(id)`:

```js
SvProspecto.findByPk(id, {
  attributes: ['prosp_id', 'prosp_asesor_id', 'prosp_grupo_id', 'prosp_area_id']
})
```

Sin `include`. `getOne` sigue usando `obtenerCompleto`, porque devuelve la
ficha completa.

### 3. Controlador de gestiones

Helper local `prospectoVisible(req, res, prospId)`:

1. `prospectos.obtenerAlcance(prospId)`; si no existe → `fail 404 NOT_FOUND
   'Prospecto no encontrado'` y devuelve `null`.
2. `fueraDeAlcance(req.user, req.scope, p)`; si hay mensaje → `fail 403
   FORBIDDEN <mensaje>` y devuelve `null`.
3. Devuelve el prospecto.

Handlers, todos con `try { … } catch (e) { next(e); }`:

- **`create`**: `prospectoVisible(req, res, req.body.gest_prosp_id)`; si pasa,
  `gestiones.crear(req.body, req.user.usr_id)` → 201.
- **`list`**: `prospectoVisible(req, res, prosp_id)`; si pasa,
  `gestiones.historial(...)` → 200. Un `prosp_id` inexistente pasa de lista
  vacía a 404 (`FichaCliente` carga antes el prospecto con `getOne`, no le
  afecta).
- **`resumenDia`**:
  - `scope.asesorId` presente (ASESOR, AGENTE_SVC): se ignora `asesor_id`; se
    usa `req.user.usr_id` (mismo criterio que `aplicarFiltroAsesor` en
    prospectos).
  - Resto: sin `asesor_id` o igual al propio → el propio. Con otro id →
    `usuariosAccesibles(req.user)`: `null` (SUPER_ADMIN) o lista que lo
    incluye → acceso; si no → `fail 403 FORBIDDEN 'Fuera de tu alcance'`.

### 4. `gest_asesor_id`

- Sale del esquema `gestiones.create` en `crm.validation.js`. Con
  `stripUnknown`, un cliente que lo siga enviando no recibe 422; el campo se
  descarta.
- `gestiones.service.crear` deja de leer `payload.gest_asesor_id`:
  `gest_asesor_id` es siempre el `asesorId` que recibe la función (el usuario
  autenticado desde la ruta, o el asesor que pasa `propuestas.service`).
- Consecuencia: si un supervisor registra una gestión sobre el cliente de un
  asesor, queda a nombre del supervisor, que es quien la hizo; los reportes
  por asesor no se inflan.

### 5. Errores

| Situación | Respuesta |
|---|---|
| Prospecto inexistente (`create`, `list`) | 404 `NOT_FOUND` |
| Prospecto fuera de alcance (`create`, `list`) | 403 `FORBIDDEN` + mensaje del helper |
| `asesor_id` fuera de alcance (`resumenDia`) | 403 `FORBIDDEN` `Fuera de tu alcance` |
| Datos inválidos | 422 (sin cambios, `validate`) |
| Error del servicio o de la base | `next(e)` → 500 del `errorHandler` global; el proceso sigue vivo |

## Pruebas

Jest + `supertest` + `jest.mock`. Sin conexión a base de datos y sin
`sequelize.sync` (la única base es la de producción compartida).

1. **`tests/alcanceProspecto.test.js`** — unitarias del helper:
   ASESOR propio / ajeno / ajeno dentro de un grupo de `gruposExtra`;
   SUPERVISOR en su grupo / en un grupo de `gruposExtra` / en otro grupo;
   JEFE_PAP con `usr_grupo_id` distinto sobre un prospecto PAP; ADMIN_AREA
   dentro / fuera / en un área de `areasExtra`; SUPER_ADMIN,
   GERENTE_GENERAL y DIRECTOR_COMERCIAL; rol desconocido y ADMIN_AREA sin área.
2. **`tests/gestiones.routes.test.js`** — router real detrás del
   `svAreaGuard` real; mocks de `prospectos.service.obtenerAlcance`,
   `gestiones.service` y `SvUsuario.findAll`:
   - POST asesor sobre su prospecto → 201, `crear(…, usr_id del autenticado)`.
   - POST asesor sobre prospecto ajeno → 403, `crear` no se llama.
   - POST supervisor dentro de su grupo → 201; fuera → 403.
   - POST con `gest_asesor_id` ajeno → 201, el payload que recibe `crear` no
     trae `gest_asesor_id` y el autor es el autenticado.
   - POST sobre prospecto inexistente → 404.
   - GET historial propio → 200; ajeno → 403 y `historial` no se llama.
   - `resumen-dia`: asesor con `asesor_id` ajeno → su propio resumen;
     supervisor con asesor de su grupo → 200; fuera de su grupo → 403.
   - Error del servicio en `create`, `list` y `resumenDia` → 500 vía
     `next(e)`, y un listener de `unhandledRejection` instalado en la prueba
     no se dispara.
3. **`tests/gestiones.service.test.js`** — `crear({ gest_asesor_id: 99, … }, 7)`
   llama a `SvGestion.create` con `gest_asesor_id: 7` (mocks de modelos,
   `sequelize.transaction` y `recuperacionAuto`).
4. **`tests/prospectosGetOne.test.js`** — regresión de `getOne` con el helper:
   asesor ajeno → 403; JEFE_PAP sobre PAP → 200; inexistente → 404.

Criterio de cierre: la suite completa solo falla en las cinco suites que ya
fallaban antes (`test/grupoIndivII`, `tests/invitacion.service`, las dos de
`src/masajes/__tests__/adapters` y `tests/afiliadoEmpresaAccess`).

## Fuera de alcance (seguimientos)

- `prospectos.controller.update` y `actualizarProductos` solo verifican al
  asesor: un supervisor puede modificar prospectos de otro grupo. Usar el
  helper ahí cambia su comportamiento y va en otra rama.
- Restringir GERENTE_GENERAL / DIRECTOR_COMERCIAL a sus áreas de
  `sv_org_usuario_areas` en todo el módulo (listados, ficha y gestiones).
- `gest_estado_nuevo_id` no se valida contra los estados del grupo del
  prospecto.

## Restricciones de trabajo

- Worktree propio en `mantix-backend/.worktrees/fix-permisos-gestiones`, rama
  `fix/permisos-gestiones`; `main` no se toca. Sin push ni despliegue salvo
  pedido del usuario.
