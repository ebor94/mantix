# Agenda Virtual de Masajes — Design Spec

- **Fecha:** 2026-11-09
- **Estado:** BORRADOR — pendiente de aprobación (ver §13 Preguntas abiertas)
- **Autor:** Edwin Ortega (Coordinación TIC) con Claude
- **Repos:** `mantix-git` (backend de Mantix, módulo `src/masajes/`) · frontend Vue 3 existente (mismo stack de Portería)
- **Patrón de referencia:** módulo Portería (`src/porteria/`): login AD propio, JWT con `scope`, pool mysql2, migraciones SQL numeradas. Ver `notas-masajes.md`.
- **Ruta en repo:** `docs/superpowers/specs/2026-11-09-agenda-masajes-design.md`

---

## 1. Contexto

La Gerencia de Serfunorte Los Olivos autorizó **una sesión de masaje mensual** (bono) para un listado cerrado de **53 colaboradores** (archivo `LISTADO MASAJES 53 BONOS.xlsx`: N.º, nombre, cargo, celular, correo). Las sesiones las presta un spa externo que tiene su propia agenda, por lo que Serfunorte solo puede usar las **semanas que se habiliten explícitamente**.

Hoy no existe herramienta; el objetivo es una agenda web de autoservicio con login del Directorio Activo, sincronizada con Google Calendar y con notificaciones por correo y SMS (Háblame).

## 2. Objetivos

1. El colaborador inicia sesión con su usuario/contraseña del AD y agenda su sesión del mes en una franja disponible.
2. Al agendar se crea el evento en Google Calendar y se envía correo al spa.
3. El colaborador puede **reprogramar o cancelar** hasta **24 h antes** del inicio de la cita.
4. Recordatorio **2 días antes** por correo + SMS (Háblame) y correo **"¡Es hoy! ¡Es hoy!"** el día de la cita.
5. Un grupo administrador del AD puede hacer **cualquier operación sobre cualquier colaborador** y gestionar semanas habilitadas.

## 3. No-objetivos (v1)

- Pagos, facturación o conciliación con el spa.
- Lista de espera automática.
- Agenda para personas fuera del listado autorizado.
- App móvil nativa (la web debe ser responsive).
- Sincronización bidireccional con el calendario del spa (el spa no escribe en nuestro sistema).

## 4. Hallazgos del listado que afectan el diseño

| Hallazgo | Impacto |
|---|---|
| **Correos compartidos:** #9 y #17 usan `coordcomercialcucuta@`; #50 y #51 usan `homenajesyprotocoloscucuta@` | El correo **no puede ser la llave** del beneficiario. La llave es el usuario AD (`sAMAccountName`); los recordatorios por correo a buzones compartidos llegarán a ambos. |
| **~25 colaboradores con correo personal** (Gmail/Hotmail/Outlook — guías, asistentes y asesores de homenajes) | Probablemente **no todos tienen cuenta AD**. Ver pregunta abierta Q1. El administrador debe poder agendar en su nombre. |
| 53 bonos/mes vs. 30 franjas/semana (6 diarias × 5 días) | Se necesitan **mínimo 2 semanas habilitadas por mes**; con festivos (p. ej. lunes festivos) 2 semanas quedan justas → recomendar 3. |
| Celulares en formato local de 10 dígitos | Normalizar a `57XXXXXXXXXX` para Háblame. |

## 5. Reglas de negocio

### 5.1 Franjas
- Duración: **60 min**.
- Lunes a viernes, inicios: **08:00, 09:00, 10:00, 14:00, 15:00, 16:00** (hora Colombia, `America/Bogota`).
- Capacidad por franja: **1** (configurable; ver Q3).
- Se excluyen automáticamente los **festivos de Colombia** y los **bloqueos** manuales.

### 5.2 Semanas habilitadas
- Una semana se identifica por su **lunes** (`fecha_inicio`).
- Estados: `borrador` → `publicada` → `cerrada`. Solo las `publicada` muestran disponibilidad a empleados.
- El admin puede bloquear franjas o días puntuales dentro de una semana (motivo: festivo, spa, otro).
- Cerrar una semana no cancela citas existentes; solo impide nuevas.

### 5.3 Cupo mensual
- **1 cita activa por beneficiario por mes calendario**, tomando el mes de la **fecha de la cita** (`periodo = YYYY-MM`).
- Estados que **consumen** cupo: `agendada`, `asistio`, `no_asistio`. `cancelada` **libera** el cupo.
- El cupo no usado no se acumula (ver Q5).

### 5.4 Agendar
- Solo franjas futuras, en semana publicada, no bloqueadas y libres.
- Anticipación mínima para agendar: **24 h** (configurable `MSJ_ANTICIPACION_AGENDAR_H`; ver Q8).

