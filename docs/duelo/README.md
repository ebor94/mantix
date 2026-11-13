# Módulo Duelo · Inscripción al II Taller de Duelo Animal

API del formulario público `https://losolivoscucuta.com/Duelomascotas` y de su panel interno.
Montado en `/api/duelo/v1`. El frontend vive en el repositorio `Duelomascotas`.

## Endpoints

| Método y ruta | Acceso | Qué hace |
|---|---|---|
| `GET /estado` | Público | `{ abiertas, versionPolitica }` |
| `POST /inscripciones` | Público (`multipart/form-data`) | Crea la inscripción con hasta 3 fotos |
| `POST /panel/login` | Público, 5 intentos fallidos / 15 min por IP | Token del panel (2 h) |
| `GET /panel/inscripciones` | Token | Listado completo (id descendente) y totales; la búsqueda la hace el panel en el navegador, para que cédula y correo nunca viajen en la URL |
| `GET /panel/fotos/:id` | Token | Foto de un compañero |
| `GET /panel/exportar.xlsx` | Token | Excel para certificados |
| `GET /panel/fotos.zip` | Token | Fotos nombradas `cedula_orden_nombre-companero.jpg` |

Campos de `POST /inscripciones`: `nombre_completo`, `cedula`, `celular`, `correo`, `honra_companero` (`si`/`no`),
`acepta_politica` (`true`), `version_politica`, `companeros` (JSON `[{"nombre":"…"}]`), archivos `foto_1` a `foto_3`,
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `fbclid`, `sitio_web` (honeypot, debe ir vacío) y
`turnstile_token` (solo si Turnstile está activo).

Fotos: hasta 10 MB y 50 megapíxeles cada una (las de 48 MP del iPhone pasan). Las HEIC se convierten en un
worker aparte (30 s máximo por foto). A lo sumo 2 inscripciones con fotos se procesan a la vez y 20 esperan;
si llegan más, la respuesta es `503 OCUPADO` («Inténtalo de nuevo en un minuto»). Con las inscripciones
cerradas, `POST /inscripciones` responde `403 CERRADAS` antes de recibir las fotos. Los cuerpos JSON de
`/api/duelo` tienen límite de 10 KB (`400 JSON_INVALIDO`, `413 CUERPO_GRANDE`).

## Variables de entorno

Ver `src/duelo/duelo.env.example`. Si falta alguna obligatoria, el módulo responde 503 y Mantix sigue funcionando.
`DUELO_VERSION_POLITICA` debe coincidir con la versión del archivo `src/contenido/politica.js` del frontend.

## Pruebas

    npx jest src/duelo            # unitarias
    npm run duelo:db:test         # MySQL de prueba en Docker (puerto 3310)
    npm run test:duelo:int        # integración

## Despliegue

En este orden (cada paso deja Mantix funcionando):

1. **Fusionar y publicar** (con autorización de Edwin), desde el repositorio local:

       git checkout main && git pull
       git merge --no-ff feature/duelo
       git push origin main

2. **Desplegar el código** en el servidor con `deploy-mantix`
   (`bash ~/apps/mantix/mantix-backend/scripts/deploy-mantix.sh`). Como cambió `package.json`, el script corre
   `npm ci --omit=dev` (instala `archiver` y `heic-convert`) y reinicia PM2. **Es normal** que en este momento
   `/api/duelo/v1/*` responda `503 DUELO_DESHABILITADO`: sus variables todavía no existen. El resto de Mantix
   no se ve afectado y el health check del script (`/api-docs/`) pasa.
3. **Crear las tablas**, en `~/apps/mantix/mantix-backend` (usa las `DB_*` que ya tiene el `.env`):

       npm run duelo:migrate

