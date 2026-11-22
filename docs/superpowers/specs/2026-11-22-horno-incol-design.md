# Módulo Horno INCOL — monitoreo, gráficas y descarga de registros

Fecha: 2026-11-22 · Estado: aprobado

## Contexto

El horno incinerador de INCOL registra sus lecturas así: HMI Delta → eServer (ODBC) → MySQL 5.0 local
(PC HORNO-INCOL) → copia cada minuto (`sync_horno.ps1`) → MySQL 8.0.46 central `192.9.17.30`, base `horno`.
Superset se lanzará más adelante; mientras tanto se necesita una aplicación propia para ver los datos en
vivo, graficarlos y descargarlos en Excel.

Tabla de origen `horno.lecturas` (ya existe):

| Columna | Tipo | Nota |
|---|---|---|
| equipo | VARCHAR(30) | hoy siempre `HORNO-INCOL` |
| id_local | INT UNSIGNED | PK (equipo, id_local) |
| fecha_hmi | DATETIME NULL | hora que envía eServer |
| registrado_en | DATETIME | hora en que se guardó en el PC; **columna de tiempo de referencia** |
| temp_combustion, temp_postcombustion, temp_chimenea, co | DECIMAL(7,1) | °C / ppm |
| oxigeno | DECIMAL(6,2) | % |
| co_mg_m3 | DECIMAL(7,3) | mg/m³ |
| ccr, ccr_o2_ref | DECIMAL(6,1) | |
| copiado_en | TIMESTAMP | hora de llegada al central |

Ritmo actual: una fila cada ~4 minutos (disparo `$42.0` de la HMI), ~360 filas/día, ~130 000/año.

## Alcance

Dos piezas:

1. **Backend**: módulo nuevo `src/horno/` en `mantix-backend`, montado en `/api/horno/v1`.
2. **Frontend**: repositorio nuevo `apps/mantix/incol-frontend` (Vue 3 + Pinia), publicado en
   `http://192.9.17.11/incol/`.

Fuera de alcance: escribir datos, alarmas por umbral, administración de usuarios, informes de promedios
descargables (se pueden agregar después), Superset.

## Backend

### Estructura (copia del patrón de Portería)

```
src/horno/
  config/entorno.js        leerEntorno(env) → {ok, config} | {ok:false, motivo}; nunca lanza
  db.js                    reutiliza ../porteria/db (crearBdPerezosa)
  horno.env.example
  middleware/              autenticacion.js (Bearer + verificarToken), apiCodigo.js, errorHandler.js
  routes/                  index.js (router guarda 503 + crearRouterHorno), auth.routes.js, lecturas.routes.js
  services/                auth.service.js (firmar/verificar JWT), lecturas.service.js (SQL), lecturasXlsx.js
  utils/                   HornoError.js, aw.js
  docs/openapi.yaml
  testing/appPrueba.js
  __tests__/
```

### Configuración

| Variable | Obligatoria | Uso |
|---|---|---|
| `HORNO_DB_HOST`, `HORNO_DB_USER`, `HORNO_DB_PASSWORD` | sí | servidor central; **sin** respaldo en `DB_*` |
| `HORNO_DB_PORT` (3306), `HORNO_DB_NAME` (`horno`) | no | |
| `HORNO_JWT_SECRET` | sí | ≥ 32 caracteres recomendado; distinto de los secretos de los otros módulos |
| `HORNO_JWT_EXPIRES` (`8h`) | no | |
| `HORNO_GRUPO_AD` (`INCOL_APP`) | no | CN o DN completo del grupo |
| `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_USER`, `LDAP_BIND_PASS` | sí | ya existen en mantix |

Si falta algo, todas las rutas del módulo responden 503 `HOR-SIS-000 / HORNO_DESHABILITADO` y mantix
arranca igual. Usuario MySQL dedicado de solo lectura: `incol_api` con `SELECT ON horno.*`.

### Autenticación

- `POST /auth/login {usuario, password}`: `ldap.service.validarCredenciales` → exige `memberOf` directo
  del grupo `HORNO_GRUPO_AD` (`esDelGrupo`). Errores: 400 validación, 401 `CREDENCIALES_INVALIDAS`,
  403 `SIN_ACCESO` ("Tu usuario de red no pertenece al grupo INCOL_APP"), 503 `AD_NO_DISPONIBLE`.
- Éxito: `{success:true, data:{token, user:{usuario, nombre, email}}}`. JWT HS256, `scope:'horno'`,
  `sub` = usuario de red, vence en `HORNO_JWT_EXPIRES`. Sin refresh: al vencer, se vuelve a iniciar sesión.
- Limitador de login propio: cuenta solo los 401; 10 por IP+usuario y 100 por IP en 15 min.
- `GET /auth/me` devuelve el usuario del token.
- Ruta exenta del limitador global de `app.js`, como los demás módulos.

### Lecturas (todas requieren token)

Fechas en formato `YYYY-MM-DD HH:mm:ss` o `YYYY-MM-DD`, hora de Colombia (sin conversión: las columnas
son DATETIME). `hasta` debe ser ≥ `desde`; rango máximo 366 días.