### 5.5 Reprogramar / cancelar
- Empleado: permitido si `ahora ≤ inicio − 24 h` (`MSJ_ANTICIPACION_MODIFICAR_H=24`).
- Reprogramar = mover la misma cita a otra franja válida; aplica la regla de cupo del **periodo destino**.
- Cancelar exige motivo (texto corto, opcional para empleado, obligatorio para admin).
- Cada cambio queda en historial de auditoría.

### 5.6 Administrador
- Pertenencia a un grupo AD configurable por DN completo (`MSJ_GRUPO_ADMIN_DN`, p. ej. `CN=GG-Masajes-Admin,OU=Grupos,DC=olivos,DC=local`).
- Toda acción de admin sobre la cita de otra persona queda en historial con `usuario`, `es_admin = true`, IP y motivo.
- Puede: agendar/reprogramar/cancelar por cualquier beneficiario **sin restricción de anticipación**, gestionar semanas y bloqueos, gestionar el listado (alta/baja/vinculación AD/importación xlsx), marcar asistencia (`asistio` / `no_asistio`), ver y reintentar notificaciones.

## 6. Arquitectura

```
[Vue 3 + Pinia + Tailwind]  ──JWT scope=masajes──►  [mantix /api/masajes/v1/*] ──LDAP──► AD
                                          │
                     ┌────────────────────┼──────────────────────┐
                     ▼                    ▼                      ▼
              MySQL (msj_*)        Outbox msj_notificaciones   node-cron jobs
                                          │                     (recordatorios)
                     ┌────────────────────┼──────────────────────┐
                     ▼                    ▼                      ▼
             Google Calendar API     Mailer existente        Háblame SMS
             (service account)       (nodemailer/SMTP)
```

Decisiones:
1. **Módulo dentro de mantix** (`src/masajes/`), montado en `src/routes/index.js` como `/masajes/v1`, con la **misma estructura que Portería**: `config/entorno.js`, `db.js` (pool mysql2 propio y perezoso), `migrations/NNN_*.sql`, `repositorios/`, `services/`, `routes/` con fábricas inyectables, `middleware/{apiCodigo,autenticacion,errorHandler}.js` y `utils/MasajesError.js`. Reutiliza `ldap.service` (H360) para validar credenciales, `emailService`, `utils/logger` y la base MySQL compartida.
   - Si la configuración del módulo es inválida, el router responde `503` y **Mantix sigue arriba**, igual que Portería.
2. **Patrón outbox:** la transacción de agendar escribe la cita **y** las tareas pendientes (calendar, correos, SMS) en `msj_notificaciones`. Un worker las procesa con reintentos. Así un fallo de Google o Háblame **nunca** bloquea ni revierte una reserva.
3. **Concurrencia por índice único**, no por bloqueos de aplicación (ver §7).
4. **Jobs con node-cron dentro del backend** + idempotencia por clave única, seguro aunque corra en más de una instancia de pm2. (Alternativa descartada: n8n — agrega otro punto de fallo y separa la lógica de cupo del dominio.)
5. Fechas: como Portería, el pool usa `timezone: '-05:00'` y cada conexión hace `SET time_zone = '-05:00'`. Los `DATETIME` quedan en **hora Colombia** (sin horario de verano, así que no hay ambigüedad) y en JS se manejan como `Date` absolutos. La lógica de franjas usa `America/Bogota` con dayjs (`utc`/`timezone`).

## 7. Modelo de datos (MySQL, prefijo `msj_`)

Las migraciones son archivos `src/masajes/migrations/NNN_*.sql`, aplicados en orden por `npm run masajes:migrate` y registrados en `msj_migraciones` (mismo migrador que Portería). Todas las tablas son `InnoDB`, `utf8mb4_unicode_ci`.

### `msj_beneficiarios`
| Campo | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| nombre | VARCHAR(150) | |
| cargo | VARCHAR(150) | |
| celular | VARCHAR(15) | normalizado `57XXXXXXXXXX` |
| correo | VARCHAR(150) | **no único** (buzones compartidos) |
| ad_usuario | VARCHAR(80) NULL **UNIQUE** | `sAMAccountName`; NULL hasta vincular |
| activo | BOOLEAN | baja lógica |
| created_at / updated_at | DATETIME | |

### `msj_semanas`
| Campo | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| fecha_inicio | DATE **UNIQUE** | siempre lunes |
| estado | ENUM('borrador','publicada','cerrada') | |
| capacidad_franja | TINYINT DEFAULT 1 | |
| notas | VARCHAR(255) NULL | |
| creado_por | VARCHAR(80) | usuario AD |

### `msj_bloqueos`
| Campo | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| semana_id | FK → msj_semanas | |
| inicio / fin | DATETIME (hora Colombia) | puede cubrir una franja o un día |
| motivo | ENUM('festivo','spa','otro') | festivos se generan al crear la semana |
| detalle | VARCHAR(255) NULL | |

