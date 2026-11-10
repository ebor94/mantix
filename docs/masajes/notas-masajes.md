# Notas de la Tarea 0 — convenciones reales de mantix-backend

- **Fecha:** 2026-11-09
- **Repo revisado:** `/Users/Shared/Files From c.localized/apps/mantix/mantix-git` (git, último commit `e2c64cc` del 2026-11-03, Portería Fase 5).
- `../mantix-backend` es una **copia vieja** (mayo, sin git, sin tests). No usarla como base.
- Revisión de solo lectura: no se modificó nada en el repo.

## 1. La spec asume algo que no es así

La spec §9 dice "se reutiliza el login AD existente (JWT con `username` y `groups`)". **Ese JWT no existe:**

| Mecanismo | Archivo | Qué trae el token | Grupos AD |
|---|---|---|---|
| Auth principal (Mantix) | `src/middleware/auth.js` | `{ id }` o SSO `{ kind:'identidad', id_identidad }` | No: busca el rol en la tabla `usuarios` |
| SSO de identidad | `src/identity/config/jwt.js` | `{ id_identidad, email, kind }`, 30 min / refresh 14 d | No |
| **Portería** | `src/porteria/services/auth.service.js` | `{ scope:'porteria', sub, rol, sede_id }`, HS256, 12 h | Se leen de `memberOf` **en el login** y se guardan como `rol` |

**Recomendación:** Masajes debe copiar el patrón de **Portería**, no el auth principal:
- Login propio contra el AD (`directorio.validarCredenciales` → `src/h360/services/ldap.service.js`, que ya devuelve `{ usuario, nombre, email, memberOf }`).
- JWT propio: `scope: 'masajes'`, secreto `MASAJES_JWT_SECRET`, que debe ser distinto de `JWT_SECRET`, `IDENTIDAD_JWT_SECRET`, `TRK_JWT_SECRET` y `PORTERIA_JWT_SECRET` (Portería ya valida esto en `config/entorno.js`), `algorithms: ['HS256']` fijo, `exp` obligatorio y rol validado contra una lista cerrada.
- El rol (`admin_masajes` / `empleado`) y `mail` se resuelven en el login y van al token. El middleware ya no necesita `groups` en cada request.
- Rate limit del login igual al de Portería (`routes/auth.routes.js`): por usuario + IP y solo contando respuestas 401.

### Sobre el DN del grupo admin (spec §9.5, Q11 → **resuelta**)
`memberOf` trae el **DN completo** (`CN=PorteriaGuardas,OU=Grupos,DC=olivos,DC=local`). Se puede comparar el DN exacto, como pide la spec.
- Portería compara el **CN exacto** (`startsWith('cn=<grupo>,')`). Así evita el falso positivo `Porteria` ⊂ `PorteriaAdmins`, pero no distingue OU.
- Para Masajes: comparar el DN exacto con `MSJ_GRUPO_ADMIN_DN`. El dominio es `DC=olivos,DC=local`, no `losolivos.co`: corregir el ejemplo de la spec al definir la variable.

## 2. Convenciones de módulo (ajustan rutas del plan)

| Tema | Plan asumía | Realidad (Portería) |
|---|---|---|
| Carpeta | `src/modules/masajes/` | `src/<modulo>/` → **`src/masajes/`** |
| Montaje | `app.use('/api/masajes')` | `src/routes/index.js`: `router.use('/porteria/v1', …)` → **`/api/masajes/v1`** |
| Acceso a BD | Sequelize + modelos | Pool **mysql2** propio (`src/porteria/db.js`), zona `-05:00`, lazy |
| Migraciones | `sequelize-cli` | Archivos **`.sql` numerados** + `scripts/migrador.js` / `migrar.js` |
| Errores | `DomainError` | `PorteriaError(status, code, message)` + `errorHandler` del módulo montado en `app.js` |
| Tests | Jest | Unit: `jest src/porteria`. Integración: `jest.porteria-int.config.js` (`*.int.test.js`, `globalSetup` con MySQL de prueba, `--runInBand`) |
| Mailer | "existente" | `src/services/emailService.js` (nodemailer) |
| Módulo | CommonJS | CommonJS ✅ |

**Decisión pendiente:** el plan usa Sequelize y `sequelize-cli`, y Portería usa mysql2 con SQL a mano. Con mysql2, la concurrencia por índice UNIQUE y el `FOR UPDATE SKIP LOCKED` funcionan igual. El error de duplicado llega como `err.code === 'ER_DUP_ENTRY'` con el nombre del índice en `err.sqlMessage`, y el `mapUnique` del plan se adapta en una línea. Recomiendo seguir a Portería por coherencia, pero cambia las Tareas 2, 8 y 13 del plan.

## 3. Lo que ya existe y se reutiliza

