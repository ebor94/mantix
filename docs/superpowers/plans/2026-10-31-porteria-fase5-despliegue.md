# Portería — Fase 5 (despliegue y piloto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar Portería lista para producción: front publicable en Apache (AppServ), verificación de serfuweb y runbook para TI, código integrado y publicado en `main` de los dos repos, front copiado al share y piloto en una sede.

**Architecture:** El backend se publica con el flujo existente de Mantix (`main` → `scripts/deploy-mantix.sh` en srv-backend con PM2). Sin las variables `PORTERIA_*` el módulo responde 503 y Mantix no cambia, así que el código puede llegar a `main` antes de que TI habilite el módulo. TI corre la verificación de solo lectura, las migraciones, la siembra y pone las variables siguiendo un runbook. El front se compila con la URL de la API de producción y se copia a `www/porteria` del share de AppServ, con un `.htaccess` para Apache 2.2.

**Tech Stack:** Node.js/Express (Mantix), MySQL 8 (serfuweb), PM2, Apache 2.2 (AppServ, Windows), Vue 3 + Vite 7 + vite-plugin-pwa, Jest, Vitest.

**Diseño de referencia:** `docs/superpowers/specs/2026-10-29-porteria-design.md` §9, §10, §12 y §13; índice `2026-10-30-porteria-00-indice.md`, sección "Fase 5".

## Global Constraints

- Nadie de este plan se conecta a la base de producción `serfuweb`: las comprobaciones contra ella las corre TI con el script de la Task 2.
- Decisiones del usuario (2026-10-31): el controlador hace push directo a `main` de `ebor94/mantix` y de `ebor94/porteriasfn`, y copia el front a `smb://192.9.17.11/AppServ/www/porteria` (montado en `/Volumes/AppServ/www/porteria`). URL del front: `https://losolivoscucuta.com/porteria/`. Los grupos del AD no existen: los crea TI.
- El servidor del front es Apache 2.2 en Windows (AppServ): solo directivas de Apache 2.2 (nada de `Require`), todo lo que dependa de un módulo dentro de `<IfModule>`, mismo patrón que `www/genflow/.htaccess` y `www/bigDay-encuesta/.htaccess`.
- En el share solo se escribe dentro de `www/porteria`; nunca se borra ni se toca otra carpeta.
- API de producción: `VITE_API_URL=https://mantix-api.losolivoscucuta.com:8444/api`.
- El front se publica después de que TI confirme que `GET /api/porteria/v1/health` responde 200 en producción.
- Mensajes y documentos en español. Commits con trailer `Co-Authored-By:` del modelo que los escribe.

## Antes de empezar

- Backend: rama `feature/porteria` limpia (Fases 0–4 cerradas); `npm run porteria:db:test` arriba.
- Front: rama `feature/admin` limpia (245 pruebas, build OK).

## Mapa de archivos

| Repo | Archivo | Cambio |
|---|---|---|
| porteriasfn | `public/.htaccess` | Nuevo: fallback de SPA y `no-cache` para Apache 2.2 |
| porteriasfn | `public/icono-192.png`, `public/icono-512.png` | Nuevos: íconos para instalar en Android |
| porteriasfn | `vite.config.js` | Manifest con los PNG; `globPatterns` incluye `png` |
| porteriasfn | `src/__tests__/despliegue.spec.js` | Nuevo: el `.htaccess`, los íconos y el manifest |
| porteriasfn | `package.json` / `package-lock.json` | Solo si `npm audit --omit=dev` reporta algo corregible |
| porteriasfn | `README.md` | Sección de despliegue para AppServ (reemplaza el ejemplo de nginx) |
| mantix | `src/porteria/scripts/verificarProduccion.sql` | Nuevo: comprobaciones de solo lectura para serfuweb |
| mantix | `src/porteria/__tests__/verificarProduccion.int.test.js` | Nuevo: el script corre en MySQL 8 |
| mantix | `docs/porteria/despliegue.md` | Nuevo: runbook para TI y checklist del piloto |

---

### Task 1: Front publicable en Apache (AppServ)

