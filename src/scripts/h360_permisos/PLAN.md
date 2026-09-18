# Gestión de permisos H360 — plan por fases

Sacar la matriz de permisos del código y llevarla a una tabla administrable
desde UI, para que cambiar un permiso deje de requerir editar código +
`deploy-mantix` + rebuild del frontend.

| Fase | Estado | Commit |
|---|---|---|
| 1 — Modelo de datos + seed verificado | ✅ **COMPLETA** | `02c7489` |
| 2 — Backend: `requirePermiso` + cache | ⬜ pendiente | — |
| 3 — UI de administración + frontend `can()` | ⬜ pendiente | — |
| 4 — Limpieza de constantes | ⬜ pendiente | — |

---

## Contexto: por qué

Inventario del **2026-09-17**, cuando se decidió el refactor:

| Capa | Ubicación | Cantidad |
|---|---|---|
| Backend | `requireRol(...)` en 10 archivos de routes | **49** |
| | `ESTADOS_POR_ROL`, `ETAPAS_POR_ROL`, `ETAPAS_PARA_CERRAR`, `TRANSICIONES` (asistencias.controller.js) | 4 matrices |
| | `ROLE_MAP` en ldap.service.js (depende de `.env`) | 1 |
| Frontend | `meta.roles` en router/index.js | **19** |
| | `puedeVer([...])` en MainLayout.vue | **11** |
| | `FORMULARIO_POR_ROL`, `ADMIN_CONFIG_POR_ESTADO`, `ASESOR_CONFIG_POR_ESTADO`, `ROLES_QUE_AVANZAN`, `ROLES_VER_*` (AsistenciaDetalleView.vue) | 5 matrices |
| | `includes(auth.rol)` inline en 14 archivos | **24** |

≈110 puntos de decisión en ~25 archivos, **con la matriz duplicada entre
backend y frontend**. Esa duplicación causó bugs reales (F-03 duplicado al
coordinador, botón "Asignar vehículo" bloqueado, Cesar sin ver H360-2026-0007).

---

## Principio de diseño (no re-litigar)

> **Un permiso responde "¿este rol puede?" — una regla de proceso responde "¿el caso está listo?"**

| Va a DB (admin lo edita) | Queda en código (intocable desde UI) |
|---|---|
| ¿Quién ve el módulo Exequias? | Para cerrar ENCUENTRO se exige F-05 completa |
| ¿Quién edita F-05? | ENCOFRADO → ENCUENTRO → SALA → APROBACION |
| ¿Quién avanza de ENCUENTRO a SALA? | Si F-07 está pendiente, no se cierra F-05 |

**`ETAPAS_PARA_CERRAR` NO va a la tabla de permisos.** Se parte en dos:
- *quién* puede cerrar → permiso `estado.X.cerrar` (DB)
- *qué se exige* para cerrar → `REQUISITOS_CIERRE` indexado por estado (código)

Verificado en fase 1: los requisitos son **idénticos para todos los roles**, así
que la separación no pierde información:

```
ASISTENCIA    -> F02_INVENTARIO_CUERPO + F03_INVENTARIO_RETOQUE
PRESERVACION  -> F04_TANATOPRAXIA
ENCOFRADO     -> F06_ENCOFRADO
ENCUENTRO     -> F05_ENTREGA
SALA          -> (ninguno)
APROBACION    -> (ninguno)
```

---

## Fase 1 — COMPLETA ✅

### Tablas creadas (producción, `serfuweb` @ 192.9.17.30)

```
h360_roles              id, codigo, nombre, ldap_group, activo, es_sistema
h360_permisos           id, clave, modulo, descripcion, activo
h360_rol_permisos       rol_id, permiso_id            (PK compuesta, FK CASCADE)
h360_permiso_auditoria  rol_codigo, permiso, accion, usuario_id, created_at
```

> ⚠️ **El prefijo `h360_` es obligatorio.** La base ya tiene una tabla `roles`
> del core de Mantix (15 filas, esquema propio con columna `permisos` JSON para
> afiliaciones/mantenimientos). Un primer intento sin prefijo estuvo a punto de
> insertarle 9 filas basura; solo lo frenó un fallo de FK. **No tocar `roles`,
> `permisos` ni `rol_permisos` sin prefijo.**

