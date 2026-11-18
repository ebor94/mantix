# Permisos de `/api/sv/personas` — diseño

Fecha: 2026-11-18 · Rama: `fix/permisos-personas` (apilada sobre
`fix/permisos-gestiones`) · Módulo: `sv` (GenFlow / SerVentas)

## Problema

`src/sv/routes/personas.routes.js` monta seis endpoints detrás de `svAuth` y
`svAreaGuard`. El guard arma `req.scope`, pero `personas.controller` no lo usa:

1. `GET /personas/:id/historial-completo` devuelve todas las gestiones
   (comentario, resultado, estado, asesor) de todos los prospectos de una
   persona, en todas las áreas, a cualquier usuario autenticado. El frontend
   solo muestra la pantalla a nivel ≤ 3, pero un ASESOR puede llamarla directo
   y recorrer ids.
2. `GET /personas/:id/prospectos-activos` devuelve los prospectos activos de
   cualquier persona con todas sus columnas (`prosp_nota_inicial`,
   `prosp_sap_contrato_id`, fechas de convenio, prioridad, zona PAP…) y el
   correo del asesor.
3. `GET /personas/:id` devuelve los datos personales completos (documento,
   correo, dirección, fecha de nacimiento) de cualquier persona por id.
4. `PUT /personas/:id` deja modificar esos datos a cualquier usuario
   autenticado.
5. Los seis handlers son `async`. `buscar`, `getOne`, `prospectosActivos` e
   `historialCompleto` no tienen `try/catch`; `create` y `update` lo tienen
   pero terminan en `throw e`. En Express 4 la promesa rechazada no llega al
   middleware de errores y `server.js` hace `process.exit(1)` ante un
   `unhandledRejection`: un error de base de datos tumba el backend.

## Hallazgos que condicionan el diseño

- `prospectos-activos` no es solo de supervisores: `FichaCliente.vue` (ficha
  del prospecto, todos los roles) lo usa para el aviso "este cliente tiene
  prospectos en otras áreas" (`ProspectosCrossArea.vue`). Se llega desde un
  prospecto propio, que puede estar inactivo.
- `/personas/buscar` y el 409 `DUPLICATE_PHONE` de `POST`/`PUT` devuelven la
  misma lista (`personas.service.prospectosActivos`) para el anti-duplicado
  del alta (`NuevoProspecto.vue`, `NuevaEmpresa.vue`).
- Ningún frontend llama `GET /personas/:id` ni `PUT /personas/:id`
  (`personasApi.get` y `personasApi.update` no tienen usos).
- Los consumidores de la lista de prospectos usan, del prospecto: `prosp_id`,
  `prosp_area_id`, `prosp_subproceso`, `prosp_prox_gestion_fecha`,
  `prosp_prox_gestion_hora`, `prosp_updated_at`; y de las asociaciones: área
  (código, nombre, color, icono), grupo (nombre), estado (nombre, color),
  asesor (nombre, apellido) y empresa (razón social). Nadie usa `usr_email`,
  fuente, NIT ni las demás columnas del prospecto.
- Otros servicios (`fidelizacion`, `listas`, `pap`, `eventoPool`) solo usan
  `personas.crear` y `personas.buscarPorTelefono`: el recorte de campos no los
  afecta.
- `fueraDeAlcance(user, scope, prospecto)` (`src/sv/utils/alcanceProspecto.js`)
  y el `errorHandler` global de `src/app.js` existen en
  `fix/permisos-gestiones`, base de esta rama.

## Decisiones tomadas con el usuario

- Partir de `fix/permisos-gestiones` (rama apilada).
- Historial: vista 360° solo con relación. Cross-área (SUPER_ADMIN,
  GERENTE_GENERAL, DIRECTOR_COMERCIAL) ve todo. Nivel 2-3 (ADMIN_AREA,
  JEFE_PAP, SUPERVISOR, COORDINADOR_PREVISION) ve el historial cross-área
  completo solo si al menos un prospecto de esa persona está en su alcance.
  ASESOR y AGENTE_SVC → 403.