**Files:**
- Create: `public/.htaccess`, `public/icono-192.png`, `public/icono-512.png`, `src/__tests__/despliegue.spec.js`
- Modify: `vite.config.js`, `README.md` (sección "Despliegue")
- Repo: `porteriasfn`, rama `feature/admin`.

**Interfaces:**
- Produces: `dist/.htaccess` y los íconos en `dist/` tras `npm run build` (Vite copia `public/` tal cual).

- [ ] **Step 1: Escribir la prueba que falla**

`src/__tests__/despliegue.spec.js`:

```js
// Lo que necesita el front publicado en Apache 2.2 (AppServ) bajo /porteria/.
import { test, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = (ruta) => fileURLToPath(new URL(`../../${ruta}`, import.meta.url))
const leer = (ruta) => readFileSync(raiz(ruta), 'utf8')

// Ancho y alto de un PNG: bytes 16–23 del encabezado IHDR.
function tamanoPng(ruta) {
  const b = readFileSync(raiz(ruta))
  expect(b.subarray(1, 4).toString()).toBe('PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

test('.htaccess: fallback de SPA en /porteria/ y sin caché para index.html y sw.js', () => {
  const h = leer('public/.htaccess')
  expect(h).toMatch(/RewriteBase \/porteria\//)
  expect(h).toMatch(/RewriteRule \^ index\.html \[L\]/)
  expect(h).toMatch(/<FilesMatch "\^\(index\\\.html\|sw\\\.js\)\$">/)
  expect(h).toMatch(/no-cache/)
  // Apache 2.2: sin directivas de 2.4.
  expect(h).not.toMatch(/^\s*Require\s/m)
})

test('íconos PNG de 192 y 512 para instalar en Android', () => {
  expect(tamanoPng('public/icono-192.png')).toEqual([192, 192])
  expect(tamanoPng('public/icono-512.png')).toEqual([512, 512])
})

test('el manifest declara los PNG y el service worker los precachea', () => {
  const v = leer('vite.config.js')
  expect(v).toMatch(/src: 'icono-192\.png', sizes: '192x192', type: 'image\/png'/)
  expect(v).toMatch(/src: 'icono-512\.png', sizes: '512x512', type: 'image\/png'/)
  expect(v).toMatch(/globPatterns: \['\*\*\/\*\.\{js,css,html,svg,png\}'\]/)
  expect(existsSync(raiz('public/favicon.svg'))).toBe(true)
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/__tests__/despliegue.spec.js`
Expected: FAIL (no existen `public/.htaccess` ni los PNG; el manifest solo tiene el SVG).

- [ ] **Step 3: Implementar**

`public/.htaccess`:

```apache
# Portería (Vue 3 + Vite) bajo /porteria/ — AppServ (Apache 2.2 en Windows).
# Vite lo copia de public/ a dist/ en cada build: es la única fuente; no editarlo en el servidor.
# Solo directivas de Apache 2.2 (sin Require/Order de 2.4). Lo que depende de un módulo va en <IfModule>.

Options -Indexes -MultiViews
DirectoryIndex index.html

# La app usa rutas del historial (/porteria/inicio, /porteria/admin/…): todo lo que no sea un archivo
# o carpeta real se sirve con index.html. mod_rewrite en .htaccess exige FollowSymLinks.
<IfModule mod_rewrite.c>
  Options +FollowSymLinks
  RewriteEngine On
  RewriteBase /porteria/
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  RewriteRule ^ index.html [L]
</IfModule>

# index.html y el service worker nunca se cachean: así una versión nueva llega a las casetas.
<IfModule mod_headers.c>
  <FilesMatch "^(index\.html|sw\.js)$">
    Header set Cache-Control "no-cache, no-store, must-revalidate, max-age=0"
    Header set Pragma "no-cache"
    Header set Expires "0"
  </FilesMatch>
</IfModule>

<IfModule mod_mime.c>
  AddType application/javascript .js
  AddType application/manifest+json .webmanifest
  AddType image/svg+xml .svg
  AddType image/png .png
</IfModule>
```

Íconos (a partir de `public/favicon.svg`, sin dependencias nuevas). Generar con Quick Look de macOS y fijar el tamaño con `sips`:

```bash
cd public
qlmanage -t -s 512 -o /tmp favicon.svg && mv /tmp/favicon.svg.png icono-512.png
sips -z 512 512 icono-512.png
sips -z 192 192 icono-512.png --out icono-192.png
sips -g pixelWidth -g pixelHeight icono-192.png icono-512.png
```

Si `qlmanage` deja un fondo blanco o recorta, usar `sips -s format png favicon.svg --out icono-512.png` (macOS reciente lee SVG) y redimensionar igual. Abrir los dos PNG y comprobar a ojo que muestran el ícono verde completo; reportar el método usado.

En `vite.config.js`, dentro de `manifest`, `icons` pasa a:

```js
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' }
        ]
```

y en `workbox`: `globPatterns: ['**/*.{js,css,html,svg,png}'],`.

`README.md`, sección "Despliegue": reemplazar los pasos 2 y 3 (nginx) por:

```markdown
2. Copiar el contenido de `dist/` a `www/porteria` del share de AppServ (`smb://192.9.17.11/AppServ/www/porteria`). Incluye `.htaccess` (viene de `public/`): no editarlo en el servidor.
3. AppServ es Apache 2.2: el `.htaccess` hace el fallback de la SPA (`/porteria/*` → `index.html`) y sirve `index.html` y `sw.js` sin caché. Necesita `mod_rewrite` y `mod_headers` (están cargados) y que `AllowOverride` permita `FileInfo`, `Options` e `Indexes` para `www/porteria`. Si una ruta profunda recargada da 404, revisar `AllowOverride`.
```

(los pasos 1, 4 y 5 quedan igual).

Dependencias de producción: correr `npm audit --omit=dev`. Si reporta vulnerabilidades con arreglo sin cambio de versión mayor, `npm audit fix --omit=dev` y volver a correr `npm test` y `npm run build`. Si el arreglo exige versión mayor, no aplicarlo: copiar la salida al reporte.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm test` y `npm run build`; luego `ls -la dist/.htaccess dist/icono-192.png dist/icono-512.png` y `grep -o 'icono-512.png' dist/manifest.webmanifest`.
Expected: todo en verde; los tres archivos en `dist/`; el manifest nombra el PNG.

- [ ] **Step 5: Commit**

```bash
git add public/.htaccess public/icono-192.png public/icono-512.png vite.config.js README.md src/__tests__/despliegue.spec.js
git add package.json package-lock.json   # solo si npm audit fix los cambió
git commit -m "feat: publicación en AppServ (.htaccess de Apache 2.2 e íconos PNG para instalar)"
```

---

### Task 2: Verificación de serfuweb y runbook para TI

**Files:**
- Create: `src/porteria/scripts/verificarProduccion.sql`, `src/porteria/__tests__/verificarProduccion.int.test.js`, `docs/porteria/despliegue.md`
- Repo: `mantix`, rama `feature/porteria`.

**Interfaces:**
- Produces: un script de solo lectura que TI corre con el cliente `mysql` contra serfuweb, y el runbook que el controlador entrega a TI.

- [ ] **Step 1: Escribir la prueba que falla**

`src/porteria/__tests__/verificarProduccion.int.test.js`:

```js
// src/porteria/__tests__/verificarProduccion.int.test.js
// El script de verificación de producción corre en MySQL 8 y solo lee.
const fs = require('fs');
const path = require('path');
const { abrirConexion } = require('../testing/bd');

const SQL = fs.readFileSync(path.join(__dirname, '../scripts/verificarProduccion.sql'), 'utf8');

let conn;
beforeAll(async () => { conn = await abrirConexion(); });
afterAll(async () => { await conn.end(); });

test('solo tiene sentencias de lectura', () => {
  const sentencias = SQL.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
  expect(sentencias.length).toBeGreaterThanOrEqual(6);
  for (const s of sentencias) expect(s).toMatch(/^(SELECT|SHOW)\b/i);
});

test('corre completo y la versión del servidor de pruebas cumple', async () => {
  const [resultados] = await conn.query(SQL);
  const filas = resultados.filter(Array.isArray).flat();
  const chequeo = (nombre) => filas.find((f) => f.chequeo === nombre);
  expect(chequeo('version')).toMatchObject({ ok: 'SI' });
  expect(chequeo('exequias.fecha')).toMatchObject({ valor: 'date', ok: 'SI' });
  expect(chequeo('placas_con_espacios_raros')).toMatchObject({ ok: 'SI' });
  for (const nombre of ['time_zone_global', 'innodb_lock_wait_timeout', 'collation_base', 'collation_vehiculos.placa']) {
    expect(chequeo(nombre)).toBeDefined();
  }
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:porteria:int -- verificarProduccion`
Expected: FAIL (`ENOENT … verificarProduccion.sql`).