### `msj_citas`
| Campo | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| beneficiario_id | FK | |
| semana_id | FK | |
| inicio / fin | DATETIME (hora Colombia) | |
| periodo | CHAR(7) | `YYYY-MM` en hora Colombia |
| estado | ENUM('agendada','cancelada','asistio','no_asistio') | |
| **slot_key** | VARCHAR(40) NULL **UNIQUE** (`uq_msj_citas_slot_key`) | `2026-11-12T09:00#1` mientras está activa; NULL al cancelar |
| **cupo_key** | VARCHAR(40) NULL **UNIQUE** (`uq_msj_citas_cupo_key`) | `{beneficiarioId}:{periodo}` mientras consume cupo; NULL al cancelar |
| google_event_id | VARCHAR(255) NULL | |
| motivo_cancelacion | VARCHAR(255) NULL | |
| creado_por / actualizado_por | VARCHAR(80) | usuario AD (empleado o admin) |

> MySQL permite múltiples NULL en un índice UNIQUE: así dos reservas simultáneas de la misma franja → una recibe `ER_DUP_ENTRY` (mysql2) → `409 SLOT_OCUPADO`; un segundo agendamiento en el mes → `409 CUPO_MES_USADO`. Con capacidad > 1, el sufijo `#n` toma el primer índice libre; si el insert choca con `slot_key`, se reintenta con el siguiente índice (máx. `capacidad` intentos) antes de devolver `SLOT_OCUPADO`.
>
> Los índices UNIQUE llevan **nombre explícito** porque el mapeo del error de concurrencia a `SLOT_OCUPADO` / `CUPO_MES_USADO` depende de ese nombre (ver §17.4).

### `msj_cita_historial` (solo inserción)
`id, beneficiario_id, cita_id NULL, accion ENUM('creada','reprogramada','cancelada','asistencia','autovinculacion'), inicio_anterior, inicio_nuevo, motivo, usuario, es_admin, ip, user_agent, request_id, created_at`

`cita_id` es NULL solo en `autovinculacion`, que no tiene cita asociada (`CHECK ck_msj_historial_cita`).

La aplicación nunca hace UPDATE ni DELETE sobre esta tabla. El usuario de BD de la aplicación debería tener solo `INSERT, SELECT` sobre ella (ver §17.8).

### `msj_notificaciones` (outbox)
| Campo | Tipo | Notas |
|---|---|---|
| id | INT PK | |
| cita_id | FK | |
| tipo | ENUM('calendar_upsert','calendar_delete','spa_nueva','spa_reprogramada','spa_cancelada','empleado_confirmacion','empleado_cancelacion','recordatorio_2d','es_hoy') | |
| canal | ENUM('google','email','sms') | |
| clave | VARCHAR(120) **UNIQUE** | idempotencia: `{citaId}:{tipo}:{canal}:{inicioISO}` |
| estado | ENUM('pendiente','enviado','fallido','descartado') | |
| intentos | TINYINT | máx. 5, backoff exponencial |
| proximo_intento | DATETIME | |
| ultimo_error | TEXT NULL | |
| enviado_at | DATETIME NULL | |

## 8. API (`/api/masajes/v1`, JWT de Masajes obligatorio salvo `/auth/login` y `/health`)

### Sesión
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/login` | `{ usuario, contrasena }` → valida contra el AD y devuelve `{ token, usuario }` (ver §9) |
| GET | `/auth/sesion` | Usuario en sesión, rol y beneficiario vinculado |
| GET | `/health` | Ping a la BD (sin datos) |

### Empleado
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/me` | Beneficiario vinculado, cupo del mes actual y siguiente, citas futuras |
| GET | `/disponibilidad?desde=&hasta=` | Franjas con estado `libre/ocupada/bloqueada/pasada` (solo semanas publicadas). Rango máximo 31 días. **No expone nombres** ni datos de otros empleados |
| POST | `/citas` | `{ inicio }` → crea cita. El beneficiario sale **siempre** de `req.beneficiario`, nunca del body |
| PATCH | `/citas/:id/reprogramar` | `{ inicio }`. Solo citas propias; una cita ajena responde `404` (no `403`) para no revelar qué IDs existen |
| POST | `/citas/:id/cancelar` | `{ motivo? }` (máx. 255). Mismo control de propiedad |

Todas las entradas pasan por un esquema de validación estricto (ver §17.3): `inicio` en ISO 8601 **con zona horaria explícita**, `:id` entero positivo, y cualquier campo desconocido se rechaza con `400 VALIDACION`.