4. **Crear la carpeta de fotos** con permiso de escritura para el usuario que corre PM2. Por defecto es
   `<backend>/datos/duelo/fotos` (`datos/` ya está ignorada por git):

       mkdir -p ~/apps/mantix/mantix-backend/datos/duelo/fotos
       chmod 750 ~/apps/mantix/mantix-backend/datos/duelo/fotos

   Si se usa otra, va en `DUELO_FOTOS_PATH`; una ruta relativa se toma desde la raíz del backend (no desde
   la carpeta en la que arranque PM2). Si la ruta queda dentro de `uploads/` (que Mantix publica), el módulo
   se niega a arrancar y responde 503.
5. **Agregar las variables `DUELO_*`** al `.env` de la raíz del backend (ver `src/duelo/duelo.env.example`).
   `DUELO_CONTACTO` es obligatoria en la práctica: su valor por defecto («nuestro equipo de Los Olivos») es
   un marcador, no un contacto real.
6. **Reiniciar con las variables nuevas:**

       pm2 restart mantix-backend --update-env

7. **Nginx:** agregar `docs/duelo/nginx-duelo.conf` al server de `mantix-api` (:8444), revisar las líneas
   opcionales de `limit_conn`/`limit_req` (sus zonas van en el bloque `http`), y luego:

       sudo nginx -t && sudo systemctl reload nginx

8. **Orígenes:** confirmar que `CORS_ORIGIN` (si está definida) y `DUELO_ORIGENES` incluyen
   `https://losolivoscucuta.com`, y también `https://www.losolivoscucuta.com` si el sitio responde en `www`.
   Si se cambia alguna, repetir el paso 6.
9. **Verificar:**

       curl https://mantix-api.losolivoscucuta.com:8444/api/duelo/v1/estado

   Debe responder `{"success":true,"data":{"abiertas":true,"versionPolitica":"…"}}`. Si responde 503, el
   motivo exacto está en el log de PM2 (`duelo deshabilitado: …`).

## Operación

- **Cupo del evento:** `DUELO_CUPO_MAXIMO=120` y reiniciar. Vacía = sin límite; un valor que no sea entero positivo
  (0, negativo, texto, decimal) deja el módulo en 503 (`duelo deshabilitado: …` en el log). Al llegar al cupo,
  `GET /estado` informa `abiertas: false` y `POST /inscripciones` responde `403 CERRADAS` (el formulario muestra su
  pantalla de cerrado); el conteo de `/estado` se guarda 5 s, pero el control al insertar es exacto aunque lleguen
  muchas a la vez. **Las inscripciones de prueba cuentan:** bórralas antes del lanzamiento. Para ampliar el cupo,
  sube el número y reinicia: las inscripciones se reabren. No confundir con `DUELO_LIMITE_INSCRIPCIONES`
  (envíos por IP cada 15 minutos, antiabuso).
- **Cerrar inscripciones:** `DUELO_INSCRIPCIONES_ABIERTAS=false` y reiniciar.
- **Corregir una inscripción:** a mano en `duelo_inscripciones` / `duelo_companeros`. Al borrar una inscripción,
  sus compañeros se borran en cascada; los archivos de foto hay que borrarlos aparte.
- **Correos no enviados:** el panel solo muestra «correo no enviado»; la causa está en la base:

      SELECT id, created_at, correo_error FROM duelo_inscripciones WHERE correo_enviado = 0 ORDER BY id;

- **Fotos que no se pudieron leer:** el usuario ve un 422 amable; en el log queda
  `duelo: no se pudo procesar una foto` con la clase del error, si era HEIC y su tamaño (sin datos personales).
  Muchas de estas líneas seguidas con `codigo: MODULE_NOT_FOUND` indican que falta una dependencia en el servidor.
- **Fotos huérfanas:** si Mantix se reinicia justo entre guardar una foto y confirmar la inscripción, el archivo
  queda en disco sin fila en la base. Es inofensivo (nadie lo sirve). Para encontrarlas, comparar los nombres
  de la carpeta con `SELECT foto_ruta FROM duelo_companeros;` y borrar los que no aparezcan.
- **Respaldo de fotos:** copiar la carpeta de `DUELO_FOTOS_PATH`.