- `helmet`, CORS por lista blanca (`CORS_ORIGIN`), rate limit global en `/api/`, `trust proxy = 1`: todo en `src/app.js`. Revisar en la línea 82 si Masajes debe excluirse del limitador global como Portería.
- `express-validator` y `joi` ya instalados → **no instalar zod**.
- `exceljs`, `multer`, `express-rate-limit`, `node-cron`, `axios`, `nodemailer` ya instalados. Faltan `dayjs` (hoy se usa `moment`; decidir), `googleapis` y `colombian-holidays`.
- `jsonwebtoken` 9.0.2: rechaza `alg: none` por defecto ✅.
- Parser JSON: Portería y BigDay montan `express.json({ limit: '10kb' })` por módulo antes del global de 10 MB. Masajes debe hacer lo mismo **antes** de la línea 94 de `app.js`.

## 4. Hallazgos de seguridad fuera del módulo (no corregidos; para tareas aparte)

| # | Severidad | Dónde | Hallazgo |
|---|---|---|---|
| H1 | Alta | `src/h360/services/ldap.service.js:309` | `detectarRoles` usa `dn.includes(groupName)` (subcadena): un grupo cuyo DN **contenga** el nombre configurado da el rol, y eso incluye `admin`. Portería ya corrigió este mismo error con `esDelGrupo`. |
| H2 | Alta | mismo archivo, líneas 314–317 | Fallback: cualquier DN que contenga `Domain Admins`/`Admins. del dominio` → rol `admin` en H360. También es por subcadena y está marcado como "temporal". |
| H3 | Media | `src/app.js:128` | `/api-docs` (Swagger) se publica sin condición, también en producción. |
| H4 | Media | `src/app.js:123` | `/uploads` se sirve estático **sin autenticación**: cualquiera con la URL ve los archivos subidos. Revisar qué hay ahí; Masajes no debe guardar el xlsx en disco. |
| H5 | Media | `/Users/Shared/Files From c.localized/apps/clave api.txt` | Archivo de texto con nombre de clave de API, permisos `rwxrwxrwt` (legible y modificable por cualquier usuario del equipo) en una carpeta compartida. **No lo abrí.** Moverlo a un gestor de secretos y borrarlo. |
| H6 | Baja | `src/identity/config/jwt.js` | Si faltan los secretos propios, el SSO cae a `JWT_SECRET` y el refresh a `JWT_SECRET + '_id_refresh'`: los dos secretos dejan de ser independientes. Fallar al arrancar en vez de derivarlos. |
| H7 | Baja | `src/middleware/auth.js:20,29` | `jwt.verify` sin `algorithms` fijo. Con secreto HMAC y jsonwebtoken 9 el riesgo es bajo, pero conviene fijar `['HS256']` como hace Portería. |
| H8 | Media | `apps/mantix/{mantix-backend,mantix-frontend,…}` | Varias carpetas con permisos `drwxrwxrwt`: cualquier usuario local puede modificar el código. `mantix-git` sí está bien (`drwxr-xr-x`). |
| H9 | **Crítica** | `package-lock.json` de `origin/main` | `npm audit --omit=dev` (2026-11-09): 33 vulnerabilidades, de ellas 1 crítica y 18 altas, **todas previas a Masajes**. La crítica es `proxy-addr`, que interpreta `trust proxy`, del que depende `req.ip`. Las altas incluyen dependencias que Masajes va a usar: `express`, `body-parser`, `path-to-regexp`, `mysql2`, `axios`, `form-data`, `jws` (`jsonwebtoken`) y `joi`; también `sequelize`, `lodash`, `validator`, `compression`, `js-yaml`, `minimatch`, `tmp` y `brace-expansion`. Casi todas se corrigen con `npm audit fix` sin versión mayor; `nodemailer@10` y `sharp@0.35` sí son mayores. Corregirlas en una rama aparte, porque cambia toda la app en producción. **Bloquea la Tarea 17.** |

## 5. Decisiones tomadas en la Tarea 0 (2026-11-09)

- **Rama:** `feature/masajes`, creada desde `origin/main` (`e2c64cc`, que ya incluye Portería).
- **Instalado:** `dayjs@1.11.23` y `nock@15.0.6` (dev), con `--save-exact`. `supertest` y `joi` ya estaban.
- **No instalado:** `colombian-holidays` (un solo mantenedor, ~4 mil descargas semanales, depende de `pascua`). Los festivos se definen con reglas simples (Ley 51 de 1983, "Ley Emiliani"), así que en la Tarea 3 se implementan con reglas propias más el cálculo de Pascua, sin dependencia externa (`src/masajes/dominio/festivos.js`).
- **Ley 2578 de 2026:** creó el festivo de la Virgen de Chiquinquirá (9 de julio, trasladable al lunes). Se aplicó por primera vez el lunes 13 de julio de 2026; en 2027 cae el lunes 12 de julio. Con él son 19 festivos. Hallado al verificar el calendario 2027 en la Tarea 3.
- **Mantenimiento:** si una ley nueva agrega o cambia un festivo, se agrega en `festivos.js` con su año `desde` y un test con las fechas oficiales. Mientras tanto, el admin puede bloquear el día a mano. Algunos años dos festivos caen el mismo lunes (p. ej. 30-jun-2025: San Pedro y Sagrado Corazón) y cuentan como un solo día de descanso.
- **Pospuesto:** `googleapis`, para la Tarea 12, que es donde se usa.