### Admin (grupo `MSJ_GRUPO_ADMIN_DN`)
| Método | Ruta | Descripción |
|---|---|---|
| GET/POST/PATCH | `/admin/semanas` | CRUD; al crear genera bloqueos de festivos |
| POST | `/admin/semanas/:id/publicar` · `/cerrar` | |
| POST/DELETE | `/admin/semanas/:id/bloqueos` | |
| GET/POST/PATCH | `/admin/beneficiarios` | alta, baja, vincular `ad_usuario` |
| POST | `/admin/beneficiarios/importar` | xlsx con las columnas del listado |
| GET | `/admin/citas?periodo=&estado=&beneficiario=` | |
| POST | `/admin/citas` | `{ beneficiarioId, inicio }` (sin restricción de anticipación) |
| PATCH | `/admin/citas/:id/reprogramar` · POST `/cancelar` · PATCH `/asistencia` | |
| GET | `/admin/notificaciones?estado=` · POST `/:id/reintentar` | |

### Errores de dominio
| Código HTTP | `motivo` | Cuándo |
|---|---|---|
| 403 | `NO_BENEFICIARIO` | Usuario AD válido pero no está en el listado activo |
| 403 | `NO_ADMIN` | Ruta admin sin pertenecer al grupo |
| 409 | `SLOT_OCUPADO` | Franja tomada |
| 409 | `CUPO_MES_USADO` | Ya tiene cita en ese periodo |
| 422 | `FUERA_DE_VENTANA` | Franja no existe, semana no publicada, bloqueada o festiva |
| 422 | `ANTICIPACION_INSUFICIENTE` | Menos de 24 h para agendar/modificar |
| 422 | `ESTADO_INVALIDO` | Modificar una cita cancelada o ya atendida |
| 400 | `VALIDACION` | Cuerpo, query o parámetros inválidos o con campos no permitidos |
| 404 | `NO_ENCONTRADA` | La cita no existe **o no pertenece al empleado** |
| 413 | `ARCHIVO_GRANDE` | Importación xlsx que supera el límite |
| 429 | `DEMASIADAS_SOLICITUDES` | Se superó el límite de peticiones |
| 401 | `NO_AUTENTICADO` | Sin token, token vencido, de otro `scope` o credenciales AD inválidas |
| 503 | `NO_DISPONIBLE` | Configuración del módulo inválida o AD/BD caídos |
| 500 | `ERROR_INTERNO` | Error no controlado. Mensaje genérico; nunca stack, SQL ni `sqlMessage` |

Respuesta de error con el contrato de Portería: `{ success: false, error: 'MSJ-CIT-002', motivo, message }`. `error` es el **código de API** de la ruta (también en la cabecera `X-MSJ-API`, útil para soporte y logs), `motivo` es el código de dominio de la tabla y `message` va en español, listo para mostrar. Éxito: `{ success: true, data }`.

## 9. Autenticación y vinculación AD

Se sigue el patrón de Portería (`src/porteria/services/auth.service.js`, `routes/auth.routes.js`). El auth principal de Mantix **no sirve**: su JWT no lleva grupos y resuelve el rol desde la tabla `usuarios`.

1. **Login propio** `POST /auth/login { usuario, contrasena }`:
   - El usuario se normaliza como en Portería (lo que va después de `\\` o antes de `@`, en minúsculas).
   - `ldapService.validarCredenciales` (H360) hace el bind contra el AD y devuelve `{ usuario, nombre, email, memberOf }`. El filtro del AD ya excluye cuentas deshabilitadas.
   - Rate limit igual al de Portería: 10 fallos por usuario+IP y 100 por IP en 15 min, contando **solo** las respuestas 401. Un AD caído responde 503 y no cuenta como fallo.
   - La contraseña nunca se registra en logs ni se guarda.
2. **Rol:** `admin_masajes` si `memberOf` contiene `MSJ_GRUPO_ADMIN_DN` con **coincidencia exacta del DN** (case-insensitive; `memberOf` trae DNs completos como `CN=…,OU=Grupos,DC=olivos,DC=local`). No se compara por subcadena (el error que hoy tiene `detectarRoles` en H360) ni solo por CN. Si no es admin, el rol es `empleado`. Si la variable está vacía, nadie es admin.
3. **Beneficiario:** se busca `msj_beneficiarios.ad_usuario = usuario` (normalizado). Si no hay vínculo, se intenta **autovinculación una sola vez** por `email` del AD, solo si coincide con exactamente un beneficiario sin `ad_usuario` y el dominio es corporativo (`MSJ_DOMINIOS_AUTOVINCULO`). Los buzones compartidos y los correos personales nunca autovinculan; los vincula el admin. Cada autovinculación queda en historial.
4. Si no es admin ni beneficiario activo → `403 NO_BENEFICIARIO` **en el login**, sin emitir token: "No estás en el listado de beneficiarios. Comunícate con Talento Humano."
5. **Token** (`jsonwebtoken`, como `firmarToken` de Portería):
   - Payload `{ scope: 'masajes', sub: usuario, nombre, rol }`, `algorithm: 'HS256'`, `expiresIn: MASAJES_JWT_EXPIRES` (por defecto `8h`).
   - Secreto `MASAJES_JWT_SECRET` de ≥ 32 caracteres y **distinto** de `JWT_SECRET`, `IDENTIDAD_JWT_SECRET`, `TRK_JWT_SECRET` y `PORTERIA_JWT_SECRET`; `entorno.js` lo valida, como hace Portería. Así un token de otro módulo nunca abre Masajes.
   - El token **no** lleva `beneficiario_id`, celular ni correo.