- [ ] **Step 3: Implementar**

`src/porteria/scripts/verificarProduccion.sql`:

```sql
-- Verificación de solo lectura de la base de producción antes de migrar Portería.
-- La corre TI con el usuario de Mantix (DB_USER) contra la base de Mantix (DB_NAME, por defecto serfuweb):
--   mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < src/porteria/scripts/verificarProduccion.sql
-- Cada consulta devuelve (chequeo, valor, ok). ok = 'NO' detiene el despliegue; 'REVISAR' se anota y se decide.
-- No escribe nada.

-- FOR UPDATE OF exige MySQL >= 8.0.1 (MariaDB y 5.7 no lo aceptan).
SELECT 'version' AS chequeo, VERSION() AS valor,
       CASE WHEN VERSION() LIKE '%MariaDB%' THEN 'NO'
            WHEN CAST(SUBSTRING_INDEX(v, '.', 1) AS UNSIGNED) * 10000
               + CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(v, '.', 2), '.', -1) AS UNSIGNED) * 100
               + CAST(SUBSTRING_INDEX(v, '.', -1) AS UNSIGNED) >= 80001 THEN 'SI'
            ELSE 'NO' END AS ok
  FROM (SELECT SUBSTRING_INDEX(VERSION(), '-', 1) AS v) AS x;

-- El módulo fija time_zone '-05:00' en cada conexión; se anota la del servidor.
SELECT 'time_zone_global' AS chequeo, @@global.time_zone AS valor, 'REVISAR' AS ok;

-- Las esperas de bloqueo comparten el pool de 10 conexiones; compararlo con el timeout de nginx/Apache.
SELECT 'innodb_lock_wait_timeout' AS chequeo, @@innodb_lock_wait_timeout AS valor,
       CASE WHEN @@innodb_lock_wait_timeout <= 50 THEN 'SI' ELSE 'REVISAR' END AS ok;

-- Las tablas por_* se crean con utf8mb4_unicode_ci; vehiculos.placa se compara con por_*.placa.
SELECT 'collation_base' AS chequeo, DEFAULT_COLLATION_NAME AS valor,
       CASE WHEN DEFAULT_CHARACTER_SET_NAME = 'utf8mb4' THEN 'SI' ELSE 'REVISAR' END AS ok
  FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE();

SELECT 'collation_vehiculos.placa' AS chequeo, COLLATION_NAME AS valor,
       CASE WHEN COLLATION_NAME = 'utf8mb4_unicode_ci' THEN 'SI' ELSE 'REVISAR' END AS ok
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehiculos' AND COLUMN_NAME = 'placa';

-- La búsqueda de exequias (hoy ±1 día) asume que fecha es DATE.
SELECT 'exequias.fecha' AS chequeo, DATA_TYPE AS valor, CASE WHEN DATA_TYPE = 'date' THEN 'SI' ELSE 'NO' END AS ok
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exequias' AND COLUMN_NAME = 'fecha';

-- Placas con tabulaciones o espacios no separables: la normalización no las reconocería.
SELECT 'placas_con_espacios_raros' AS chequeo, COUNT(*) AS valor, CASE WHEN COUNT(*) = 0 THEN 'SI' ELSE 'REVISAR' END AS ok
  FROM vehiculos
 WHERE placa LIKE CONCAT('%', CHAR(9), '%') OR placa LIKE CONCAT('%', UNHEX('C2A0'), '%');

-- Permisos del usuario: las migraciones necesitan CREATE, ALTER, INDEX, REFERENCES y CREATE VIEW sobre la base.
SHOW GRANTS FOR CURRENT_USER;
```