### Datos cargados

**68 permisos · 9 roles · 258 asignaciones**

| Rol | Permisos |
|---|---:|
| admin | 68 |
| coordinador | 46 |
| supervisora | 38 |
| asesor | 30 |
| asistente_tanatologo | 24 |
| asistente | 15 |
| tanatologo | 15 |
| contabilidad | 14 |
| recepcion | 8 |

### Nomenclatura de claves

Catálogo plano con clave compuesta; la UI agrupa por el primer segmento.

```
ruta.exequias.ver               accion.exequias.crear
ruta.vehiculos.ver              accion.exequias.confirmar
                                accion.exequias.asignar_vehiculo
etapa.F05_ENTREGA.editar        estado.ENCUENTRO.avanzar
                                estado.ENCUENTRO.cerrar
```

### Scripts (pipeline reproducible)

Credenciales vía `.env` — ninguno tiene datos sensibles hardcodeados.

```bash
node src/scripts/h360_permisos/extraer.js     # código  -> catalogo.json
node src/scripts/h360_permisos/seed.js        # catalogo.json -> DB (idempotente)
node src/scripts/h360_permisos/verificar.js   # test de equivalencia (exit 1 si difiere)
```

`verificar.js` **no parsea texto**: monta los 59 endpoints reales de Express con
`requireRol` instrumentado y compara las 612 celdas de la matriz.

```
Endpoints Express montados : 59
Celdas comparadas          : 612
Diferencias                : 0   -> IDÉNTICO
```

**Correr `verificar.js` antes de cada fase siguiente** — es el guardia que
detecta si el seed se desalineó del código.

---

## Fase 2 — Backend: `requirePermiso` + cache

**Objetivo:** que el backend decida por permiso en vez de por rol, sin cambiar
ningún comportamiento observable.

### Trabajo

1. **Servicio de permisos** (`src/h360/services/permisos.service.js`)
   - Carga `rol -> Set<clave>` en memoria al arrancar.
   - `tienePermiso(rol, clave)` resuelve desde el cache.
   - `recargar()` para invalidar tras un cambio.

2. **Nuevo middleware** `requirePermiso('accion.exequias.crear')`
   - Convive con `requireRol` durante la transición.
   - **Fallback:** si la clave no existe en DB, cae a la lista de roles
     hardcodeada y **loguea un aviso**. Así un permiso olvidado no rompe
     producción.

3. **Migrar los 49 `requireRol`** de los 10 routes a `requirePermiso`.

4. **Migrar las matrices del controller** (`ETAPAS_POR_ROL`, `TRANSICIONES`,
   la parte de rol de `ETAPAS_PARA_CERRAR`) a consultas al servicio.
   `REQUISITOS_CIERRE` se queda como constante, indexado por estado.

5. **Endpoint** `GET /api/h360/auth/permisos` — devuelve las claves del usuario
   autenticado. Lo consume el frontend en fase 3.

### Decisiones ya tomadas

- **Cache en memoria simple.** `pm2 list` confirma que `mantix-backend` corre en
  modo **fork** (instancia única, no cluster) → invalidar en memoria basta. No
  hace falta TTL ni pub/sub.
  **Si algún día pasa a cluster, esto se rompe** y habrá que añadir un flag de
  versión en DB o TTL corto.
- **El JWT no lleva permisos.** Sigue con `{usuario, nombre, email, rol}`. Los
  permisos se resuelven server-side por request → un cambio aplica al instante,
  sin re-login. Meterlos en el token obligaría a re-loguear.
- **Fail-safe:** `admin` con bypass hardcodeado que nunca consulta DB. Si la
  carga del cache falla, se mantiene el último snapshot bueno; si no hay
  ninguno, modo degradado solo-admin. **Nunca "abrir todo".**

### Limpieza incluida

`src/h360/controllers/asistencias.controller.js:3` importa `PERMISOS_ABIERTOS`
de `middleware/auth`, **pero esa constante ya no existe allí** — import muerto
que evalúa a `undefined`, residuo de un intento anterior. Eliminar.

### Criterio de aceptación

`verificar.js` sigue en 0 diferencias y el sistema se comporta igual.
Desplegable sin que nadie note nada.