6. **Middleware `autenticar`:** `jwt.verify(token, secreto, { algorithms: ['HS256'] })` y rechazo si `scope !== 'masajes'`, si falta `sub` o `exp`, o si el `rol` no está en la lista cerrada. Después, `resolverBeneficiario` vuelve a leer el beneficiario **en cada request** (`ad_usuario = sub AND activo = 1`): desactivarlo surte efecto de inmediato, sin esperar a que venza el token. El rol admin sí dura lo que el token (≤ 8 h); es un riesgo aceptado y documentado.
7. **Autorización en dos capas:** `requiereRol('admin_masajes')` en `router.use('/admin', …)`, y el servicio vuelve a filtrar por propiedad (`WHERE id = ? AND beneficiario_id = ?`) cuando el actor no es admin. Un admin que además es beneficiario ve ambas vistas.

## 10. Integraciones

### 10.1 Google Calendar
- Cuenta de servicio con **delegación de dominio** en Google Workspace `losolivos.co`, impersonando una cuenta de agenda (`MSJ_GOOGLE_IMPERSONAR`, p. ej. `agenda.bienestar@losolivos.co`) sobre el calendario `MSJ_GOOGLE_CALENDAR_ID`. La delegación es necesaria porque una cuenta de servicio sin ella no puede invitar asistentes.
- **La delegación de dominio permite impersonar a cualquier usuario del dominio**, así que la llave de la cuenta de servicio es la credencial más sensible del módulo:
  - En la consola de administración se autoriza **solo** el scope `https://www.googleapis.com/auth/calendar.events`, no `.../auth/calendar`.
  - El código solo impersona `MSJ_GOOGLE_IMPERSONAR`; nunca toma el `subject` de la BD ni de la petición.
  - La cuenta de servicio vive en un proyecto GCP dedicado y sin otros roles IAM. La llave JSON queda fuera del repo, con permisos `600` y dueño el usuario del proceso; se rota cada 90 días y se registra quién la tiene.
- Evento: título `Masaje — {Nombre}`, `visibility: 'private'`, inicio/fin con `timeZone: America/Bogota`, ubicación del spa, descripción con instrucciones y link a la agenda; asistentes: correo del empleado (y opcionalmente el del spa, `MSJ_SPA_EN_EVENTO=true`); `sendUpdates: 'all'`. Sin cargo ni celular en el evento (minimización de datos).
- Reprogramar → `events.patch`; cancelar → `events.delete` (con `sendUpdates: 'all'`).
- Se guarda `google_event_id` en la cita.

### 10.2 Correo
- Reutiliza el mailer existente de Mantix (`src/services/emailService.js`, nodemailer). Plantillas HTML (Handlebars o template literals) con identidad Serfunorte:
  - **Al spa** (`MSJ_SPA_EMAIL`): nueva cita / reprogramada (antes → ahora) / cancelada.
  - **Al empleado:** confirmación, cancelación, recordatorio 2 días, "¡Es hoy! ¡Es hoy!".
- Todas incluyen: nombre, cargo, fecha (formato "jueves 12 de noviembre"), hora, dirección del spa, y link para reprogramar/cancelar (si aún aplica).
- **Escape obligatorio:** todo valor interpolado (nombre, cargo, motivo) se escapa como HTML. Los datos vienen de un xlsx y de texto libre, así que un nombre como `<a href=…>` no puede convertirse en un enlace. Con template literals se usa una función `esc()`; con Handlebars, solo `{{ }}` y nunca `{{{ }}}`. Además se quitan `\r` y `\n` de cualquier valor que vaya al asunto.
- El link es a la app (`MSJ_APP_URL`), que exige login. **No se usan magic links** ni tokens en la URL para reprogramar o cancelar.
- Destinatarios: el spa sale **solo** de config y el empleado del registro del beneficiario. Ningún endpoint acepta un destinatario arbitrario, así que el módulo no puede usarse como relay de correo.

### 10.3 SMS — Háblame
- Adaptador `HablameSmsClient` con endpoint, cuenta y API key por variables de entorno (las credenciales de API se obtienen en el panel `ecare.hablame.co`; **el login de la consola no se usa desde código**). El contrato exacto (URL, headers, payload) se confirma con la documentación vigente de Háblame en la tarea correspondiente del plan.
- Mensaje ≤ 160 caracteres, sin tildes para evitar codificación UCS-2:
  `Serfunorte: recuerda tu masaje el jue 12/11 a las 9:00am en {SPA}. Cambios hasta 24h antes en {URL_CORTA}`