Nota: si la base de pruebas no tiene permisos para `SHOW GRANTS FOR CURRENT_USER`, la prueba lo mostrará; la sentencia es estándar en MySQL 8 y la puede correr cualquier usuario sobre sí mismo.

`docs/porteria/despliegue.md`: el runbook completo, con este contenido:

````markdown
# Portería — Despliegue en producción (runbook para TI)

Módulo de control de ingresos y salidas de vehículos. Backend dentro de Mantix (`/api/porteria/v1`), front en `https://losolivoscucuta.com/porteria/`.

Orden: **1 → 9**. Cada paso dice cómo comprobarlo y cómo deshacerlo. Hasta el paso 7, Mantix funciona igual que hoy: sin las variables `PORTERIA_*` el módulo responde 503 y nada más cambia.

## 1. Grupos del AD

Crear dos grupos de seguridad (nombres sugeridos; si se usan otros, ponerlos en el paso 6):

- `Porteria-Guardas`: guardas de las casetas.
- `Porteria-Admin`: quienes administran motivos, proveedores y consultan reportes.

Agregar los usuarios del piloto. El rol se decide por el CN exacto del grupo. Un usuario en los dos grupos entra como administrador.

Deshacer: borrar los grupos.

## 2. Publicar el código (deploy de Mantix)

El código ya está en `origin/main` de `ebor94/mantix`. En srv-backend:

```bash
bash ~/apps/mantix/mantix-backend/scripts/deploy-mantix.sh
```

Comprobar: el script termina en "deploy exitoso"; `curl -s https://mantix-api.losolivoscucuta.com:8444/api/porteria/v1/health` responde **503** con `"motivo":"PORTERIA_DESHABILITADO"` (es lo esperado todavía) y las demás pantallas de Mantix funcionan.

Deshacer: el script hace rollback solo si el health check de Mantix falla. A mano: `git reset --hard <sha anterior>` en `~/apps/mantix/mantix-backend` y `pm2 restart mantix-backend --update-env`.

## 3. Verificar la base (solo lectura)

Desde `~/apps/mantix/mantix-backend`, con el usuario y la base de Mantix (los del `.env`):

```bash
mysql -h <DB_HOST> -u <DB_USER> -p <DB_NAME> < src/porteria/scripts/verificarProduccion.sql
```

- `version` debe ser **SI** (MySQL ≥ 8.0.1). Si es **NO**, detener: corregir y anular registros fallarían.
- `exequias.fecha` debe ser **SI**.
- Anotar `time_zone_global`, `innodb_lock_wait_timeout`, las collations y `placas_con_espacios_raros` y enviarlos al equipo de desarrollo si alguno dice **REVISAR**.
- En `SHOW GRANTS` el usuario debe tener `CREATE`, `ALTER`, `INDEX`, `REFERENCES` y `CREATE VIEW` sobre la base (o `ALL PRIVILEGES`).

## 4. Migraciones

En `~/apps/mantix/mantix-backend`:

```bash
npm run porteria:migrate
```

Esperado: `aplicada 001_esquema.sql` … `aplicada 007_admin_e_idempotencia.sql` y `7 migración(es) aplicada(s)`. Una segunda corrida dice `Sin migraciones pendientes`.

Las migraciones solo crean tablas `por_*` y la vista `v_por_movimientos`. No tocan tablas de H360.

Si falla a la mitad: la 007 hace dos `ALTER` y no es atómica. Revisar `SHOW CREATE TABLE por_eventos` (columna `clave_cliente` e índice `uq_por_eventos_clave`) y `SHOW CREATE TABLE por_auditoria` (`ELIMINAR` en `accion`) antes de reintentar, y avisar.

Deshacer (solo si se abandona el módulo): `DROP VIEW v_por_movimientos;` y `DROP TABLE` de `por_auditoria, por_eventos, por_estado_vehiculo, por_vehiculos_externos, por_motivos, por_migraciones`, en ese orden.

## 5. Siembra de la sede piloto

