# Módulo Duelo · Inscripción al II Taller de Duelo Animal

API del formulario público `https://losolivoscucuta.com/Duelomascotas` y de su panel interno.
Montado en `/api/duelo/v1`. El frontend vive en el repositorio `Duelomascotas`.

## Endpoints

| Método y ruta | Acceso | Qué hace |
|---|---|---|
| `GET /estado` | Público | `{ abiertas, versionPolitica }` |
| `POST /inscripciones` | Público (`multipart/form-data`) | Crea la inscripción con hasta 3 fotos |
| `POST /panel/login` | Público, 5 intentos / 15 min | Token del panel (2 h) |
| `GET /panel/inscripciones?q=` | Token | Listado, búsqueda y totales |
| `GET /panel/fotos/:id` | Token | Foto de un compañero |
| `GET /panel/exportar.xlsx` | Token | Excel para certificados |
| `GET /panel/fotos.zip` | Token | Fotos nombradas `cedula_orden_nombre-companero.jpg` |

Campos de `POST /inscripciones`: `nombre_completo`, `cedula`, `celular`, `correo`, `honra_companero` (`si`/`no`),
`acepta_politica` (`true`), `version_politica`, `companeros` (JSON `[{"nombre":"…"}]`), archivos `foto_1` a `foto_3`,
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `fbclid`, `sitio_web` (honeypot, debe ir vacío) y
`turnstile_token` (solo si Turnstile está activo).

## Variables de entorno

Ver `src/duelo/duelo.env.example`. Si falta alguna obligatoria, el módulo responde 503 y Mantix sigue funcionando.
`DUELO_VERSION_POLITICA` debe coincidir con la versión del archivo `src/contenido/politica.js` del frontend.

## Pruebas

    npx jest src/duelo            # unitarias
    npm run duelo:db:test         # MySQL de prueba en Docker (puerto 3310)
    npm run test:duelo:int        # integración

## Despliegue

1. Agregar las variables `DUELO_*` al `.env` del servidor.
2. `npm run duelo:migrate`
3. Crear la carpeta de `DUELO_FOTOS_PATH` (por defecto `datos/duelo/fotos`, ya ignorada por git) con permisos de
   escritura para el usuario de PM2. Nunca dentro de `uploads/`.
4. Agregar `docs/duelo/nginx-duelo.conf` al server de `mantix-api` y recargar Nginx.
5. Confirmar que `CORS_ORIGIN` (si está definida) incluye `https://losolivoscucuta.com`.
6. `deploy-mantix` (instala `archiver` y `heic-convert`, reinicia PM2).
7. Verificar: `curl https://mantix-api.losolivoscucuta.com:8444/api/duelo/v1/estado`

## Operación

- **Cerrar inscripciones:** `DUELO_INSCRIPCIONES_ABIERTAS=false` y reiniciar.
- **Corregir una inscripción:** a mano en `duelo_inscripciones` / `duelo_companeros`. Al borrar una inscripción,
  sus compañeros se borran en cascada; los archivos de foto hay que borrarlos aparte.
- **Correos no enviados:** columna `correo_enviado = 0` y `correo_error` (también visible en el panel).
- **Respaldo de fotos:** copiar la carpeta de `DUELO_FOTOS_PATH`.