- Número normalizado `57XXXXXXXXXX` y validado como móvil colombiano (`^573\d{9}$`); si es inválido, la notificación queda `fallido` con error visible para el admin.
- Llamadas HTTPS únicamente, con `timeout` de 10 s y `maxRedirects: 0`. La API key va en un header, nunca en la URL (las URL terminan en logs de proxies).
- **Control de costo:** máximo 2 SMS por cita y por inicio (recordatorio; reenvío manual del admin). Un contador diario con tope (`MSJ_SMS_TOPE_DIARIO`, p. ej. 100) detiene los envíos y alerta si un bug en el job empieza a enviar en bucle.

## 11. Jobs programados (node-cron, zona `America/Bogota`)

| Job | Cron | Acción |
|---|---|---|
| `procesarOutbox` | cada 2 min | Toma hasta 50 `pendiente` con `proximo_intento ≤ ahora` (`FOR UPDATE SKIP LOCKED`), envía, marca `enviado`/reintenta |
| `encolarRecordatorios2d` | 07:00 diario | Citas `agendada` cuya fecha local = hoy + 2 → encola `recordatorio_2d` email + sms |
| `encolarEsHoy` | 06:30 diario | Citas `agendada` de hoy → encola `es_hoy` email |

- Idempotencia por `clave` (incluye `inicioISO`): reejecutar el job no duplica envíos; una reprogramación genera claves nuevas.
- Antes de enviar, el worker **revalida** que la cita siga `agendada` y con el mismo `inicio`; si no → `descartado`.
- Citas creadas con menos de 2 días de anticipación no reciben `recordatorio_2d` (ya recibieron confirmación).

## 12. Frontend (Vue 3 + Pinia + Tailwind)

### Vista empleado `/masajes`
- Tarjeta "Tu bono de {mes}": disponible / agendado (fecha, hora, botones **Reprogramar** y **Cancelar**, deshabilitados con explicación si faltan < 24 h).
- Selector de semana (solo publicadas) con grilla días × franjas; libre = clic para agendar; ocupada/bloqueada/pasada = gris.
- Modal de confirmación → toast de éxito → "Te llegará la invitación de Google Calendar".
- Mensajes de error desde `message` del API (el `motivo` decide el estilo del aviso).
- Responsive (muchos usuarios entrarán desde el celular).

### Vista admin `/masajes/admin`
- **Semanas:** crear (selector de lunes), ver festivos detectados, bloquear franjas, publicar/cerrar, ocupación %.
- **Citas:** tabla filtrable por periodo/estado; acciones agendar por otro, reprogramar, cancelar, marcar asistencia.
- **Beneficiarios:** listado, importar xlsx, vincular usuario AD, activar/desactivar; indicador "sin vincular".
- **Notificaciones:** fallidas con error y botón reintentar.
- Indicador de cobertura: "x de 53 bonos agendados este mes / franjas libres restantes".

## 13. Preguntas abiertas (resolver antes de aprobar)

| # | Pregunta | Propuesta por defecto |
|---|---|---|
| Q1 | ¿Los ~25 colaboradores con correo personal tienen usuario AD? | Si no: el admin agenda por ellos y reciben correo/SMS igual. Alternativa futura: login con OTP por SMS. |
| Q2 | ¿Cuál es el correo, nombre y dirección del spa? | Variables `MSJ_SPA_*` |
| Q3 | ¿Cuántos masajistas/cabinas por franja? | 1 |
| Q4 | ¿Qué cuenta de Workspace será dueña del calendario? ¿Se puede crear la cuenta de servicio con delegación? | `agenda.bienestar@losolivos.co` |
| Q5 | Si no usa el bono del mes, ¿se pierde? ¿Inasistencia consume el bono? | Se pierde; `no_asistio` consume |
| Q6 | ¿Hay credenciales de API de Háblame (no solo usuario de consola) y saldo de SMS? | Solicitar API key |
| Q7 | ¿Quiénes conforman el grupo admin? ¿Talento Humano? | Crear `GG-Masajes-Admin` con TH y TIC |
| Q8 | ¿Anticipación mínima para agendar? ¿Se permite agendar el mismo día si hay cupo? | 24 h |
| Q9 | ¿El spa necesita ver la agenda en línea o le basta el correo + invitación? | Correo + invitación opcional |
| Q10 | ¿Cómo guarda el frontend de Portería su JWT (localStorage o cookie `httpOnly`)? Masajes hará lo mismo | Bearer en header como Portería, con vigencia de 8 h y la CSP de §17.6 obligatoria |
| Q11 | ~~¿Los grupos llegan como DN o CN?~~ **Resuelta:** `memberOf` del AD trae DN completo; se compara exacto (§9.2) | — |
| Q12 | ¿Hay política de tratamiento de datos (Ley 1581 de 2012) que cubra el envío de nombre y celular al spa y a Háblame? | Validar con Jurídica/TH antes de producción |