Marca como **dentro** de la sede a los vehículos de la empresa que están allí el día de arranque. Primero simular:

```bash
npm run porteria:sembrar -- --sede <id_sede> --placas ABC123,XYZ789 --simular
```

Revisar la lista ("se sembrarían" / "se omitirían"). El comando imprime la base y la sede antes de actuar y sale con código 2 si una placa no es un vehículo activo de la empresa. Luego, sin `--simular`:

```bash
npm run porteria:sembrar -- --sede <id_sede> --placas ABC123,XYZ789
```

`--todos` siembra en esa sede **todos** los propios activos sin estado: usarlo solo si toda la flota arranca en esa sede. Se puede repetir sin duplicar. Nunca pisa un estado existente.

Deshacer (solo filas sin eventos):

```sql
DELETE FROM por_estado_vehiculo WHERE sede_id = <id_sede> AND ultimo_evento_id IS NULL AND sembrado_at IS NOT NULL;
```

## 6. Variables del módulo

En el `.env` de `~/apps/mantix/mantix-backend` agregar:

```
PORTERIA_JWT_SECRET=<48+ caracteres aleatorios, distinto de JWT_SECRET, IDENTIDAD_JWT_SECRET y TRK_JWT_SECRET>
PORTERIA_JWT_EXPIRES=12h
LDAP_GROUP_PORTERIA_GUARDA=Porteria-Guardas
LDAP_GROUP_PORTERIA_ADMIN=Porteria-Admin
```

Generar el secreto con `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"`.

CORS: si el `.env` define `CORS_ORIGIN`, agregarle `https://losolivoscucuta.com` (separado por comas). Si no lo define, ese origen ya está permitido por defecto.

## 7. Habilitar

```bash
pm2 restart mantix-backend --update-env
curl -s https://mantix-api.losolivoscucuta.com:8444/api/porteria/v1/health
```

Esperado: `{"success":true,"data":{"estado":"ok","bd":"ok"}}`. Si sigue el 503, `pm2 logs mantix-backend --lines 50` muestra `porteria deshabilitado: <motivo>` con la variable que falta.

Swagger: `https://mantix-api.losolivoscucuta.com:8444/api-docs` muestra las rutas de Portería.

Avisar al equipo de desarrollo: con el health en 200 se publica el front (`https://losolivoscucuta.com/porteria/`).

Deshacer: quitar `PORTERIA_JWT_SECRET` del `.env` y `pm2 restart mantix-backend --update-env` (el módulo vuelve a 503; los datos quedan).

## 8. Primer ingreso

1. Un administrador entra en `https://losolivoscucuta.com/porteria/` con su usuario del AD: llega a "Administración". Revisar Motivos (12 de fábrica) y Proveedores.
2. Un guarda entra, elige la sede piloto y ve en "Vehículos" los sembrados como dentro.

Si el login responde "Tu usuario no tiene acceso a Portería. Contacta a TI.", el usuario no está en ninguno de los dos grupos (revisar el CN exacto del paso 1).

## 9. Checklist del piloto (sede piloto, primer turno)

- [ ] Instalar la app en la tablet o el celular de la caseta (Chrome → "Instalar app" / "Agregar a pantalla principal") y abrirla desde el ícono.
- [ ] Registrar una salida y un ingreso reales de un vehículo de la empresa (con conductor, motivo y km) y uno de un proveedor (guardando la placa en el catálogo).
- [ ] Ver el viaje en Administración → Movimientos y descargar el Excel (desde un computador).
- [ ] Recargar el navegador en una pantalla interna (p. ej. Vehículos): debe seguir en esa pantalla.
- [ ] Modo avión: la app abre y avisa "Sin conexión"; al volver la red, "Reintentar" funciona.
- [ ] Con el backend detenido unos segundos (`pm2 stop mantix-backend`, solo en una ventana acordada): la app avisa que el servidor no responde; al iniciarlo (`pm2 start mantix-backend`) vuelve a funcionar.
- [ ] Con el AD caído o una contraseña errada: el login muestra el error correcto.
- [ ] Al vencer la sesión (12 h, o con `PORTERIA_JWT_EXPIRES=5m` en una prueba), la app vuelve al login con "Tu sesión venció. Vuelve a entrar."
- [ ] Un registro forzado ("Registrar igual") aparece marcado como inconsistente en Movimientos.

