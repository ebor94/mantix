# Los errores de ventas no apagan el backend — diseño

**Fecha:** 2026-11-24
**Rama:** `fix/admin-catalogos-errores` · **Módulo:** `sv` (GenFlow) en `mantix-backend`
**Estado:** diseño aprobado por el usuario; alcance elegido: todo el módulo de ventas

## 1. Problema

Express 4 no recoge las promesas rechazadas de un handler async. `server.js` termina el proceso ante cualquier `unhandledRejection`, y hay un solo proceso (pm2 en modo fork, una instancia): un error sin capturar en ventas también corta Homenajes360, portería y los demás módulos hasta que pm2 lo levanta.

**Reproducido el 2026-11-24** en un proceso aislado, sin base de datos, con las rutas, los controladores y los servicios reales y modelos falsos. El proceso terminó en todos estos casos:

| Caso | Resultado |
|---|---|
| Editar una fuente con un código que ya existe | `SequelizeUniqueConstraintError` → `process.exit(1)` |
| Base caída al editar, crear, listar, activar un catálogo o cargar el bootstrap | `SequelizeConnectionError` → `process.exit(1)` |
| Carga masiva: CSV con una fila de más columnas | `CSV_RECORD_INCONSISTENT_COLUMNS` → `process.exit(1)` |
| Carga masiva: CSV con una comilla sin cerrar | `CSV_QUOTE_NOT_CLOSED` → `process.exit(1)` |

**Tamaño.** Un conteo automático sobre `src/sv/controllers` encontró 136 handlers: 58 sin `try/catch` y 36 que lo tienen pero relanzan (`throw e`). En total, 94 expuestos. El conteo es aproximado; a mano se revisaron los de prospectos, reportes, listas y catálogos.

## 2. Decisiones del usuario

- Alcance: todo el módulo de ventas, con un envoltorio en un solo lugar. No los demás módulos.
- Editar un catálogo con un código repetido responde 409 "Código duplicado".

## 3. Diseño

### 3.1 `src/sv/utils/capturarAsync.js`

`capturarAsync(router)` recorre `router.stack` y los subrouters, y reemplaza cada `layer.handle` por uno que pasa el rechazo de su promesa a `next`.

- No toca los manejadores de error (cuatro argumentos).
- Es idempotente: un handler ya envuelto no se envuelve otra vez.
- Un rechazo sin motivo (`Promise.reject()`) pasa a `next` como `Error('Promesa rechazada sin motivo')`; `next(undefined)` seguiría como si no hubiera error.
- Si la respuesta ya terminó (`res.writableEnded`), solo se anota en el log. Llamar a `next` ahí cortaría la conexión y podría truncar una respuesta correcta.

Depende de la estructura interna de Express 4 (4.21.2 instalado). Express 5 reenvía los rechazos por sí mismo: al migrar, este archivo se elimina.

### 3.2 `src/sv/middleware/svErrorHandler.js`

Último middleware del router de ventas, como ya hacen horno y portería.

| Condición, en este orden | Respuesta |
|---|---|
| `res.headersSent` | `next(err)` |
| `err.code` es `VALIDATION_ERROR` | 422 con ese código y su mensaje |
| `err.code` es `NOT_FOUND` | 404 |
| `err.code` es `FORBIDDEN` | 403 |
| `err.code` es `CONFLICT`, `DUPLICATE`, `DUPLICATE_PHONE`, `DUPLICATE_NIT` o `DUPLICATE_EMAIL` | 409 |
| `err.name` es `SequelizeValidationError`, `SequelizeUniqueConstraintError`, `SequelizeDatabaseError` o `MulterError` | `next(err)`: lo responde el manejador global, que ya traduce esos casos |
| Cualquier otro | 500 `INTERNAL_ERROR`, "Error interno. Intenta de nuevo en unos minutos." |

El 500 anota en el log el mensaje, la pila, el método y la ruta sin la query, que puede traer nombres o teléfonos. Al cliente no le llega el texto interno.

### 3.3 `src/sv/routes/index.js`

Después de montar todas las rutas: `capturarAsync(router)` y `router.use(svErrorHandler)`. Una prueba verifica que todas las `*.routes.js` de la carpeta están montadas antes de esa línea y quedan cubiertas.

### 3.4 Catálogos

`updateFactory` de `config.controller.js` responde 409 `VALIDATION_ERROR` "Código duplicado" ante `SequelizeUniqueConstraintError`, igual que `createFactory`. Los demás errores siguen hacia el manejador.

### 3.5 Mensajes que el 500 genérico escondería

Estos errores no llevan `code`, así que quedarían como "Error interno". Pasan a llevar `code = 'VALIDATION_ERROR'` (422):

| Dónde | Mensaje |
|---|---|
| `listas.controller.js`, filtro de archivo | "Solo se aceptan archivos CSV" (igual que hoy) |
| `fidelizacion.controller.js`, filtro de archivo | "Solo se aceptan imágenes (jpg/png/webp)" (igual que hoy) |
| `listas.service.js`, grupo sin estados | "No hay estados activos configurados para el grupo" (igual que hoy) |
| `listas.service.js`, CSV mal formado | "El archivo CSV no es válido (línea N). Revisa que todas las filas tengan las mismas columnas y que no falten comillas." |

La lista sigue quedando como `fallida`, con el detalle técnico en `lista_log`.

## 4. Qué cambia para el usuario

- Donde hoy se cae el sistema, ve un mensaje.
- Los handlers que ya usaban `next(e)` (salas, gestiones, personas, usuarios, `/me`) muestran el mensaje genérico en los 500 en vez del texto interno.
- Rutas, permisos y respuestas correctas no cambian.

## 5. Pruebas

Jest y supertest, solo con `jest.mock`/`jest.doMock`: nunca `sequelize.sync` ni conexión a la base. Los servidores de prueba escuchan en `127.0.0.1` (supertest 6.3.4 falla de forma intermitente en macOS si escuchan en `::`).

- `capturarAsync`: handler, middleware y subrouter async; varios handlers por ruta; error síncrono; rechazo sin motivo; manejadores de error intactos; doble aplicación; error después de responder; error con la respuesta a medias; respuestas correctas sin cambios.
- `svErrorHandler`: cada fila de la tabla, y que el log no lleve la query.
- Catálogos: los seis casos reproducidos y los caminos felices.
- Cobertura: todas las rutas de `src/sv/routes` montadas y capturadas.
- Listas: CSV mal formado, grupo sin estados, archivo que no es CSV. Fidelización: archivo que no es imagen.

## 6. Despliegue

Solo backend: `deploy-mantix`. Sin migración ni cambios en GenFlow. Reversión: revertir el merge y volver a desplegar.

## 7. Fuera de alcance (seguimientos)

- Los demás módulos del backend.
- Promesas lanzadas sin esperar y tareas programadas: siguen pudiendo terminar el proceso.
- `propuestas.controller.previewPdf` envía un stream sin escuchar su evento `error`. Por cómo funciona Node, una falla a mitad del envío terminaría el proceso; no se reprodujo.
- CSV separado por punto y coma, como lo guarda Excel en español: no falla, pero se lee como una sola columna, así que por el código todas las filas quedarían como error.
- El CSV subido no se borra cuando la carga falla (queda en `uploads/sv`).