| Ruta | Respuesta |
|---|---|
| `GET /lecturas/ultima` | `{lectura, minutosSinDatos}`; `lectura` null si la tabla está vacía |
| `GET /lecturas/serie?desde&hasta` | `{agrupacion, puntos:[{t, <var>:{prom,min,max}}]}`; `agrupacion` = `crudo` (≤ 2 días), `hora` (≤ 31 días) o `dia` |
| `GET /lecturas?desde&hasta&pagina=1&tamano=50` | `{filas, total, pagina, tamano}`; orden `registrado_en DESC`; `tamano` ≤ 500 |
| `GET /lecturas.xlsx?desde&hasta` | Excel en streaming (`exceljs` WorkbookWriter); 413 `DEMASIADOS_REGISTROS` si supera 100 000 filas |

En `crudo`, `prom`, `min` y `max` son el mismo valor. Columnas del Excel: Fecha y hora, Temp.
combustión (°C), Temp. postcombustión (°C), Temp. chimenea (°C), CO (ppm), Oxígeno (%), CO (mg/m³), Ccr,
Ccr O2 ref. Nombre: `horno_incol_<desde>_<hasta>.xlsx`.

Las 8 variables se definen una sola vez en `lecturas.service.js` (`VARIABLES`) y de ahí salen el SQL, la
serie y las columnas del Excel.

### Errores y respuestas

`{success:true, data}` / `{success:false, error:'HOR-XXX-NNN', motivo, message, errors?}`.
`HornoError` extiende `AppError`; handler propio del módulo; código de API por ruta con `apiCodigo`.

### Pruebas

Jest + supertest con fakes (`bd` y `directorio` inyectados), como Portería:
entorno (faltantes, secreto repetido, valores por defecto), login (200/400/401/403/503, scope del token),
middleware (sin token, token de otro módulo, vencido), validación de fechas, agrupación automática,
paginación, Excel (cabeceras y 413), montaje en `app.js` (503 sin configuración) y documentación swagger.

## Frontend `incol-frontend`

- Vite 7 + Vue 3.5 + Pinia 3 + vue-router (web history, base `/incol/`) + Tailwind 3.4 con los tokens de
  GenFlow (`primary` verde, `#00875c` / `#005a3d`, fondo `#f9fafb`, barra lateral `#004730`),
  fuentes Comfortaa (títulos) y Raleway (texto) auto-alojadas, logo de Los Olivos local.
- chart.js 4 + vue-chartjs 5, dayjs, @heroicons/vue, axios.
- `VITE_API_URL` (producción `https://mantix-api.losolivoscucuta.com:8444/api/horno/v1`).
- `public/.htaccess` con `RewriteBase /incol/` y caché (no-cache para index.html).

Estructura:

```
src/api/        http.js (axios + Bearer + 401 → login), hornoApi.js
src/stores/     useAuthStore.js (token en localStorage), useLecturasStore.js
src/config/     variables.js (etiqueta, unidad, color, decimales de las 8 variables)
src/components/ layout/AppSidebar.vue, layout/AppHeader.vue, KpiCard.vue, EstadoRegistro.vue,
                FiltroRango.vue, GraficaSerie.vue, TablaLecturas.vue
src/views/      LoginView.vue, MonitoreoView.vue, GraficasView.vue, RegistrosView.vue
```

Vistas:

- **Login**: "Usuario de red" + clave, fondo con degradado verde y logo. Muestra los mensajes del backend.
- **Monitoreo**: franja de estado (verde < 10 min sin datos, amarillo 10–30, rojo > 30), 8 tarjetas
  con valor actual y unidad, hora del último dato. Se refresca cada 30 s y se pausa con la pestaña oculta.
- **Gráficas**: selector Hoy / 24 h / 7 días / 30 días / personalizado; tres gráficas de línea
  (temperaturas; CO, O₂ y CO mg/m³ con dos ejes; Ccr y Ccr O2). En `hora`/`dia` se dibuja el promedio
  con una banda mín–máx.
- **Registros**: filtro de fechas (por defecto, últimas 24 h), tabla paginada de 50, botón
  **Descargar Excel** (blob desde `/lecturas.xlsx`, mensaje claro si supera el límite).

Layout: barra lateral fija en escritorio (colapsable) y barra superior con menú en celular; nombre del
usuario y botón salir.

Pruebas: vitest para el store de autenticación, el cálculo de rangos y el formato de variables.

## Despliegue

1. Verificar desde el servidor de mantix-api que llega a `192.9.17.30:3306`.
2. En el central: crear `incol_api` (script `mysql/05_usuario_incol_api.sql` del proyecto eserver).
3. Backend: rama `feat/horno` → merge a `main` → push. En el servidor: variables `HORNO_*` en `.env`,
   agregar `http://192.9.17.11` a `CORS_ORIGIN`, ejecutar `scripts/deploy-mantix.sh`.
4. Crear el grupo `INCOL_APP` en el AD y agregar a los usuarios directamente.
5. Frontend: `npm run build` → copiar `dist/` a `\\192.9.17.11\AppServ\www\incol` (requiere
   `AllowOverride All` y `mod_rewrite` en Apache).
6. Runbook en `docs/horno/despliegue.md` con verificación y reversa por paso.