## 14. Estrategia de pruebas

- **Unitarias (dominio puro, sin BD):** generación de franjas, festivos, cálculo de periodo, reglas de anticipación, normalización de celular, formato de mensajes SMS (≤160, sin tildes).
- **Integración (BD de prueba):** agendar feliz, `SLOT_OCUPADO` con dos peticiones en paralelo (`Promise.all`), `CUPO_MES_USADO`, cancelar libera cupo y franja, reprogramar entre meses, admin sin anticipación, empleado no beneficiario → 403.
- **Outbox/jobs:** con reloj falso (`jest.useFakeTimers` / `MockDate`): recordatorio 2d se encola una sola vez; cita reprogramada descarta el recordatorio viejo; reintentos con backoff.
- **Adaptadores:** Google, mailer y Háblame con mocks / `nock`; ningún test llama servicios reales.
- **Seguridad (obligatorias, ver §17):** IDOR (empleado A reprograma o cancela la cita de B → 404 y la cita intacta); `beneficiarioId` en el body ignorado; campos extra → 400; `inicio` sin zona horaria o con milisegundos → 400/422; rango de disponibilidad > 31 días → 400; grupo admin con CN correcto pero DN distinto → 403; nombre con `<script>` escapado en todas las plantillas; asunto con `\r\n` saneado; xlsx > 2 MB → 413, extensión falsa → 400 y celdas con fórmulas guardadas como texto; error 500 sin stack; `ultimo_error` sin API key; rate limit → 429.
- **E2E manual** antes de producción con una semana de prueba y 2–3 usuarios TIC.

## 15. Despliegue y operación

- Variables nuevas en `.env` de `srv-backend` (ver plan, tarea 1).
- Migraciones con `npm run masajes:migrate`; carga del listado con `npm run masajes:importar -- <ruta.xlsx>`.
- Jobs se activan con `MSJ_JOBS_ENABLED=true` solo en una instancia si se usa pm2 cluster (aunque la idempotencia protege igual).
- Logs con `logger.child({ modulo: 'masajes', api_codigo })` (como Portería), sin query string en la ruta registrada; las notificaciones fallidas se ven en la vista admin.

## 16. Criterios de aceptación

1. Un beneficiario con AD agenda en una semana publicada y en < 1 min ve el evento en su Google Calendar y el spa recibe el correo.
2. Dos personas intentando la misma franja: solo una la obtiene; la otra ve "Esa franja acaba de ser tomada".
3. Un beneficiario no puede tener dos citas activas en el mismo mes.
4. Con menos de 24 h, el empleado no puede reprogramar ni cancelar; el admin sí.
5. Recordatorio por correo y SMS llega 2 días antes; correo "¡Es hoy!" llega el mismo día; ninguno se duplica.
6. Festivos de Colombia nunca aparecen como disponibles.
7. Un usuario AD que no está en el listado recibe `NO_BENEFICIARIO`.
8. Un empleado no puede ver, reprogramar ni cancelar la cita de otro, aunque adivine el `id`.
9. `npm audit --omit=dev` sin vulnerabilidades altas o críticas; ningún secreto en el repo ni en los logs.

## 17. Seguridad

### 17.1 Modelo de amenazas (resumen)
| Activo | Amenaza | Control |
|---|---|---|
| Citas y cupo | Empleado modifica la cita de otro (IDOR) | Propiedad en servicio + 404 (§9.6) |
| Permisos admin | Escalada vía grupo homónimo o token viejo | DN exacto, JWT corto (§9) |
| Llave Google (DWD) | Robo → impersonar a cualquier usuario del dominio | Scope mínimo, permisos 600, rotación (§10.1) |
| Saldo SMS | Bucle del job o abuso → costo | Idempotencia + tope diario (§10.3) |
| Datos personales | Fuga por API, logs, calendario o correos | Minimización, redacción, escape (§17.5) |
| Disponibilidad | Rangos enormes o ráfagas de peticiones | Límite de rango, rate limit (§17.3) |
| Servidor | xlsx malicioso (zip bomb, fórmulas, parser vulnerable) | Límites de upload, `exceljs`, sin `xlsx` (§17.7) |

### 17.2 Autenticación y autorización
- Todas las rutas `/api/masajes/v1/*` exigen el JWT de Masajes salvo `/auth/login` y `/health`; las `/admin/*` además `requiereRol('admin_masajes')`. Cada sub-router recibe `autenticar` por inyección y lo aplica con `router.use` antes de sus rutas, para que una ruta nueva no quede pública por olvido. Un test recorre el router y verifica que toda ruta responde 401 sin token.
- `ahora` es un parámetro de los servicios solo para tests; los controllers **nunca** lo toman de la petición.
- Para el admin que agenda por otro, `beneficiarioId` se valida contra beneficiarios **activos**.