- `prospectos-activos`: se mantiene el aviso cross-área para todos los roles,
  con los campos recortados a lo que pinta la tarjeta, y exige relación.
  `buscar` y el 409 no exigen relación pero devuelven la lista recortada.
- `GET` y `PUT /personas/:id` exigen relación.
- GERENTE_GENERAL y DIRECTOR_COMERCIAL siguen sin restricción (decisión de
  `fix/permisos-gestiones`).
- Enfoque A: función pura + middleware de ruta en el controlador + carga
  liviana en el servicio.

## Diseño

### 1. Relación con la persona: `src/sv/utils/alcancePersona.js`

```js
fueraDeAlcancePersona(user, scope, prospectos) // → null | string
```

Función pura, sin base de datos:

- `scope.crossArea` → `null`.
- Algún prospecto con `fueraDeAlcance(user, scope, p) === null` → `null`.
- Si no (incluida la lista vacía) → `'Sin prospectos de esta persona en tu alcance'`.

Reutiliza `fueraDeAlcance` tal cual: la regla sigue siendo única.

### 2. Carga liviana: `personas.service.alcancesDePersona(personaId)`

```js
SvProspecto.findAll({
  where: { [Op.or]: [{ prosp_persona_id: id }, { prosp_contacto_empresa_id: id }] },
  attributes: ['prosp_id', 'prosp_asesor_id', 'prosp_grupo_id', 'prosp_area_id']
})
```

Sin filtro por `prosp_activo`: un asesor que abre la ficha de su prospecto
cerrado conserva el aviso cross-área.

### 3. Middleware `exigirRelacion` (en `personas.controller`)

Se aplica en `personas.routes.js` a `GET /:id`, `PUT /:id` (antes de
`validate`), `GET /:id/prospectos-activos` y `GET /:id/historial-completo`.
Orden:

1. `req.params.id` no es entero positivo → 404 `NOT_FOUND`
   `'Persona no encontrada'`.
2. `req.scope.crossArea` → `next()` sin consultar la base.
3. `alcancesDePersona(id)` → `fueraDeAlcancePersona(...)`. Con motivo → 403
   `FORBIDDEN` con ese mensaje. Una persona inexistente no tiene prospectos y
   también responde 403: para quien no es cross-área, el código no revela qué
   ids existen.
4. Error en la consulta → `next(e)`.

El middleware deja el id ya convertido en `req.personaId` para los handlers.

`historial-completo` lleva antes un segundo middleware, `soloSupervision`:
`req.scope.nivel > NIVELES.SUPERVISOR` (3) → 403 `FORBIDDEN`
`'Solo supervisores o superiores'`, sin consultar la base. `svAreaGuard`
asigna nivel 4 cuando el rol no trae `rol_nivel`, así que falla cerrado.

Rutas resultantes:

```js
router.get ('/buscar',                 validate(v.personas.buscar, 'query'), ctrl.buscar);
router.get ('/:id',                    ctrl.exigirRelacion, ctrl.getOne);
router.get ('/:id/prospectos-activos', ctrl.exigirRelacion, ctrl.prospectosActivos);
router.get ('/:id/historial-completo', ctrl.soloSupervision, ctrl.exigirRelacion, ctrl.historialCompleto);
router.post('/',                       validate(v.personas.create), ctrl.create);
router.put ('/:id',                    ctrl.exigirRelacion, validate(v.personas.update), ctrl.update);
```

### 4. Recorte de campos en `personas.service.prospectosActivos`

- Prospecto: `prosp_id`, `prosp_area_id`, `prosp_grupo_id`, `prosp_estado_id`,
  `prosp_asesor_id`, `prosp_empresa_id`, `prosp_subproceso`,
  `prosp_prox_gestion_fecha`, `prosp_prox_gestion_hora`, `prosp_updated_at`.
- Área, grupo y estado: sin cambios.
- Asesor: `usr_id`, `usr_nombre`, `usr_apellido` (sale `usr_email`).
- Empresa: `empresa_id`, `empresa_razon_social` (sale `empresa_nit`).
- Fuente: sale el `include`.