---

## Fase 3 — UI de administración + frontend `can()`

### Backend

- `GET    /api/h360/admin/roles`
- `POST   /api/h360/admin/roles`               (crear rol + `ldap_group`)
- `PATCH  /api/h360/admin/roles/:id`
- `GET    /api/h360/admin/permisos`            (catálogo agrupado por módulo)
- `PUT    /api/h360/admin/roles/:id/permisos`  (guardar matriz + auditoría + `recargar()`)

Todo bajo `requirePermiso('accion.admin.permisos')`, solo admin.

### Frontend

- `stores/permisos.js` — carga desde `GET /auth/permisos` al login.
- Helper `can('accion.exequias.crear')` para `v-if`, `:disabled` y guard del router.
- **Migrar** los 19 `meta.roles` + 11 `puedeVer` + 24 `includes(auth.rol)`.
  Esto **elimina la duplicación backend↔frontend**, que es la causa raíz de los
  bugs históricos.

### Vista `/admin/permisos`

Matriz **rol × permiso** con checkboxes, agrupada por módulo y colapsable:

```
                          asesor  asist.  tanat.  superv.  coord.  recep.  contab.
▼ EXEQUIAS
  ruta.exequias.ver          ☑      ☐       ☐       ☑        ☑       ☑       ☑
  accion.exequias.crear      ☑      ☐       ☐       ☐        ☑       ☐       ☐
  accion.exequias.confirmar  ☑      ☐       ☐       ☐        ☐       ☑       ☐
▼ ETAPAS
  etapa.F05_ENTREGA.editar   ☑      ☐       ☐       ☑        ☐       ☐       ☐
```

La columna `admin` se muestra marcada y **en solo-lectura**, para que nadie se
deje a sí mismo fuera.

### Vista `/admin/roles`

Crear roles y mapear su grupo AD. **Resuelve el dolor de `Recepcion_360`:**
crear un rol dejará de requerir editar `.env` + `pm2 restart`.

> Pendiente al poblar `ldap_group`: el `.env` local tenía
> `LDAP_GROUP_ASIST_TANATOLOGO=LDAP_GROUP_ASIST_TANATOLOGO` (el valor es el
> nombre de la variable). En producción debe estar correcto porque el rol
> funciona — verificar contra el `.env` del servidor, no contra la copia local.
> Por eso ese rol quedó con `ldap_group = NULL` en el seed.

---

## Fase 4 — Limpieza

- Eliminar `requireRol` y el fallback del middleware.
- Eliminar las 4 matrices del controller y las 5 del `AsistenciaDetalleView`.
- Eliminar `ROLE_MAP` de `ldap.service.js` → leer `h360_roles.ldap_group`.
- Retirar del `.env` las variables `LDAP_GROUP_*`.
- `verificar.js` deja de tener sentido (ya no hay código con qué comparar):
  archivarlo o reconvertirlo en un smoke test de la matriz.

---

## Riesgos abiertos

| Riesgo | Mitigación |
|---|---|
| `mantix-backend` pasa a modo cluster | Hoy es fork. Si cambia, el cache en memoria se desincroniza → añadir TTL 30s o flag de versión en DB |
| Admin se deja fuera desde la UI | Bypass hardcodeado de `admin` + columna solo-lectura en la matriz |
| Un permiso olvidado rompe un endpoint | Fallback a rol en fase 2 + log de aviso; `verificar.js` como guardia |
| Sobreingeniería para 9 roles | Justificado: ~15 cambios de permisos solo en la semana del 15-17 sept, cada uno con deploy completo |

## Esfuerzo estimado

| Fase | Estimado |
|---|---|
| 1 | ✅ hecha |
| 2 | ~1 sesión |
| 3 | ~2 sesiones |
| 4 | ~media sesión |

---

## Para retomar

```bash
cd ~/apps/mantix/mantix-backend
node src/scripts/h360_permisos/verificar.js   # debe dar 0 diferencias
```

Si da 0 → el seed sigue alineado, arrancar fase 2.
Si da >0 → el código cambió desde el 2026-09-17; correr `extraer.js` y `seed.js`
de nuevo, revisar el diff, y recién entonces continuar.