### 17.3 Validación de entrada
- Un esquema por endpoint (`joi`, ya instalado; o validación manual como Portería) para `body`, `query` y `params`, en modo estricto: los campos desconocidos se rechazan, lo que evita mass assignment (p. ej. `estado`, `slot_key` o `ad_usuario` en un PATCH).
- `inicio`: ISO 8601 con offset (`Z` o `-05:00`), sin milisegundos; se descarta todo `Date` inválido. `desde`/`hasta`: fechas `YYYY-MM-DD` con `hasta − desde ≤ 31 días`.
- Textos (`motivo`, `notas`, `detalle`): recorte de espacios, máx. 255, sin caracteres de control.
- `express.json({ limit: '10kb' })` en el router del módulo.
- Rate limit por usuario (`express-rate-limit`, llave = `username`): escrituras 20/min y lecturas 120/min por empleado; importación 5/h.
- Las consultas usan mysql2 con placeholders `?` (`conn.execute(sql, params)`). Nunca se concatenan ni interpolan valores en el SQL. Los nombres de columnas u orden dinámicos salen de una lista blanca.

### 17.4 Integridad y concurrencia
- `mapUnique` decide por **nombre de índice** (`uq_msj_citas_cupo_key`), no por un `includes` sobre los campos.
- Reprogramar y cancelar bloquean la cita con `SELECT … FOR UPDATE` dentro de la transacción.
- El estado se cambia solo con transiciones válidas (`agendada → cancelada | asistio | no_asistio`); cualquier otra → `ESTADO_INVALIDO`.

### 17.5 Datos personales (Ley 1581 de 2012) y logs
- Minimización: la disponibilidad para empleados no lleva nombres; el evento de calendario no lleva celular ni cargo; el SMS no lleva el nombre completo.
- Logs: `modulo: 'masajes'`, código de API, usuario y acción. Para errores se usa `errorParaLog` (como Portería): nunca `message`, `sqlMessage`, `sql` ni `parameters`, porque `Duplicate entry '…'` expone datos. **Nunca** tokens, API keys, contraseñas, cuerpos completos de peticiones ni celulares completos (se enmascaran como `57315****079`).
- `ultimo_error` del outbox pasa por una función `redactar()` que quita headers de autorización, API keys y query strings, y se trunca a 1000 caracteres.
- Retención: el historial y las notificaciones con más de 24 meses se purgan con un job, o según la política que defina Jurídica (Q12).

### 17.6 Cabeceras y frontend
- `helmet` ya está activo globalmente en `src/app.js` y cubre `/api/masajes`. CORS restringido al origen del frontend, sin `*` y con credenciales solo si se usa cookie.
- Frontend: Vue escapa por defecto. Prohibido usar `v-html` con datos del API (regla ESLint `vue/no-v-html` en el módulo).
- CSP en el servidor del frontend: `default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'`.
- Si en algún momento el JWT pasa a cookie (Q10), protección CSRF con `SameSite=Strict` más verificación del header `Origin` en las escrituras.
- Swagger (`/api-docs`) desactivado en producción o detrás de autenticación admin.

### 17.7 Importación de xlsx
- Solo admin. `multer` con `memoryStorage`, límite de **2 MB** y 1 archivo; se exige extensión `.xlsx`, el MIME de OpenXML y los magic bytes `PK\x03\x04`.
- Se lee con **`exceljs`**. **No** se usa el paquete `xlsx` de npm: la versión publicada ahí está congelada y tiene CVEs conocidos (CVE-2023-30533 de prototype pollution y CVE-2024-22363 de ReDoS).
- Tope de filas (500) y de columnas leídas. Las celdas con fórmula se toman por su `result` como texto plano y nunca se evalúan. Si el listado se exporta luego a CSV/xlsx, los valores que empiezan por `= + - @` se prefijan con `'` (CSV injection).
- La importación es una transacción: si falla, no queda un listado a medias.

### 17.8 Secretos, dependencias y operación
- Secretos solo en variables de entorno o en el archivo de la cuenta de servicio, nunca en el repo; `.env` en `.gitignore`; `.env.example` sin valores reales. Al arrancar se valida la configuración y el proceso **falla de inmediato** si falta un secreto requerido o un número es inválido.
- Usuario de BD con mínimo privilegio: DML sobre `msj_*`, solo `INSERT, SELECT` sobre `msj_cita_historial`; las migraciones corren con otro usuario.
- Dependencias: `package-lock.json` versionado, `npm ci` en despliegue, `npm audit --omit=dev` en CI (falla con altas o críticas). Antes de instalar `colombian-holidays` se revisan sus mantenedores y descargas; si no hay confianza suficiente, se usa la tabla fija de festivos.
- Errores: `masajesErrorHandler` (copia de `porteriaErrorHandler`) traduce `MasajesError`; cualquier otro error se registra con `errorParaLog` y responde `500 ERROR_INTERNO` genérico.