Se aplica a todo lo que usa la función: `buscar`, `prospectos-activos`, la
lista `prospectos` de `historial-completo` y el 409 `DUPLICATE_PHONE`. Las
gestiones de `historial-completo` no cambian: quien pasa los dos middlewares
ve la vista 360° completa.

### 5. Errores

Los seis handlers quedan con `try/catch` → `return next(e)`. En `create` y
`update` el `throw e` final pasa a `return next(e)`; los 404, 409 y 422 se
mantienen. Los handlers usan `req.personaId` en vez de
`parseInt(req.params.id)` donde el middleware ya corrió.

### 6. Sin cambios

- `buscar` y `POST /personas` no exigen relación.
- `historialCompleto` conserva su selección de prospectos (ver seguimientos).

## Pruebas

Solo `jest.mock` y supertest; nunca `sequelize.sync` (la única base es la de
producción compartida). Mismo patrón que `tests/gestiones.routes.test.js`:
`svAreaGuard` real, servicios y modelos simulados, `errorHandler` de prueba
que responde 500.

- `tests/alcancePersona.test.js` (función pura): crossArea con lista vacía;
  asesor con un prospecto propio entre ajenos; asesor solo con ajenos;
  supervisor dentro y fuera de su grupo; ADMIN_AREA dentro y fuera de su área;
  JEFE_PAP sobre PAP; lista vacía sin crossArea; rol sin alcance.
- `tests/personas.routes.test.js`:
  - `GET /:id`, `GET /:id/prospectos-activos`, `PUT /:id`: asesor con
    prospecto propio → 200; asesor sin él → 403 y el servicio de datos no se
    llama; supervisor con prospecto en su grupo → 200; supervisor solo con
    prospectos de otro grupo → 403; GERENTE_GENERAL → 200 sin llamar
    `alcancesDePersona`; id no numérico → 404.
  - `GET /:id/historial-completo`: asesor con prospecto propio → 403 sin
    llamar `alcancesDePersona`; supervisor dentro → 200; supervisor fuera →
    403; ADMIN_AREA dentro de su área → 200; GERENTE_GENERAL con persona
    inexistente → 404.
  - `PUT /:id` con `DUPLICATE_PHONE` → 409 con `prospectos_activos`.
  - Error del servicio → 500 (vía `next(e)`) en las seis rutas, también en el
    middleware.
- `tests/personas.service.test.js`: `prospectosActivos` pide los atributos
  recortados (asesor sin `usr_email`, empresa sin `empresa_nit`, sin fuente);
  `alcancesDePersona` consulta titular o contacto, sin `prosp_activo`, con los
  4 atributos.
- Suite completa sin fallas nuevas más allá de las 5 conocidas
  (`test/grupoIndivII`, `tests/invitacion.service`,
  `src/masajes/__tests__/adapters` ×2, `tests/afiliadoEmpresaAccess`).

## Antes de desplegar

- Cambio visible esperado: un supervisor, ADMIN_AREA o JEFE_PAP que abra
  "Ver historial cross-área" de una persona sin prospectos en su alcance
  recibe 403. Desde la UI solo se llega desde la ficha de un prospecto que el
  usuario ya puede ver (con `getOne` cerrado en `fix/permisos-gestiones`), así
  que no debería ocurrir en uso normal.
- Esta rama contiene `fix/permisos-gestiones`: se mergea después de ella o
  junto con ella.

## Fuera de alcance (seguimientos)

- `historialCompleto` solo toma las gestiones de los prospectos activos cuando
  la persona tiene alguno activo; las de sus prospectos inactivos desaparecen
  del "historial completo". Bug previo, cambia lo que se muestra.
- `GET /personas/buscar` entrega la persona completa (documento, dirección,
  fecha de nacimiento) a cualquier usuario que conozca el teléfono. Es parte
  del anti-duplicado del alta; recortarlo exige revisar qué precarga
  `NuevoProspecto.vue`.
- Los demás seguimientos de `fix/permisos-gestiones` siguen abiertos.