Anotar cualquier diferencia y enviarla al equipo de desarrollo.
````

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:porteria:int -- verificarProduccion` y luego `npm run test:porteria:int` y `npx jest src/porteria`.
Expected: PASS todo.

- [ ] **Step 5: Commit**

```bash
git add src/porteria/scripts/verificarProduccion.sql src/porteria/__tests__/verificarProduccion.int.test.js docs/porteria/despliegue.md
git commit -m "docs(porteria): verificación de solo lectura de serfuweb y runbook de despliegue para TI"
```

---

### Task 3 (controlador): Integrar y publicar el backend en `main`

Lo hace el controlador (autorizado por el usuario: push directo a `main`).

- [ ] `git fetch origin` y comprobar que `origin/main` es ancestro de `feature/porteria` (`git merge-base --is-ancestor origin/main feature/porteria`). Si `main` avanzó, integrar `origin/main` en `feature/porteria`, resolver y volver a correr las pruebas antes de seguir.
- [ ] Pruebas: `npx jest src/porteria`, `npm run test:porteria:int` y `npx jest` completo. Solo deben fallar las 3 suites preexistentes (afiliadoEmpresaAccess, grupoIndivII, invitacion.service); comprobar que también fallan en `origin/main` corriéndolas en un worktree temporal de `origin/main` (`git worktree add /tmp/mantix-main origin/main`, `npm ci` ahí, `npx jest <las 3>`, luego `git worktree remove`).
- [ ] `git checkout main && git merge --ff-only feature/porteria && git push origin main`. Volver a `feature/porteria`.
- [ ] Comprobar en GitHub (`git ls-remote origin main`) que `main` apunta al último commit.

### Task 4 (controlador): Integrar y publicar el front en `main`

- [ ] En `porteriasfn`: `git checkout -b main feature/admin` (el remoto está vacío), `npm test`, `npm run build`, `git push -u origin main`. Volver a `feature/admin`.

### Task 5 (TI): Runbook pasos 1–7

- [ ] El controlador entrega `docs/porteria/despliegue.md` al usuario para TI y espera la confirmación de que `GET /api/porteria/v1/health` responde 200 en producción.

### Task 6 (controlador): Publicar el front en el share

Requiere la Task 5 confirmada.

- [ ] En `porteriasfn` (rama `main`): `cp .env.production.example .env.production`, `npm ci`, `npm run build`.
- [ ] Comprobar que el share está montado (`mount | grep /Volumes/AppServ`) y que `/Volumes/AppServ/www/porteria` existe. Si ya tiene archivos, copiarlos antes a `/Volumes/AppServ/www/porteria-respaldo-<AAAAMMDD-HHMM>`.
- [ ] Copiar: `rsync -rt --delete dist/ /Volumes/AppServ/www/porteria/` (el `--delete` actúa solo dentro de `www/porteria`; comprobar el destino exacto antes de correrlo). Comprobar con `ls -la /Volumes/AppServ/www/porteria` que están `index.html`, `.htaccess`, `sw.js`, `manifest.webmanifest`, `assets/` y los PNG.
- [ ] Navegador: `https://losolivoscucuta.com/porteria/` muestra el login; `https://losolivoscucuta.com/porteria/admin/motivos` (ruta profunda) también carga la app (no 404); en la pestaña de red `index.html` y `sw.js` llegan con `Cache-Control: no-cache…`; el manifest carga con los PNG; el service worker queda registrado (Application → Service Workers); la llamada a `/auth/me` o `/health` va a `mantix-api.losolivoscucuta.com:8444` sin error de CORS.
- [ ] Deshacer: restaurar el respaldo o vaciar `www/porteria`.

### Task 7: Cierre

- [ ] Actualizar el índice (Fase 5: código publicado; pendiente el piloto con el checklist del runbook) y el ledger; commit en `feature/porteria` y fast-forward de `main` + push (es solo documentación).
