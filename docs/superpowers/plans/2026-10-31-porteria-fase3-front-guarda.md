# Portería — Fase 3 (front del guarda) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SPA del guarda de portería (Vue 3) en el repo `porteriasfn`: login con el AD, sede de turno, inicio con contadores, asistente de registro de ingresos/salidas (con el diálogo "registrar igual"), vehículos dentro / propios fuera, y movimientos del día con anular y corregir.

**Architecture:** Mismo patrón que `peludos` (TRIKIPELUDOS): Vite + Vue 3 `<script setup>`, Pinia (options API), Vue Router con una guardia probable como función, cliente axios que normaliza errores al contrato del backend y avisa sesiones vencidas. La lógica del asistente vive en funciones puras (`src/registro/modelo.js`) y la vista solo las orquesta. Servido en la subruta `/porteria/`.

**Tech Stack:** Vue 3.5, Vite 7, Tailwind 3.4, Pinia 3, Vue Router 4, axios 1.12, vue-toastification 2 (rc), vite-plugin-pwa 1, Vitest 3 + jsdom + @vue/test-utils.

**Diseño de referencia:** `docs/superpowers/specs/2026-10-29-porteria-design.md` §9 y la sección Fase 3 de `docs/superpowers/plans/2026-10-30-porteria-00-indice.md` (contratos del backend que el front debe manejar).

## Global Constraints

- Repo: `/Users/Shared/Files From c.localized/apps/mantix/porteria/porteriasfn` (remoto `ebor94/porteriasfn`, sin commits). Se trabaja en la rama `feature/guarda`; nunca push.
- Estilo de código como `peludos`: JavaScript (no TypeScript), sin punto y coma, comillas simples, 2 espacios, identificadores y textos en español.
- Base de la app: `/porteria/` (Vite `base`, router `createWebHistory(import.meta.env.BASE_URL)`, PWA `scope`/`start_url`). Se despliega copiando `dist/` a `smb://192.9.17.11/www/porteria` (Fase 5).
- API: `${VITE_API_URL || '/api'}/porteria/v1`. Respuestas `{ success, data }`; errores `{ success:false, error, motivo, message, errors }`. En desarrollo, proxy de `/api` a `VITE_PROXY_TARGET || 'http://localhost:3020'`.
- Token en `localStorage` clave `por_token`. Un 401 de la sesión vigente (salvo `/auth/login`) cierra sesión y lleva a `/login?motivo=SESION_EXPIRADA`.
- PWA solo para instalar (manifest y shell); nada de datos sin conexión.
- Paleta Serfunorte (`primary` 50–900 de `mantix-frontend`), botones táctiles de al menos 56 px, texto blanco solo sobre 700+.
- El servidor decide reglas y permisos (15 minutos, coherencia, sede); el front solo guía y oculta lo que no aplica.
- Pruebas en `src/**/__tests__/*.spec.js`; las vistas usan `data-test` para seleccionar elementos.
- Commits con trailer `Co-Authored-By:` del modelo que los escribe.

## Contratos del backend que se usan (resumen)

| Llamada | Respuesta `data` |
|---|---|
| `POST /auth/login {usuario,password}` | `{ token, user:{usuario,nombre,rol,sede:null}, sedes:[{id,codigo,nombre,ciudad}] }` |
| `POST /auth/sede {sede_id}` | `{ token, user:{…, sede:{id,nombre}} }` |
| `GET /auth/me` | `{ user }` |
| `GET /catalogos/sedes` · `/conductores` · `/motivos?tipo_vehiculo&sentido` · `/asistencias?q` · `/exequias?q&placa` | listas (`motivos`: `{id,codigo,nombre,descripcion,tipo_referencia,referencia_obligatoria}`; conductores `{usuario,nombre}`; asistencias `{id,codigo,nombre_ser_querido,contrato,estado}`; exequias `{id,tipo,fecha,hora,lugar,asistencia_codigo,nombre_ser_querido,vehiculo_placa,es_de_la_placa}`) |
| `GET /vehiculos-externos?q` | `[{id,placa,tipo,empresa,descripcion,activo}]` |
| `GET /estado/placa/:placa` | `{ placa, tipo_vehiculo, vehiculo, vehiculo_externo, estado:{dentro,sede_id,desde,sembrado}\|null, sentido_sugerido, propuesta }` |
| `GET /estado/dentro` · `/estado/fuera` | eventos; en `dentro`, filas `carga_inicial:true` con `id:null, motivo:null` |
| `POST /eventos` | evento creado (201). 409 `SENTIDO_INCOHERENTE` con `errors.estado = {dentro,sede_id,desde,sin_historial,otra_sede}`; 409 `OCUPADO`; 422 `VALIDACION` |
| `GET /eventos?desde&hasta&pagina` | `{ items, total, pagina, por_pagina }` |
| `PATCH /eventos/:id` · `POST /eventos/:id/anular {motivo}` | evento; 403 `SIN_PERMISO`, 409 `ANULADO`/`MODIFICADO` |

## Mapa de archivos (repo `porteriasfn`)

| Archivo | Responsabilidad |
|---|---|
| `package.json`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `.gitignore`, `.env.production.example`, `public/favicon.svg`, `README.md` | Proyecto |
| `src/main.js`, `src/App.vue`, `src/style.css`, `src/testing/setup.js` | Arranque, estilos, setup de pruebas |
| `src/utils/fechas.js`, `src/utils/placa.js`, `src/utils/permisos.js` | Utilidades puras |
| `src/services/api.js`, `src/services/sesion.js` | Cliente HTTP y sesión |
| `src/stores/auth.js`, `catalogos.js`, `estado.js`, `eventos.js` | Estado |
| `src/router/index.js` | Rutas y guardia |
| `src/registro/modelo.js` | Lógica pura del asistente |
| `src/components/MarcoGuarda.vue`, `ListaBuscable.vue`, `DialogoInconsistencia.vue`, `DialogoTexto.vue` | Componentes |
| `src/views/LoginView.vue`, `SedeView.vue`, `InicioView.vue`, `RegistroView.vue`, `VehiculosView.vue`, `MovimientosView.vue` | Pantallas |

---

### Task 1: Proyecto, estilos y utilidades

**Files:** todos los de "Proyecto" y "Arranque" del mapa, más `src/utils/fechas.js`, `src/utils/placa.js`, `src/utils/permisos.js` y sus pruebas en `src/utils/__tests__/`.

**Interfaces:**
- Produces:
  - `hoyLocal(fecha = new Date()) → 'AAAA-MM-DD'` (zona del dispositivo); `horaCorta(valor) → 'HH:MM'` ('' si no hay valor); `haceCuanto(valor, ahora = new Date()) → 'hace N min' | 'hace H h M min' | 'hace N días'` ('' si no hay valor).
  - `normalizarPlaca(placa) → string` (mayúsculas, sin espacios ni guiones; igual que el backend).
  - `puedeEditar(evento, usuario, ahora = new Date()) → boolean`: false si `evento.id` es null o `evento.anulado`; true si `usuario.rol === 'admin_porteria'`; si no, `evento.registrado_por === usuario.usuario` y menos de 15 minutos desde `registrado_at`.

- [ ] **Step 1: Crear la rama y el proyecto**

```bash
cd "/Users/Shared/Files From c.localized/apps/mantix/porteria/porteriasfn"
git checkout -b feature/guarda
```

`package.json`:

```json
{
  "name": "porteria-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "axios": "^1.12.2",
    "pinia": "^3.0.3",
    "vue": "^3.5.22",
    "vue-router": "^4.5.1",
    "vue-toastification": "^2.0.0-rc.5"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.1",
    "@vue/test-utils": "^2.4.6",
    "autoprefixer": "^10.4.21",
    "jsdom": "^26.1.0",
    "postcss": "^8.5.6",
    "tailwindcss": "^3.4.18",
    "vite": "^7.1.7",
    "vite-plugin-pwa": "^1.0.3",
    "vitest": "^3.2.4"
  }
}
```

Run: `npm install` (crea `package-lock.json`).

`vite.config.js`:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

const destino = process.env.VITE_PROXY_TARGET || 'http://localhost:3020'

export default defineConfig({
  base: '/porteria/',
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Portería Los Olivos',
        short_name: 'Portería',
        start_url: '/porteria/',
        scope: '/porteria/',
        display: 'standalone',
        background_color: '#f9fafb',
        theme_color: '#005a3d',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }]
      },
      workbox: {
        // Solo el shell: la portería necesita red para registrar (sin modo offline, decisión 7 del diseño).
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: '/porteria/index.html',
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  server: {
    port: Number(process.env.VITE_PORT || 5174),
    proxy: { '/api': { target: destino, changeOrigin: true } }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/__tests__/*.spec.js'],
    setupFiles: ['./src/testing/setup.js']
  }
})
```

`tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        // Verde Serfunorte (mantix-frontend). Texto blanco solo sobre 700+ (contraste AA).
        primary: {
          50: '#e6f7f1', 100: '#b3e6d4', 200: '#80d5b7', 300: '#4dc49a', 400: '#1ab37d',
          500: '#00875c', 600: '#006d4a', 700: '#005a3d', 800: '#004730', 900: '#003423'
        }
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      // La caseta: dedos con guantes, sol en la pantalla.
      minHeight: { tactil: '56px' },
      minWidth: { tactil: '56px' }
    }
  },
  plugins: []
}
```

`postcss.config.js`: `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`

`index.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/porteria/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#005a3d" />
    <title>Portería</title>
  </head>
  <body class="bg-gray-50 text-gray-900">
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

`public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#005a3d"/><rect x="10" y="22" width="44" height="8" rx="4" fill="#fff"/><rect x="12" y="30" width="6" height="22" rx="2" fill="#fff"/></svg>
```

`.gitignore`:

```
node_modules
dist
.env
.env.*
!.env.production.example
coverage
```

`.env.production.example`:

```
# API de Mantix (el módulo Portería vive en /api/porteria/v1)
VITE_API_URL=https://mantix-api.losolivoscucuta.com:8444/api
```

`src/style.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .btn { @apply inline-flex items-center justify-center gap-2 rounded-xl px-4 min-h-tactil font-semibold text-lg disabled:opacity-50; }
  .btn-primario { @apply btn bg-primary-700 text-white active:bg-primary-800; }
  .btn-secundario { @apply btn bg-white text-primary-800 border-2 border-primary-200 active:bg-primary-50; }
  .btn-peligro { @apply btn bg-red-700 text-white active:bg-red-800; }
  .btn-grande { @apply min-h-[96px] text-2xl rounded-2xl; }
  .campo { @apply w-full rounded-xl border-2 border-gray-300 bg-white px-3 min-h-tactil text-lg focus:border-primary-600 focus:outline-none; }
  .tarjeta { @apply rounded-2xl bg-white shadow-sm p-4; }
  .etiqueta { @apply block text-sm font-semibold text-gray-700 mb-1; }
  .aviso-error { @apply rounded-xl bg-red-50 border border-red-200 text-red-800 px-4 py-3; }
}
```

`src/testing/setup.js`:

```js
// Node ≥ 22 expone un localStorage global experimental (undefined sin --localstorage-file) que tapa el de jsdom.
// Se reemplaza por el de jsdom para que las pruebas usen un Storage real.
for (const nombre of ['localStorage', 'sessionStorage']) {
  if (typeof globalThis[nombre] === 'undefined' && globalThis.jsdom) {
    Object.defineProperty(globalThis, nombre, { value: globalThis.jsdom.window[nombre], configurable: true, writable: true })
  }
}
```

`src/App.vue`:

```vue
<template>
  <RouterView />
</template>
```

`src/main.js` se escribe en la Task 2 (necesita el router y la sesión). Por ahora:

```js
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
```

`README.md`:

```markdown
# Portería — front del guarda

SPA (Vue 3 + Vite) del módulo Portería de Mantix. Se sirve en `/porteria/`.

- Desarrollo: `npm install`, `npm run dev` (proxy de `/api` a `VITE_PROXY_TARGET`, por defecto `http://localhost:3020`).
- Pruebas: `npm test`.
- Producción: `cp .env.production.example .env.production`, `npm ci && npm run build`, copiar `dist/` a `smb://192.9.17.11/www/porteria`.
```

- [ ] **Step 2: Write the failing tests**

```js
// src/utils/__tests__/fechas.spec.js
import { test, expect } from 'vitest'
import { hoyLocal, horaCorta, haceCuanto } from '@/utils/fechas'

test('hoyLocal usa la fecha del dispositivo', () => {
  expect(hoyLocal(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05')
})

test('horaCorta', () => {
  expect(horaCorta(new Date(2026, 9, 5, 8, 7))).toBe('08:07')
  expect(horaCorta(null)).toBe('')
})

test.each([
  [new Date(2026, 9, 5, 9, 55), 'hace 5 min'],
  [new Date(2026, 9, 5, 9, 59, 50), 'hace 0 min'],
  [new Date(2026, 9, 5, 7, 50), 'hace 2 h 10 min'],
  [new Date(2026, 9, 2, 10, 0), 'hace 3 días'],
  [new Date(2026, 9, 4, 9, 0), 'hace 1 día']
])('haceCuanto(%s)', (valor, esperado) => {
  expect(haceCuanto(valor, new Date(2026, 9, 5, 10, 0))).toBe(esperado)
})

test('haceCuanto sin valor', () => {
  expect(haceCuanto(null)).toBe('')
})
```

```js
// src/utils/__tests__/placa.spec.js
import { test, expect } from 'vitest'
import { normalizarPlaca } from '@/utils/placa'

test.each([['abc-123', 'ABC123'], [' abc 12d ', 'ABC12D'], [null, ''], [undefined, '']])('%p → %p', (e, s) => {
  expect(normalizarPlaca(e)).toBe(s)
})
```

```js
// src/utils/__tests__/permisos.spec.js
import { test, expect } from 'vitest'
import { puedeEditar } from '@/utils/permisos'

const ahora = new Date(2026, 9, 5, 10, 0)
const guarda = { usuario: 'g1', rol: 'guarda' }
const admin = { usuario: 'a1', rol: 'admin_porteria' }
const ev = (extra = {}) => ({ id: 1, anulado: false, registrado_por: 'g1', registrado_at: new Date(2026, 9, 5, 9, 50).toISOString(), ...extra })

test('el guarda edita sus registros de los últimos 15 minutos', () => {
  expect(puedeEditar(ev(), guarda, ahora)).toBe(true)
  expect(puedeEditar(ev({ registrado_at: new Date(2026, 9, 5, 9, 44).toISOString() }), guarda, ahora)).toBe(false)
  expect(puedeEditar(ev({ registrado_por: 'otro' }), guarda, ahora)).toBe(false)
})

test('el admin edita cualquiera; nadie edita anulados ni cargas iniciales', () => {
  expect(puedeEditar(ev({ registrado_por: 'otro', registrado_at: '2026-01-01T00:00:00Z' }), admin, ahora)).toBe(true)
  expect(puedeEditar(ev({ anulado: true }), admin, ahora)).toBe(false)
  expect(puedeEditar(ev({ id: null }), admin, ahora)).toBe(false)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test` → FAIL (`Failed to resolve import "@/utils/fechas"` y demás).

- [ ] **Step 4: Write the implementation**

```js
// src/utils/fechas.js
const dos = (n) => String(n).padStart(2, '0')

/** Fecha local del dispositivo como 'AAAA-MM-DD' (para filtrar "hoy" en el servidor, que está en la misma zona). */
export function hoyLocal(fecha = new Date()) {
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
}

export function horaCorta(valor) {
  if (!valor) return ''
  const f = new Date(valor)
  return `${dos(f.getHours())}:${dos(f.getMinutes())}`
}

export function haceCuanto(valor, ahora = new Date()) {
  if (!valor) return ''
  const minutos = Math.max(0, Math.floor((ahora - new Date(valor)) / 60000))
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h ${minutos % 60} min`
  const dias = Math.floor(horas / 24)
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}
```

```js
// src/utils/placa.js
/** Igual que el backend: mayúsculas, sin espacios ni guiones ("abc-123 " → "ABC123"). */
export function normalizarPlaca(placa) {
  return String(placa ?? '').toUpperCase().replace(/[\s-]/g, '')
}
```

```js
// src/utils/permisos.js
const QUINCE_MINUTOS = 15 * 60 * 1000

/**
 * Si se muestran "corregir" y "anular". Solo guía la interfaz: el servidor decide con su propia hora
 * (un guarda: sus registros de los últimos 15 minutos; el admin: cualquiera).
 */
export function puedeEditar(evento, usuario, ahora = new Date()) {
  if (!evento || evento.id === null || evento.anulado || !usuario) return false
  if (usuario.rol === 'admin_porteria') return true
  return evento.registrado_por === usuario.usuario && ahora - new Date(evento.registrado_at) < QUINCE_MINUTOS
}
```

- [ ] **Step 5: Run tests and build**

Run: `npm test` → PASS. Run: `npm run build` → genera `dist/` sin errores.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: proyecto del front de portería (Vite, Tailwind, PWA) y utilidades"
```

---

### Task 2: Cliente HTTP, sesión, stores y router

**Files:**
- Create: `src/services/api.js`, `src/services/sesion.js`, `src/stores/auth.js`, `src/stores/catalogos.js`, `src/stores/estado.js`, `src/stores/eventos.js`, `src/router/index.js`
- Modify: `src/main.js`
- Create (placeholders de vista para que el router compile; se reemplazan en Tasks 3–6): `src/views/LoginView.vue`, `SedeView.vue`, `InicioView.vue`, `RegistroView.vue`, `VehiculosView.vue`, `MovimientosView.vue` con `<template><div /></template>`
- Test: `src/services/__tests__/api.spec.js`, `src/services/__tests__/sesion.spec.js`, `src/stores/__tests__/auth.spec.js`, `src/stores/__tests__/catalogos.spec.js`, `src/stores/__tests__/eventos.spec.js`, `src/router/__tests__/guardia.spec.js`

**Interfaces:**
- Produces:
  - `api.js`: `CLAVE_TOKEN = 'por_token'`, `tokenStorage.{leer,guardar}`, `normalizarError(e) → { status, codigo, motivo, message, errors }`, `alSesionExpirada(fn)`, `porteria` (instancia axios con base `${VITE_API_URL||'/api'}/porteria/v1`, devuelve `r.data`).
  - `sesion.js`: `MOTIVO_SESION_EXPIRADA`, `vigilarTokenCompartido(recargar)`, `manejarSesionExpirada({ auth, router })`, `instalarSesion(router)`.
  - Stores:
    - `useAuthStore`: state `{ token, usuario, sedes }`; getters `autenticado`, `esAdmin`, `sede`, `rutaInicio`; actions `login(usuario, password)`, `elegirSede(sedeId)`, `cargarPerfil()`, `cargarSedes()`, `nombreSede(id)`, `logout()`.
    - `useCatalogosStore`: `conductores()`, `motivos(tipoVehiculo, sentido)` (ambos con caché de 10 min), `asistencias(q)`, `exequias({ q, placa })`, `vehiculosExternos(q)`, `limpiar()`.
    - `useEstadoStore`: state `{ dentro, fuera, cargando }`; `sugerir(placa)`, `cargarDentro()`, `cargarFuera()`, `cargarTodo()`.
    - `useEventosStore`: state `{ delDia, total }`; `registrar(cuerpo)`, `cargarDelDia(hoy)`, `corregir(id, cambios)`, `anular(id, motivo)`.
  - Router: `routes`, `decidirNavegacion(to, auth)`, `guardia(to, auth)`; rutas `/login` (pública), `/sede`, `/inicio`, `/registrar/:sentido?`, `/vehiculos`, `/movimientos` (estas cuatro con `meta.requiereSede`), `/` → `/inicio`.

- [ ] **Step 1: Write the failing tests**

```js
// src/services/__tests__/api.spec.js
import { test, expect, beforeEach, vi } from 'vitest'
import { porteria, normalizarError, tokenStorage, alSesionExpirada } from '@/services/api'

let ultima
function responder(status, data) {
  porteria.defaults.adapter = async (config) => {
    ultima = config
    const respuesta = { data, status, statusText: '', headers: {}, config }
    if (status >= 400) throw Object.assign(new Error('http'), { config, response: respuesta, isAxiosError: true })
    return respuesta
  }
}

beforeEach(() => {
  localStorage.clear()
  alSesionExpirada(null)
})

test('devuelve el cuerpo y manda el token', async () => {
  tokenStorage.guardar('t1')
  responder(200, { success: true, data: { ok: 1 } })
  expect(await porteria.get('/auth/me')).toEqual({ success: true, data: { ok: 1 } })
  expect(ultima.headers.Authorization).toBe('Bearer t1')
  expect(localStorage.getItem('por_token')).toBe('t1')
})

test('normaliza el contrato de error del backend', async () => {
  responder(409, { success: false, error: 'POR-EVT-001', motivo: 'SENTIDO_INCOHERENTE', message: 'Figura dentro', errors: { estado: { dentro: true } } })
  await expect(porteria.post('/eventos', {})).rejects.toEqual({
    status: 409, codigo: 'POR-EVT-001', motivo: 'SENTIDO_INCOHERENTE', message: 'Figura dentro', errors: { estado: { dentro: true } }
  })
})

test('sin respuesta → SIN_CONEXION', () => {
  expect(normalizarError(new Error('Network Error'))).toEqual({
    status: 0, codigo: null, motivo: 'SIN_CONEXION', message: 'Sin conexión con el servidor', errors: []
  })
})

test('un 401 de la sesión vigente avisa; el del login o de un token viejo no', async () => {
  const aviso = vi.fn()
  alSesionExpirada(aviso)
  tokenStorage.guardar('t1')
  responder(401, { success: false, motivo: 'NO_AUTENTICADO', message: 'Sesión inválida o vencida' })
  await expect(porteria.post('/auth/login', {})).rejects.toMatchObject({ status: 401 })
  expect(aviso).not.toHaveBeenCalled()
  await expect(porteria.get('/estado/dentro')).rejects.toMatchObject({ status: 401 })
  expect(aviso).toHaveBeenCalledTimes(1)

  porteria.defaults.adapter = async (config) => {
    tokenStorage.guardar('t2') // otra pestaña entró mientras esta petición viajaba
    throw Object.assign(new Error('http'), { config, response: { status: 401, data: {}, headers: {}, config } })
  }
  await expect(porteria.get('/estado/dentro')).rejects.toMatchObject({ status: 401 })
  expect(aviso).toHaveBeenCalledTimes(1)
})
```

```js
// src/services/__tests__/sesion.spec.js
import { test, expect, vi } from 'vitest'
import { manejarSesionExpirada, vigilarTokenCompartido, MOTIVO_SESION_EXPIRADA } from '@/services/sesion'

function routerEn(path) {
  return { currentRoute: { value: { path, fullPath: path } }, replace: vi.fn() }
}

test('cierra sesión y lleva al login con aviso', () => {
  const auth = { token: 't', logout: vi.fn() }
  const router = routerEn('/inicio')
  manejarSesionExpirada({ auth, router })
  expect(auth.logout).toHaveBeenCalled()
  expect(router.replace).toHaveBeenCalledWith({ path: '/login', query: { motivo: MOTIVO_SESION_EXPIRADA } })
})

test('sin sesión no hace nada; en el login solo cierra sesión', () => {
  const sinToken = { token: null, logout: vi.fn() }
  manejarSesionExpirada({ auth: sinToken, router: routerEn('/inicio') })
  expect(sinToken.logout).not.toHaveBeenCalled()
  const auth = { token: 't', logout: vi.fn() }
  const router = routerEn('/login')
  manejarSesionExpirada({ auth, router })
  expect(auth.logout).toHaveBeenCalled()
  expect(router.replace).not.toHaveBeenCalled()
})

test('si otra pestaña cambia el token, recarga', () => {
  const recargar = vi.fn()
  const dejar = vigilarTokenCompartido(recargar)
  window.dispatchEvent(new StorageEvent('storage', { key: 'otra' }))
  expect(recargar).not.toHaveBeenCalled()
  window.dispatchEvent(new StorageEvent('storage', { key: 'por_token' }))
  expect(recargar).toHaveBeenCalledTimes(1)
  dejar()
})
```

```js
// src/stores/__tests__/auth.spec.js
import { test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/api', () => {
  const almacen = { token: null }
  return {
    porteria: { post: vi.fn(), get: vi.fn() },
    tokenStorage: { leer: () => almacen.token, guardar: (t) => { almacen.token = t } }
  }
})

import { porteria, tokenStorage } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

const SEDES = [{ id: 1, codigo: 'N', nombre: 'Norte', ciudad: 'Cúcuta' }]

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  tokenStorage.guardar(null)
})

test('login guarda token, usuario y sedes; sin sede va a elegirla', async () => {
  porteria.post.mockResolvedValue({ data: { token: 't1', user: { usuario: 'g1', nombre: 'G', rol: 'guarda', sede: null }, sedes: SEDES } })
  const auth = useAuthStore()
  await auth.login('OLIVOS\\g1', 'clave')
  expect(porteria.post).toHaveBeenCalledWith('/auth/login', { usuario: 'OLIVOS\\g1', password: 'clave' })
  expect(auth.autenticado).toBe(true)
  expect(tokenStorage.leer()).toBe('t1')
  expect(auth.sedes).toEqual(SEDES)
  expect(auth.rutaInicio).toBe('/sede')
  expect(auth.nombreSede(1)).toBe('Norte')
})

test('elegir sede cambia el token y lleva al inicio', async () => {
  porteria.post.mockResolvedValue({ data: { token: 't2', user: { usuario: 'g1', nombre: 'G', rol: 'guarda', sede: { id: 1, nombre: 'Norte' } } } })
  const auth = useAuthStore()
  await auth.elegirSede(1)
  expect(porteria.post).toHaveBeenCalledWith('/auth/sede', { sede_id: 1 })
  expect(tokenStorage.leer()).toBe('t2')
  expect(auth.sede).toEqual({ id: 1, nombre: 'Norte' })
  expect(auth.rutaInicio).toBe('/inicio')
})

test('cargarPerfil con 401 cierra sesión y relanza', async () => {
  tokenStorage.guardar('viejo')
  porteria.get.mockRejectedValue({ status: 401, motivo: 'NO_AUTENTICADO' })
  const auth = useAuthStore()
  await expect(auth.cargarPerfil()).rejects.toMatchObject({ status: 401 })
  expect(auth.token).toBeNull()
  expect(tokenStorage.leer()).toBeNull()
})

test('esAdmin y cargarSedes (una sola vez)', async () => {
  porteria.get.mockResolvedValue({ data: SEDES })
  const auth = useAuthStore()
  auth.usuario = { rol: 'admin_porteria' }
  expect(auth.esAdmin).toBe(true)
  await auth.cargarSedes()
  await auth.cargarSedes()
  expect(porteria.get).toHaveBeenCalledTimes(1)
  expect(porteria.get).toHaveBeenCalledWith('/catalogos/sedes')
})
```

```js
// src/stores/__tests__/catalogos.spec.js
import { test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn() } }))

import { porteria } from '@/services/api'
import { useCatalogosStore } from '@/stores/catalogos'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

test('motivos y conductores se guardan 10 minutos por clave', async () => {
  let ahora = 1000000
  vi.spyOn(Date, 'now').mockImplementation(() => ahora)
  porteria.get.mockResolvedValue({ data: [{ id: 1 }] })
  const c = useCatalogosStore()
  await c.motivos('PROPIO', 'SALIDA')
  await c.motivos('PROPIO', 'SALIDA')
  expect(porteria.get).toHaveBeenCalledTimes(1)
  expect(porteria.get).toHaveBeenCalledWith('/catalogos/motivos', { params: { tipo_vehiculo: 'PROPIO', sentido: 'SALIDA' } })
  await c.motivos('PROVEEDOR', 'SALIDA')
  expect(porteria.get).toHaveBeenCalledTimes(2)
  ahora += 10 * 60 * 1000
  await c.motivos('PROPIO', 'SALIDA')
  expect(porteria.get).toHaveBeenCalledTimes(3)
})

test('las búsquedas no se guardan', async () => {
  porteria.get.mockResolvedValue({ data: [] })
  const c = useCatalogosStore()
  await c.asistencias('mar')
  await c.exequias({ q: undefined, placa: 'ABC123' })
  await c.vehiculosExternos('flo')
  expect(porteria.get.mock.calls).toEqual([
    ['/catalogos/asistencias', { params: { q: 'mar' } }],
    ['/catalogos/exequias', { params: { q: undefined, placa: 'ABC123' } }],
    ['/vehiculos-externos', { params: { q: 'flo' } }]
  ])
})
```

```js
// src/stores/__tests__/eventos.spec.js
import { test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))

import { porteria } from '@/services/api'
import { useEventosStore } from '@/stores/eventos'
import { useEstadoStore } from '@/stores/estado'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

test('movimientos del día, anular y corregir reemplazan la fila', async () => {
  porteria.get.mockResolvedValue({ data: { items: [{ id: 1, anulado: false }, { id: 2 }], total: 2 } })
  porteria.post.mockResolvedValue({ data: { id: 1, anulado: true } })
  porteria.patch.mockResolvedValue({ data: { id: 2, kilometraje: 9 } })
  const ev = useEventosStore()
  await ev.cargarDelDia('2026-10-05')
  expect(porteria.get).toHaveBeenCalledWith('/eventos', { params: { desde: '2026-10-05', hasta: '2026-10-05' } })
  await ev.anular(1, 'error')
  expect(porteria.post).toHaveBeenCalledWith('/eventos/1/anular', { motivo: 'error' })
  await ev.corregir(2, { kilometraje: 9 })
  expect(porteria.patch).toHaveBeenCalledWith('/eventos/2', { kilometraje: 9 })
  expect(ev.delDia).toEqual([{ id: 1, anulado: true }, { id: 2, kilometraje: 9 }])
})

test('registrar devuelve el evento', async () => {
  porteria.post.mockResolvedValue({ data: { id: 7 } })
  expect(await useEventosStore().registrar({ placa: 'X' })).toEqual({ id: 7 })
  expect(porteria.post).toHaveBeenCalledWith('/eventos', { placa: 'X' })
})

test('estado: sugerencia codifica la placa y cargarTodo trae dentro y fuera', async () => {
  porteria.get.mockImplementation(async (url) => ({ data: url === '/estado/dentro' ? [{ placa: 'A' }] : url === '/estado/fuera' ? [{ placa: 'B' }] : { placa: 'C' } }))
  const estado = useEstadoStore()
  await estado.sugerir('AB C')
  expect(porteria.get).toHaveBeenCalledWith('/estado/placa/AB%20C')
  await estado.cargarTodo()
  expect(estado.dentro).toEqual([{ placa: 'A' }])
  expect(estado.fuera).toEqual([{ placa: 'B' }])
  expect(estado.cargando).toBe(false)
})
```

```js
// src/router/__tests__/guardia.spec.js
import { test, expect, vi } from 'vitest'
import { decidirNavegacion, guardia, routes } from '@/router'

const ruta = (path, meta = {}) => ({ path, fullPath: path, meta })
const auth = (extra = {}) => ({ token: 't', usuario: { rol: 'guarda', sede: { id: 1 } }, sede: { id: 1 }, autenticado: true, rutaInicio: '/inicio', ...extra })

test('rutas definidas', () => {
  expect(routes.map((r) => r.path)).toEqual(['/', '/login', '/sede', '/inicio', '/registrar/:sentido?', '/vehiculos', '/movimientos'])
})

test('sin token → login con redirect', () => {
  expect(decidirNavegacion(ruta('/inicio', { requiereSede: true }), { token: null })).toEqual({ path: '/login', query: { redirect: '/inicio' } })
})

test('sin sede → elegir sede', () => {
  expect(decidirNavegacion(ruta('/inicio', { requiereSede: true }), auth({ sede: null }))).toEqual({ path: '/sede' })
})

test('ya autenticado no vuelve al login', () => {
  expect(decidirNavegacion(ruta('/login', { publica: true }), auth())).toEqual({ path: '/inicio' })
  expect(decidirNavegacion(ruta('/login', { publica: true }), { token: null })).toBe(true)
})

test('guardia carga el perfil y, si venció, avisa en el login', async () => {
  const conPerfil = { token: 't', usuario: null, sede: null, cargarPerfil: vi.fn(async function () { this.usuario = { sede: null } }) }
  expect(await guardia(ruta('/sede'), conPerfil)).toBe(true)
  expect(conPerfil.cargarPerfil).toHaveBeenCalled()

  const vencido = { token: 't', usuario: null, cargarPerfil: vi.fn(async () => { throw { status: 401 } }) }
  expect(await guardia(ruta('/inicio', { requiereSede: true }), vencido))
    .toEqual({ path: '/login', query: { redirect: '/inicio', motivo: 'SESION_EXPIRADA' } })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → FAIL (módulos inexistentes).

- [ ] **Step 3: Write the implementation**

```js
// src/services/api.js
import axios from 'axios'

export const CLAVE_TOKEN = 'por_token'

export const tokenStorage = {
  leer() {
    try { return localStorage.getItem(CLAVE_TOKEN) } catch { return null }
  },
  guardar(token) {
    try {
      if (token) localStorage.setItem(CLAVE_TOKEN, token)
      else localStorage.removeItem(CLAVE_TOKEN)
    } catch { /* almacenamiento no disponible */ }
  }
}

// Contrato de error del backend → objeto plano para la UI.
export function normalizarError(error) {
  const r = error && error.response
  return {
    status: r ? r.status : 0,
    codigo: r && r.data ? r.data.error || null : null,
    motivo: r ? (r.data && r.data.motivo) || 'ERROR' : 'SIN_CONEXION',
    message: r ? (r.data && r.data.message) || 'Ocurrió un error' : 'Sin conexión con el servidor',
    errors: (r && r.data && r.data.errors) || []
  }
}

let alExpirar = null
export function alSesionExpirada(fn) {
  alExpirar = fn
}
// Un 401 del login significa credenciales malas, no sesión vencida.
const esLogin = (url = '') => /^\/?auth\/login/.test(url)

function avisarSiExpiro(e, err) {
  if (err.status !== 401 || !alExpirar || esLogin(e?.config?.url)) return
  const actual = tokenStorage.leer()
  const usado = e?.config?.headers?.Authorization
  // Solo si el 401 es de la sesión vigente: un 401 tardío de un token ya reemplazado no cierra la sesión nueva.
  if (actual && usado === `Bearer ${actual}`) alExpirar(err)
}

function crearCliente(baseURL) {
  const cliente = axios.create({ baseURL, timeout: 20000 })
  cliente.interceptors.request.use((config) => {
    const token = tokenStorage.leer()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })
  cliente.interceptors.response.use(
    (r) => r.data,
    (e) => {
      const err = normalizarError(e)
      avisarSiExpiro(e, err)
      return Promise.reject(err)
    }
  )
  return cliente
}

const BASE = import.meta.env.VITE_API_URL || '/api'
export const porteria = crearCliente(`${BASE}/porteria/v1`)
```

```js
// src/services/sesion.js
// Sesión vencida y cambios de sesión en otra pestaña.
import { CLAVE_TOKEN, alSesionExpirada } from '@/services/api'
import { useAuthStore } from '@/stores/auth'

export const MOTIVO_SESION_EXPIRADA = 'SESION_EXPIRADA'

// El token vive en localStorage compartido: si otra pestaña lo cambia, esta se recarga para no actuar
// con la identidad o la sede anterior.
export function vigilarTokenCompartido(recargar = () => window.location.reload()) {
  const alCambiar = (e) => {
    if (e.key === CLAVE_TOKEN || e.key === null) recargar()
  }
  window.addEventListener('storage', alCambiar)
  return () => window.removeEventListener('storage', alCambiar)
}

export function manejarSesionExpirada({ auth, router }) {
  if (!auth.token) return
  auth.logout()
  if (router.currentRoute.value.path === '/login') return
  router.replace({ path: '/login', query: { motivo: MOTIVO_SESION_EXPIRADA } })
}

export function instalarSesion(router) {
  alSesionExpirada(() => manejarSesionExpirada({ auth: useAuthStore(), router }))
  return vigilarTokenCompartido()
}
```

```js
// src/stores/auth.js
import { defineStore } from 'pinia'
import { porteria, tokenStorage } from '@/services/api'

export const useAuthStore = defineStore('auth', {
  state: () => ({ token: tokenStorage.leer(), usuario: null, sedes: [] }),
  getters: {
    autenticado: (s) => Boolean(s.token && s.usuario),
    esAdmin: (s) => Boolean(s.usuario && s.usuario.rol === 'admin_porteria'),
    sede: (s) => (s.usuario && s.usuario.sede) || null,
    rutaInicio: (s) => (s.usuario && s.usuario.sede ? '/inicio' : '/sede')
  },
  actions: {
    fijarSesion(token, usuario) {
      this.token = token
      this.usuario = usuario
      tokenStorage.guardar(token)
    },
    async login(usuario, password) {
      const { data } = await porteria.post('/auth/login', { usuario, password })
      this.sedes = data.sedes
      this.fijarSesion(data.token, data.user)
    },
    async elegirSede(sedeId) {
      const { data } = await porteria.post('/auth/sede', { sede_id: sedeId })
      this.fijarSesion(data.token, data.user)
    },
    async cargarPerfil() {
      try {
        const { data } = await porteria.get('/auth/me')
        this.usuario = data.user
      } catch (e) {
        if (e && e.status === 401) this.logout()
        throw e
      }
    },
    async cargarSedes() {
      if (this.sedes.length === 0) this.sedes = (await porteria.get('/catalogos/sedes')).data
      return this.sedes
    },
    nombreSede(id) {
      const sede = this.sedes.find((s) => s.id === id)
      return sede ? sede.nombre : ''
    },
    logout() {
      this.token = null
      this.usuario = null
      this.sedes = []
      tokenStorage.guardar(null)
    }
  }
})
```

```js
// src/stores/catalogos.js
import { defineStore } from 'pinia'
import { porteria } from '@/services/api'

const DIEZ_MINUTOS = 10 * 60 * 1000

export const useCatalogosStore = defineStore('catalogos', {
  state: () => ({ cache: {} }),
  actions: {
    async cacheado(clave, cargar) {
      const guardado = this.cache[clave]
      if (guardado && Date.now() - guardado.en < DIEZ_MINUTOS) return guardado.datos
      const datos = await cargar()
      this.cache[clave] = { datos, en: Date.now() }
      return datos
    },
    conductores() {
      return this.cacheado('conductores', async () => (await porteria.get('/catalogos/conductores')).data)
    },
    motivos(tipoVehiculo, sentido) {
      return this.cacheado(`motivos:${tipoVehiculo}:${sentido}`, async () =>
        (await porteria.get('/catalogos/motivos', { params: { tipo_vehiculo: tipoVehiculo, sentido } })).data)
    },
    async asistencias(q) {
      return (await porteria.get('/catalogos/asistencias', { params: { q } })).data
    },
    async exequias({ q, placa }) {
      return (await porteria.get('/catalogos/exequias', { params: { q, placa } })).data
    },
    async vehiculosExternos(q) {
      return (await porteria.get('/vehiculos-externos', { params: { q } })).data
    },
    limpiar() {
      this.cache = {}
    }
  }
})
```

```js
// src/stores/estado.js
import { defineStore } from 'pinia'
import { porteria } from '@/services/api'

export const useEstadoStore = defineStore('estado', {
  state: () => ({ dentro: [], fuera: [], cargando: false }),
  actions: {
    async sugerir(placa) {
      return (await porteria.get(`/estado/placa/${encodeURIComponent(placa)}`)).data
    },
    async cargarDentro() {
      this.dentro = (await porteria.get('/estado/dentro')).data
    },
    async cargarFuera() {
      this.fuera = (await porteria.get('/estado/fuera')).data
    },
    async cargarTodo() {
      this.cargando = true
      try {
        await Promise.all([this.cargarDentro(), this.cargarFuera()])
      } finally {
        this.cargando = false
      }
    }
  }
})
```

```js
// src/stores/eventos.js
import { defineStore } from 'pinia'
import { porteria } from '@/services/api'
import { hoyLocal } from '@/utils/fechas'

export const useEventosStore = defineStore('eventos', {
  state: () => ({ delDia: [], total: 0 }),
  actions: {
    async registrar(cuerpo) {
      return (await porteria.post('/eventos', cuerpo)).data
    },
    // Primera página (50): suficiente para el día de una caseta; si no, el admin consulta en reportes.
    async cargarDelDia(hoy = hoyLocal()) {
      const { data } = await porteria.get('/eventos', { params: { desde: hoy, hasta: hoy } })
      this.delDia = data.items
      this.total = data.total
    },
    async corregir(id, cambios) {
      const { data } = await porteria.patch(`/eventos/${id}`, cambios)
      this.reemplazar(data)
      return data
    },
    async anular(id, motivo) {
      const { data } = await porteria.post(`/eventos/${id}/anular`, { motivo })
      this.reemplazar(data)
      return data
    },
    reemplazar(evento) {
      const i = this.delDia.findIndex((e) => e.id === evento.id)
      if (i >= 0) this.delDia.splice(i, 1, evento)
    }
  }
})
```

```js
// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const routes = [
  { path: '/', redirect: '/inicio' },
  { path: '/login', component: () => import('@/views/LoginView.vue'), meta: { publica: true } },
  { path: '/sede', component: () => import('@/views/SedeView.vue') },
  { path: '/inicio', component: () => import('@/views/InicioView.vue'), meta: { requiereSede: true } },
  { path: '/registrar/:sentido?', component: () => import('@/views/RegistroView.vue'), meta: { requiereSede: true } },
  { path: '/vehiculos', component: () => import('@/views/VehiculosView.vue'), meta: { requiereSede: true } },
  { path: '/movimientos', component: () => import('@/views/MovimientosView.vue'), meta: { requiereSede: true } }
]

export function decidirNavegacion(to, auth) {
  const meta = to.meta || {}
  if (meta.publica) return to.path === '/login' && auth.autenticado ? { path: auth.rutaInicio } : true
  if (!auth.token) return { path: '/login', query: { redirect: to.fullPath } }
  if (meta.requiereSede && !auth.sede) return { path: '/sede' }
  return true
}

export async function guardia(to, auth) {
  if (auth.token && !auth.usuario) {
    try {
      await auth.cargarPerfil()
    } catch (e) {
      // 401: cargarPerfil ya cerró sesión; se avisa en /login que la sesión venció.
      if (e && e.status === 401 && !(to.meta && to.meta.publica)) {
        return { path: '/login', query: { redirect: to.fullPath, motivo: 'SESION_EXPIRADA' } }
      }
    }
  }
  return decidirNavegacion(to, auth)
}

const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes })
router.beforeEach((to) => guardia(to, useAuthStore()))

export default router
```

Nota: en la prueba de la guardia, `auth` es un objeto simple: `decidirNavegacion` lee `auth.sede` y `auth.autenticado` como propiedades (en Pinia son getters, se leen igual).

`src/main.js`:

```js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Toast from 'vue-toastification'
import 'vue-toastification/dist/index.css'
import App from './App.vue'
import router from './router'
import { instalarSesion } from './services/sesion'
import './style.css'

createApp(App)
  .use(createPinia())
  .use(router)
  .use(Toast, { position: 'top-center', timeout: 3500 })
  .mount('#app')

instalarSesion(router)
```

- [ ] **Step 4: Run tests and build**

Run: `npm test` → PASS. Run: `npm run build` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cliente de la API de portería, sesión, stores y guardia del router"
```

---

### Task 3: Marco, login y elección de sede

**Files:**
- Create: `src/components/MarcoGuarda.vue`
- Replace: `src/views/LoginView.vue`, `src/views/SedeView.vue`
- Test: `src/views/__tests__/login.spec.js`, `src/views/__tests__/sede.spec.js`

**Interfaces:**
- Consumes: `useAuthStore` (Task 2), `MOTIVO_SESION_EXPIRADA`.
- Produces: `MarcoGuarda` (slot por defecto; prop `titulo`): barra con nombre de la sede, nombre del usuario, navegación (Inicio, Vehículos, Movimientos), "Cambiar sede" (→ `/sede`) y "Salir" (logout → `/login`). `data-test`: `marco-sede`, `marco-salir`, `marco-cambiar-sede`.
- LoginView `data-test`: `login-usuario`, `login-clave`, `login-entrar`, `login-error`, `login-aviso`.
- SedeView `data-test`: `sede-<id>` por botón, `sede-error`.

- [ ] **Step 1: Write the failing tests**

```js
// src/views/__tests__/login.spec.js
import { test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/services/api', () => {
  const almacen = { token: null }
  return {
    porteria: { post: vi.fn(), get: vi.fn() },
    tokenStorage: { leer: () => almacen.token, guardar: (t) => { almacen.token = t } }
  }
})

import { porteria } from '@/services/api'
import LoginView from '@/views/LoginView.vue'

async function montar(query = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/login', component: LoginView }, { path: '/sede', component: { template: '<div>sede</div>' } }]
  })
  router.push({ path: '/login', query })
  await router.isReady()
  const w = mount(LoginView, { global: { plugins: [router] } })
  return { w, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

test('entra y va a elegir sede', async () => {
  porteria.post.mockResolvedValue({ data: { token: 't', user: { usuario: 'g1', nombre: 'G', rol: 'guarda', sede: null }, sedes: [] } })
  const { w, router } = await montar()
  await w.get('[data-test=login-usuario]').setValue('g1')
  await w.get('[data-test=login-clave]').setValue('clave')
  await w.get('form').trigger('submit')
  await flushPromises()
  expect(porteria.post).toHaveBeenCalledWith('/auth/login', { usuario: 'g1', password: 'clave' })
  expect(router.currentRoute.value.path).toBe('/sede')
})

test('muestra el error del servidor y el aviso de sesión vencida', async () => {
  porteria.post.mockRejectedValue({ status: 401, message: 'Usuario o contraseña incorrectos' })
  const { w } = await montar({ motivo: 'SESION_EXPIRADA' })
  expect(w.get('[data-test=login-aviso]').text()).toContain('Tu sesión venció')
  await w.get('[data-test=login-usuario]').setValue('g1')
  await w.get('[data-test=login-clave]').setValue('mala')
  await w.get('form').trigger('submit')
  await flushPromises()
  expect(w.get('[data-test=login-error]').text()).toBe('Usuario o contraseña incorrectos')
})

test('no envía sin usuario y clave', async () => {
  const { w } = await montar()
  await w.get('form').trigger('submit')
  expect(porteria.post).not.toHaveBeenCalled()
  expect(w.get('[data-test=login-error]').text()).toBe('Escribe tu usuario y contraseña')
})
```

```js
// src/views/__tests__/sede.spec.js
import { test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/services/api', () => ({
  porteria: { post: vi.fn(), get: vi.fn() },
  tokenStorage: { leer: () => 't', guardar: () => {} }
}))

import { porteria } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import SedeView from '@/views/SedeView.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

test('lista las sedes y al elegir una va al inicio', async () => {
  porteria.get.mockResolvedValue({ data: [{ id: 1, nombre: 'Norte' }, { id: 2, nombre: 'Sur' }] })
  porteria.post.mockResolvedValue({ data: { token: 't2', user: { usuario: 'g', rol: 'guarda', sede: { id: 2, nombre: 'Sur' } } } })
  useAuthStore().usuario = { usuario: 'g', nombre: 'G', rol: 'guarda', sede: null }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/sede', component: SedeView }, { path: '/inicio', component: { template: '<div />' } }] })
  router.push('/sede')
  await router.isReady()
  const w = mount(SedeView, { global: { plugins: [router] } })
  await flushPromises()
  expect(w.get('[data-test=sede-1]').text()).toBe('Norte')
  await w.get('[data-test=sede-2]').trigger('click')
  await flushPromises()
  expect(porteria.post).toHaveBeenCalledWith('/auth/sede', { sede_id: 2 })
  expect(router.currentRoute.value.path).toBe('/inicio')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → FAIL (las vistas son placeholders).

- [ ] **Step 3: Write the implementation**

```vue
<!-- src/components/MarcoGuarda.vue -->
<script setup>
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

defineProps({ titulo: { type: String, default: '' } })

const auth = useAuthStore()
const router = useRouter()

function salir() {
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="bg-primary-700 text-white px-4 py-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-lg font-bold" data-test="marco-sede">{{ auth.sede ? auth.sede.nombre : 'Sin sede' }}</p>
          <p class="text-sm opacity-90">{{ auth.usuario ? auth.usuario.nombre : '' }}</p>
        </div>
        <div class="flex gap-2">
          <RouterLink to="/sede" class="btn border-2 border-white/60 text-white text-base" data-test="marco-cambiar-sede">Cambiar sede</RouterLink>
          <button type="button" class="btn border-2 border-white/60 text-white text-base" data-test="marco-salir" @click="salir">Salir</button>
        </div>
      </div>
      <nav class="mt-3 flex gap-2 overflow-x-auto">
        <RouterLink to="/inicio" class="btn bg-primary-800 text-white text-base" active-class="ring-2 ring-white">Inicio</RouterLink>
        <RouterLink to="/vehiculos" class="btn bg-primary-800 text-white text-base" active-class="ring-2 ring-white">Vehículos</RouterLink>
        <RouterLink to="/movimientos" class="btn bg-primary-800 text-white text-base" active-class="ring-2 ring-white">Movimientos</RouterLink>
      </nav>
    </header>
    <main class="flex-1 p-4 max-w-3xl w-full mx-auto">
      <h1 v-if="titulo" class="text-2xl font-bold mb-4">{{ titulo }}</h1>
      <slot />
    </main>
  </div>
</template>
```

```vue
<!-- src/views/LoginView.vue -->
<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { MOTIVO_SESION_EXPIRADA } from '@/services/sesion'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const usuario = ref('')
const clave = ref('')
const error = ref('')
const enviando = ref(false)
const vencida = computed(() => route.query.motivo === MOTIVO_SESION_EXPIRADA)

async function entrar() {
  error.value = ''
  if (!usuario.value.trim() || !clave.value) {
    error.value = 'Escribe tu usuario y contraseña'
    return
  }
  enviando.value = true
  try {
    await auth.login(usuario.value.trim(), clave.value)
    clave.value = ''
    router.replace(auth.rutaInicio)
  } catch (e) {
    error.value = e.message || 'No se pudo entrar'
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-4">
    <form class="tarjeta w-full max-w-sm space-y-4" @submit.prevent="entrar">
      <h1 class="text-2xl font-bold text-primary-800">Portería</h1>
      <p v-if="vencida" class="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3" data-test="login-aviso">
        Tu sesión venció. Vuelve a entrar.
      </p>
      <div>
        <label class="etiqueta" for="usuario">Usuario</label>
        <input id="usuario" v-model="usuario" class="campo" autocomplete="username" autocapitalize="none" data-test="login-usuario" />
      </div>
      <div>
        <label class="etiqueta" for="clave">Contraseña</label>
        <input id="clave" v-model="clave" type="password" class="campo" autocomplete="current-password" data-test="login-clave" />
      </div>
      <p v-if="error" class="aviso-error" data-test="login-error">{{ error }}</p>
      <button type="submit" class="btn-primario w-full" :disabled="enviando" data-test="login-entrar">
        {{ enviando ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>
  </main>
</template>
```

```vue
<!-- src/views/SedeView.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const error = ref('')
const enviando = ref(false)

onMounted(async () => {
  try {
    await auth.cargarSedes()
  } catch (e) {
    error.value = e.message
  }
})

async function elegir(id) {
  error.value = ''
  enviando.value = true
  try {
    await auth.elegirSede(id)
    const destino = typeof route.query.redirect === 'string' ? route.query.redirect : '/inicio'
    router.replace(destino)
  } catch (e) {
    error.value = e.message
  } finally {
    enviando.value = false
  }
}

function salir() {
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <main class="min-h-screen p-4 max-w-md mx-auto space-y-4">
    <h1 class="text-2xl font-bold">¿En qué sede estás de turno?</h1>
    <p class="text-gray-600">{{ auth.usuario ? auth.usuario.nombre : '' }}</p>
    <p v-if="error" class="aviso-error" data-test="sede-error">{{ error }}</p>
    <div class="grid gap-3">
      <button
        v-for="s in auth.sedes" :key="s.id" type="button" class="btn-secundario btn-grande"
        :disabled="enviando" :data-test="`sede-${s.id}`" @click="elegir(s.id)"
      >{{ s.nombre }}</button>
    </div>
    <button type="button" class="btn-secundario w-full" @click="salir">Salir</button>
  </main>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: login con el directorio activo, elección de sede y marco del guarda"
```

---

### Task 4: Lógica del asistente de registro

**Files:**
- Create: `src/registro/modelo.js`
- Test: `src/registro/__tests__/modelo.spec.js`

**Interfaces:**
- Consumes: `normalizarPlaca`, `horaCorta`.
- Produces:
  - `estadoInicial(sentido = null)` → `{ sentido, placa, sugerencia, tipo, tipoConocido, conductor:{ modo:'ad'|'otro', usuario, nombre, documento }, empresa, guardarEnCatalogo, motivoId, referencia:{ asistenciaId, exequiaId, texto, etiqueta }, kilometraje, observaciones }`.
  - `aplicarSugerencia(estado, sugerencia)`: fija placa, tipo, `tipoConocido`, el sentido sugerido si no había uno, empresa del catálogo y, si el sentido coincide con el sugerido, la propuesta (motivo, referencia y conductor de la salida abierta de un propio; motivo, empresa, nombre y documento del último ingreso de un proveedor).
  - `pasosPara(estado, motivo) → string[]` en orden `placa, tipo, conductor, motivo, referencia, detalles, confirmar` sin `tipo` si `tipoConocido` y sin `referencia` si el motivo no pide (`NINGUNA` o aún no elegido).
  - `validarPaso(paso, estado, motivo) → string | null`.
  - `construirCuerpo(estado, motivo, { forzar = false } = {}) → cuerpo de POST /eventos`.
  - `detalleInconsistencia(estadoError, nombreSede) → string` (texto bajo el mensaje del servidor en el diálogo).

- [ ] **Step 1: Write the failing test**

```js
// src/registro/__tests__/modelo.spec.js
import { test, expect, describe } from 'vitest'
import { estadoInicial, aplicarSugerencia, pasosPara, validarPaso, construirCuerpo, detalleInconsistencia } from '@/registro/modelo'

const NINGUNA = { id: 1, tipo_referencia: 'NINGUNA', referencia_obligatoria: false }
const ASIST = { id: 2, tipo_referencia: 'ASISTENCIA', referencia_obligatoria: true }
const EXEQ = { id: 3, tipo_referencia: 'EXEQUIA', referencia_obligatoria: true }
const TEXTO = { id: 4, tipo_referencia: 'TEXTO', referencia_obligatoria: true }

const propio = (extra = {}) => ({
  placa: 'ABC123', tipo_vehiculo: 'PROPIO', vehiculo: { id: 9 }, vehiculo_externo: null,
  estado: { dentro: false, sede_id: 1, desde: '2026-10-05T13:00:00Z', sembrado: false }, sentido_sugerido: 'INGRESO',
  propuesta: {
    motivo: { id: 2, codigo: 'SERES_QUERIDOS', nombre: 'Seres queridos' }, asistencia_id: 50, exequia_id: null, referencia_texto: null,
    referencia: { tipo: 'ASISTENCIA', codigo: 'H360-1', nombre_ser_querido: 'María' }, conductor_usuario: 'jperez', conductor_nombre: 'Juan', conductor_otro: false
  },
  ...extra
})

describe('aplicarSugerencia', () => {
  test('propio fuera: sentido sugerido y propuesta de la salida abierta', () => {
    const e = estadoInicial()
    aplicarSugerencia(e, propio())
    expect(e).toMatchObject({
      placa: 'ABC123', tipo: 'PROPIO', tipoConocido: true, sentido: 'INGRESO', motivoId: 2,
      referencia: { asistenciaId: 50, exequiaId: null, texto: '', etiqueta: 'H360-1 · María' },
      conductor: { modo: 'ad', usuario: 'jperez', nombre: 'Juan', documento: '' }
    })
  })

  test('si el guarda eligió el otro sentido, no usa la propuesta', () => {
    const e = estadoInicial('SALIDA')
    aplicarSugerencia(e, propio())
    expect(e.sentido).toBe('SALIDA')
    expect(e.motivoId).toBeNull()
  })

  test('propuesta con conductor "otro"', () => {
    const e = estadoInicial()
    aplicarSugerencia(e, propio({ propuesta: { ...propio().propuesta, conductor_usuario: null, conductor_nombre: 'Pedro', conductor_otro: true } }))
    expect(e.conductor).toEqual({ modo: 'otro', usuario: null, nombre: 'Pedro', documento: '' })
  })

  test('proveedor del catálogo dentro: empresa y conductor de su ingreso', () => {
    const e = estadoInicial()
    aplicarSugerencia(e, {
      placa: 'XYZ1', tipo_vehiculo: 'PROVEEDOR', vehiculo: null, vehiculo_externo: { id: 3, empresa: 'Flores SA' },
      estado: { dentro: true, sede_id: 1, desde: null, sembrado: false }, sentido_sugerido: 'SALIDA',
      propuesta: { motivo: { id: 7 }, empresa: 'Flores SA', conductor_nombre: 'Ana', conductor_documento: '123' }
    })
    expect(e).toMatchObject({
      tipo: 'PROVEEDOR', tipoConocido: true, sentido: 'SALIDA', empresa: 'Flores SA', motivoId: 7,
      conductor: { modo: 'ad', usuario: null, nombre: 'Ana', documento: '123' }
    })
  })

  test('placa desconocida: tipo por elegir', () => {
    const e = estadoInicial()
    aplicarSugerencia(e, { placa: 'NEW1', tipo_vehiculo: null, vehiculo: null, vehiculo_externo: null, estado: null, sentido_sugerido: 'INGRESO', propuesta: null })
    expect(e).toMatchObject({ tipo: null, tipoConocido: false, sentido: 'INGRESO', empresa: '' })
  })
})

test('pasosPara omite tipo conocido y referencia que no aplica', () => {
  const conocido = { ...estadoInicial(), tipoConocido: true }
  const nuevo = { ...estadoInicial(), tipoConocido: false }
  expect(pasosPara(conocido, NINGUNA)).toEqual(['placa', 'conductor', 'motivo', 'detalles', 'confirmar'])
  expect(pasosPara(conocido, null)).toEqual(['placa', 'conductor', 'motivo', 'detalles', 'confirmar'])
  expect(pasosPara(nuevo, ASIST)).toEqual(['placa', 'tipo', 'conductor', 'motivo', 'referencia', 'detalles', 'confirmar'])
})

describe('validarPaso', () => {
  const base = () => ({ ...estadoInicial('SALIDA'), placa: 'ABC123', sugerencia: {}, tipo: 'PROPIO', tipoConocido: true })

  test('placa', () => {
    expect(validarPaso('placa', { ...estadoInicial(), placa: ' - ' }, null)).toBe('Escribe la placa')
    expect(validarPaso('placa', { ...estadoInicial(), placa: 'ABC123' }, null)).toBe('Consulta la placa')
    expect(validarPaso('placa', { ...base(), sentido: null }, null)).toBe('Elige si es ingreso o salida')
    expect(validarPaso('placa', base(), null)).toBeNull()
  })

  test('tipo y motivo', () => {
    expect(validarPaso('tipo', { ...base(), tipo: null }, null)).toBe('Elige el tipo de vehículo')
    expect(validarPaso('motivo', base(), null)).toBe('Elige el motivo')
    expect(validarPaso('motivo', { ...base(), motivoId: 1 }, NINGUNA)).toBeNull()
  })

  test('conductor de propio y de proveedor', () => {
    expect(validarPaso('conductor', base(), null)).toBe('Elige el conductor')
    expect(validarPaso('conductor', { ...base(), conductor: { modo: 'otro', nombre: ' ', documento: '' } }, null)).toBe('Escribe el nombre del conductor')
    expect(validarPaso('conductor', { ...base(), conductor: { modo: 'ad', usuario: 'j', nombre: 'J', documento: '' } }, null)).toBeNull()
    const prov = { ...base(), tipo: 'PROVEEDOR', empresa: 'X', conductor: { modo: 'ad', usuario: null, nombre: 'Ana', documento: '' } }
    expect(validarPaso('conductor', prov, null)).toBe('Escribe la empresa, el nombre y el documento del conductor')
    expect(validarPaso('conductor', { ...prov, conductor: { ...prov.conductor, documento: '1' } }, null)).toBeNull()
  })

  test('referencia según el motivo', () => {
    expect(validarPaso('referencia', base(), ASIST)).toBe('Elige la asistencia')
    expect(validarPaso('referencia', base(), EXEQ)).toBe('Elige la exequia')
    expect(validarPaso('referencia', base(), TEXTO)).toBe('Escribe la referencia')
    expect(validarPaso('referencia', { ...base(), referencia: { ...base().referencia, asistenciaId: 5 } }, ASIST)).toBeNull()
    expect(validarPaso('referencia', base(), { ...TEXTO, referencia_obligatoria: false })).toBeNull()
  })

  test('kilometraje', () => {
    expect(validarPaso('detalles', { ...base(), kilometraje: '12a' }, null)).toBe('Kilometraje inválido')
    expect(validarPaso('detalles', { ...base(), kilometraje: '' }, null)).toBeNull()
    expect(validarPaso('detalles', { ...base(), kilometraje: '1500' }, null)).toBeNull()
  })
})

describe('construirCuerpo', () => {
  test('propio con conductor del AD, asistencia y kilometraje', () => {
    const e = { ...estadoInicial('SALIDA'), placa: 'abc-123', tipo: 'PROPIO', tipoConocido: true, motivoId: 2,
      conductor: { modo: 'ad', usuario: 'jperez', nombre: 'Juan', documento: '' },
      referencia: { asistenciaId: 50, exequiaId: null, texto: 'ignorado', etiqueta: '' }, kilometraje: '1200', observaciones: '  ' }
    expect(construirCuerpo(e, ASIST)).toEqual({
      sentido: 'SALIDA', placa: 'ABC123', motivo_id: 2, conductor_usuario: 'jperez', conductor_nombre: 'Juan', kilometraje: 1200, asistencia_id: 50
    })
  })

  test('propio con "otro", exequia, observación y forzado', () => {
    const e = { ...estadoInicial('INGRESO'), placa: 'ABC123', tipo: 'PROPIO', tipoConocido: true, motivoId: 3,
      conductor: { modo: 'otro', usuario: 'x', nombre: ' Pedro ', documento: '' },
      referencia: { asistenciaId: null, exequiaId: 8, texto: '', etiqueta: '' }, observaciones: ' Llegó sin registrar salida ' }
    expect(construirCuerpo(e, EXEQ, { forzar: true })).toEqual({
      sentido: 'INGRESO', placa: 'ABC123', motivo_id: 3, conductor_otro: true, conductor_nombre: 'Pedro', exequia_id: 8,
      observaciones: 'Llegó sin registrar salida', forzar: true
    })
  })

  test('proveedor nuevo con tipo, texto y catálogo', () => {
    const e = { ...estadoInicial('INGRESO'), placa: 'NEW1', sugerencia: { vehiculo_externo: null }, tipo: 'PROVEEDOR', tipoConocido: false, motivoId: 4,
      empresa: ' Cofres SA ', guardarEnCatalogo: true, conductor: { modo: 'ad', usuario: null, nombre: 'Ana', documento: ' 99 ' },
      referencia: { asistenciaId: null, exequiaId: null, texto: ' Repuestos ', etiqueta: '' }, kilometraje: '50' }
    expect(construirCuerpo(e, TEXTO)).toEqual({
      sentido: 'INGRESO', placa: 'NEW1', motivo_id: 4, tipo_vehiculo: 'PROVEEDOR', empresa: 'Cofres SA', conductor_nombre: 'Ana',
      conductor_documento: '99', guardar_en_catalogo: true, referencia_texto: 'Repuestos'
    })
  })
})

test('detalleInconsistencia', () => {
  const nombre = (id) => ({ 1: 'Norte', 2: 'Sur' }[id] || '')
  expect(detalleInconsistencia({ sin_historial: true, dentro: true }, nombre)).toBe('Es el primer registro de esta placa en el sistema.')
  expect(detalleInconsistencia({ otra_sede: true, dentro: true, sede_id: 2 }, nombre)).toBe('Figura dentro de la sede Sur.')
  expect(detalleInconsistencia({ dentro: true, sede_id: 1, desde: new Date(2026, 9, 5, 14, 20).toISOString() }, nombre)).toBe('Figura dentro de Norte desde las 14:20.')
  expect(detalleInconsistencia({ dentro: false, sede_id: 1, desde: null }, nombre)).toBe('Figura fuera.')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` → FAIL (`@/registro/modelo` inexistente).

- [ ] **Step 3: Write the implementation**

```js
// src/registro/modelo.js
// Lógica del asistente de registro, sin dependencias de Vue: qué pasos se muestran, qué falta en cada uno y
// qué cuerpo se envía a POST /eventos. El servidor vuelve a validar todo.
import { normalizarPlaca } from '@/utils/placa'
import { horaCorta } from '@/utils/fechas'

export const PASOS = ['placa', 'tipo', 'conductor', 'motivo', 'referencia', 'detalles', 'confirmar']

export function estadoInicial(sentido = null) {
  return {
    sentido,
    placa: '',
    sugerencia: null,
    tipo: null,
    tipoConocido: false,
    conductor: { modo: 'ad', usuario: null, nombre: '', documento: '' },
    empresa: '',
    guardarEnCatalogo: false,
    motivoId: null,
    referencia: { asistenciaId: null, exequiaId: null, texto: '', etiqueta: '' },
    kilometraje: '',
    observaciones: ''
  }
}

const etiquetaReferencia = (r) => (r ? [r.codigo, r.nombre_ser_querido].filter(Boolean).join(' · ') : '')

export function aplicarSugerencia(estado, s) {
  estado.sugerencia = s
  estado.placa = s.placa
  estado.tipo = s.tipo_vehiculo
  estado.tipoConocido = Boolean(s.tipo_vehiculo)
  if (!estado.sentido) estado.sentido = s.sentido_sugerido
  if (s.vehiculo_externo) estado.empresa = s.vehiculo_externo.empresa || ''

  const p = s.propuesta
  if (!p || estado.sentido !== s.sentido_sugerido) return
  if (p.motivo) estado.motivoId = p.motivo.id
  if (s.tipo_vehiculo === 'PROPIO') {
    estado.referencia = {
      asistenciaId: p.asistencia_id ?? null,
      exequiaId: p.exequia_id ?? null,
      texto: p.referencia_texto || '',
      etiqueta: etiquetaReferencia(p.referencia)
    }
    estado.conductor = p.conductor_otro
      ? { modo: 'otro', usuario: null, nombre: p.conductor_nombre || '', documento: '' }
      : { modo: 'ad', usuario: p.conductor_usuario || null, nombre: p.conductor_nombre || '', documento: '' }
  } else {
    if (p.empresa) estado.empresa = p.empresa
    estado.conductor = { modo: 'ad', usuario: null, nombre: p.conductor_nombre || '', documento: p.conductor_documento || '' }
  }
}

const pideReferencia = (motivo) => Boolean(motivo && motivo.tipo_referencia && motivo.tipo_referencia !== 'NINGUNA')

export function pasosPara(estado, motivo) {
  return PASOS.filter((paso) => {
    if (paso === 'tipo') return !estado.tipoConocido
    if (paso === 'referencia') return pideReferencia(motivo)
    return true
  })
}

const vacio = (v) => !String(v ?? '').trim()

export function validarPaso(paso, estado, motivo) {
  switch (paso) {
    case 'placa':
      if (!normalizarPlaca(estado.placa)) return 'Escribe la placa'
      if (!estado.sugerencia) return 'Consulta la placa'
      if (!estado.sentido) return 'Elige si es ingreso o salida'
      return null
    case 'tipo':
      return estado.tipo ? null : 'Elige el tipo de vehículo'
    case 'conductor': {
      const c = estado.conductor
      if (estado.tipo !== 'PROPIO') {
        return vacio(estado.empresa) || vacio(c.nombre) || vacio(c.documento)
          ? 'Escribe la empresa, el nombre y el documento del conductor' : null
      }
      if (c.modo === 'otro') return vacio(c.nombre) ? 'Escribe el nombre del conductor' : null
      return c.usuario ? null : 'Elige el conductor'
    }
    case 'motivo':
      return estado.motivoId ? null : 'Elige el motivo'
    case 'referencia': {
      if (!motivo || !motivo.referencia_obligatoria) return null
      const r = estado.referencia
      if (motivo.tipo_referencia === 'ASISTENCIA') return r.asistenciaId ? null : 'Elige la asistencia'
      if (motivo.tipo_referencia === 'EXEQUIA') return r.exequiaId ? null : 'Elige la exequia'
      if (motivo.tipo_referencia === 'TEXTO') return vacio(r.texto) ? 'Escribe la referencia' : null
      return null
    }
    case 'detalles':
      return estado.kilometraje === '' || /^\d{1,7}$/.test(String(estado.kilometraje)) ? null : 'Kilometraje inválido'
    default:
      return null
  }
}

export function construirCuerpo(estado, motivo, { forzar = false } = {}) {
  const cuerpo = { sentido: estado.sentido, placa: normalizarPlaca(estado.placa), motivo_id: estado.motivoId }
  if (!estado.tipoConocido) cuerpo.tipo_vehiculo = estado.tipo
  const c = estado.conductor
  if (estado.tipo === 'PROPIO') {
    if (c.modo === 'otro') {
      cuerpo.conductor_otro = true
      cuerpo.conductor_nombre = c.nombre.trim()
    } else {
      // El nombre viaja por si el AD no responde en el servidor (lo acepta con la lista incompleta).
      cuerpo.conductor_usuario = c.usuario
      cuerpo.conductor_nombre = c.nombre.trim()
    }
    if (estado.kilometraje !== '') cuerpo.kilometraje = Number(estado.kilometraje)
  } else {
    cuerpo.empresa = estado.empresa.trim()
    cuerpo.conductor_nombre = c.nombre.trim()
    cuerpo.conductor_documento = c.documento.trim()
    if (estado.guardarEnCatalogo && !(estado.sugerencia && estado.sugerencia.vehiculo_externo)) cuerpo.guardar_en_catalogo = true
  }
  const r = estado.referencia
  if (motivo && motivo.tipo_referencia === 'ASISTENCIA' && r.asistenciaId) cuerpo.asistencia_id = r.asistenciaId
  if (motivo && motivo.tipo_referencia === 'EXEQUIA' && r.exequiaId) cuerpo.exequia_id = r.exequiaId
  if (motivo && motivo.tipo_referencia === 'TEXTO' && !vacio(r.texto)) cuerpo.referencia_texto = r.texto.trim()
  if (!vacio(estado.observaciones)) cuerpo.observaciones = estado.observaciones.trim()
  if (forzar) cuerpo.forzar = true
  return cuerpo
}

/** Texto bajo el mensaje del servidor en el diálogo de "registrar igual". */
export function detalleInconsistencia(e, nombreSede) {
  if (!e) return ''
  if (e.sin_historial) return 'Es el primer registro de esta placa en el sistema.'
  if (e.otra_sede) return `Figura dentro de la sede ${nombreSede(e.sede_id)}.`
  if (e.dentro) {
    const donde = e.sede_id ? ` de ${nombreSede(e.sede_id)}` : ''
    const desde = e.desde ? ` desde las ${horaCorta(e.desde)}` : ''
    return `Figura dentro${donde}${desde}.`
  }
  return 'Figura fuera.'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: lógica del asistente de registro (pasos, validación y cuerpo)"
```

---

### Task 5: Asistente de registro (vista) y diálogo "registrar igual"

**Files:**
- Create: `src/components/ListaBuscable.vue`, `src/components/DialogoInconsistencia.vue`
- Replace: `src/views/RegistroView.vue`
- Test: `src/components/__tests__/dialogoInconsistencia.spec.js`, `src/components/__tests__/listaBuscable.spec.js`, `src/views/__tests__/registro.spec.js`

**Interfaces:**
- Consumes: stores (Task 2), `modelo.js` (Task 4), `MarcoGuarda` (Task 3), `normalizarPlaca`, `useToast` de `vue-toastification`.
- Produces:
  - `ListaBuscable` props `{ buscar: (q) => Promise<item[]>, etiqueta: (item) => string, clave: (item) => any, seleccionado: any, placeholder: String, inmediata: Boolean }`; emite `elegir(item)`. Busca 300 ms después de escribir (y al montar si `inmediata`). `data-test`: `buscable-texto`, `buscable-item` (uno por resultado, con `aria-selected` en el elegido).
  - `DialogoInconsistencia` props `{ mensaje, detalle }`; emite `registrar-igual(observacion)` y `cancelar`. `data-test`: `inconsistencia-mensaje`, `inconsistencia-detalle`, `inconsistencia-observacion`, `inconsistencia-registrar`, `inconsistencia-cancelar`.
  - `RegistroView` (`/registrar/:sentido?` con `?placa=` opcional). `data-test`: `paso-<nombre>`, `registro-placa`, `registro-consultar`, `registro-sentido-INGRESO`/`-SALIDA`, `registro-tipo-PROVEEDOR`/`-PROVEEDOR_ASISTENCIA`, `registro-conductor-otro`, `registro-conductor-nombre`, `registro-conductor-documento`, `registro-empresa`, `registro-catalogo`, `registro-motivo-<id>`, `registro-referencia-texto`, `registro-km`, `registro-observaciones`, `registro-error`, `registro-atras`, `registro-siguiente`.

- [ ] **Step 1: Write the failing tests**

```js
// src/components/__tests__/dialogoInconsistencia.spec.js
import { test, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DialogoInconsistencia from '@/components/DialogoInconsistencia.vue'

test('exige observación para registrar igual', async () => {
  const w = mount(DialogoInconsistencia, { props: { mensaje: 'Este vehículo figura dentro.', detalle: 'Figura dentro de Norte desde las 14:20.' } })
  expect(w.get('[data-test=inconsistencia-mensaje]').text()).toBe('Este vehículo figura dentro.')
  expect(w.get('[data-test=inconsistencia-detalle]').text()).toBe('Figura dentro de Norte desde las 14:20.')
  const boton = w.get('[data-test=inconsistencia-registrar]')
  expect(boton.attributes('disabled')).toBeDefined()
  await w.get('[data-test=inconsistencia-observacion]').setValue('  Salió sin registrar  ')
  expect(boton.attributes('disabled')).toBeUndefined()
  await boton.trigger('click')
  expect(w.emitted('registrar-igual')).toEqual([['Salió sin registrar']])
  await w.get('[data-test=inconsistencia-cancelar]').trigger('click')
  expect(w.emitted('cancelar')).toHaveLength(1)
})
```

```js
// src/components/__tests__/listaBuscable.spec.js
import { test, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ListaBuscable from '@/components/ListaBuscable.vue'

test('busca 300 ms después de escribir y emite el elegido', async () => {
  vi.useFakeTimers()
  const buscar = vi.fn(async (q) => [{ id: 1, nombre: `R ${q}` }])
  const w = mount(ListaBuscable, { props: { buscar, etiqueta: (i) => i.nombre, clave: (i) => i.id, seleccionado: null } })
  await w.get('[data-test=buscable-texto]').setValue('mar')
  expect(buscar).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  expect(buscar).toHaveBeenCalledWith('mar')
  const item = w.get('[data-test=buscable-item]')
  expect(item.text()).toBe('R mar')
  await item.trigger('click')
  expect(w.emitted('elegir')).toEqual([[{ id: 1, nombre: 'R mar' }]])
  vi.useRealTimers()
})

test('inmediata busca al montar y marca el seleccionado', async () => {
  const buscar = vi.fn(async () => [{ id: 1, nombre: 'A' }, { id: 2, nombre: 'B' }])
  const w = mount(ListaBuscable, { props: { buscar, etiqueta: (i) => i.nombre, clave: (i) => i.id, seleccionado: 2, inmediata: true } })
  await flushPromises()
  expect(buscar).toHaveBeenCalledWith('')
  expect(w.findAll('[data-test=buscable-item]').map((i) => i.attributes('aria-selected'))).toEqual(['false', 'true'])
})
```

```js
// src/views/__tests__/registro.spec.js
// Flujo completo del asistente con la API simulada.
import { test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/services/api', () => ({
  porteria: { get: vi.fn(), post: vi.fn() },
  tokenStorage: { leer: () => 't', guardar: () => {} }
}))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

import { porteria } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import RegistroView from '@/views/RegistroView.vue'

const SUGERENCIA = {
  placa: 'ABC123', tipo_vehiculo: 'PROPIO', vehiculo: { id: 9, placa: 'ABC123' }, vehiculo_externo: null,
  estado: null, sentido_sugerido: 'SALIDA', propuesta: null
}
const MOTIVOS = [{ id: 6, codigo: 'TANQUEO', nombre: 'Tanqueo', tipo_referencia: 'NINGUNA', referencia_obligatoria: false }]

function apiSimulada() {
  porteria.get.mockImplementation(async (url) => {
    if (url.startsWith('/estado/placa/')) return { data: SUGERENCIA }
    if (url === '/catalogos/conductores') return { data: [{ usuario: 'jperez', nombre: 'Juan Pérez' }] }
    if (url === '/catalogos/motivos') return { data: MOTIVOS }
    if (url === '/catalogos/sedes') return { data: [{ id: 1, nombre: 'Norte' }] }
    return { data: [] }
  })
}

async function montar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/registrar/:sentido?', component: RegistroView }, { path: '/inicio', component: { template: '<div />' } }]
  })
  router.push('/registrar')
  await router.isReady()
  const w = mount(RegistroView, { global: { plugins: [router], stubs: { MarcoGuarda: { template: '<div><slot /></div>' } } } })
  await flushPromises()
  return { w, router }
}

async function avanzar(w) {
  await w.get('[data-test=registro-siguiente]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  setActivePinia(createPinia())
  vi.clearAllMocks()
  useAuthStore().usuario = { usuario: 'g1', nombre: 'G', rol: 'guarda', sede: { id: 1, nombre: 'Norte' } }
  apiSimulada()
})

async function llenarHastaConfirmar(w) {
  await w.get('[data-test=registro-placa]').setValue('abc-123')
  await w.get('[data-test=registro-consultar]').trigger('click')
  await flushPromises()
  expect(porteria.get).toHaveBeenCalledWith('/estado/placa/ABC123')
  await avanzar(w)
  expect(w.find('[data-test=paso-conductor]').exists()).toBe(true)
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  await w.get('[data-test=buscable-item]').trigger('click')
  await avanzar(w)
  await w.get('[data-test=registro-motivo-6]').trigger('click')
  await avanzar(w)
  expect(w.find('[data-test=paso-detalles]').exists()).toBe(true)
  await w.get('[data-test=registro-km]').setValue('1200')
  await avanzar(w)
  expect(w.find('[data-test=paso-confirmar]').exists()).toBe(true)
}

test('registra la salida de un propio con los pasos que aplican', async () => {
  porteria.post.mockResolvedValue({ data: { id: 1, sentido: 'SALIDA', placa: 'ABC123' } })
  const { w, router } = await montar()
  await llenarHastaConfirmar(w)
  await avanzar(w)
  expect(porteria.post).toHaveBeenCalledWith('/eventos', {
    sentido: 'SALIDA', placa: 'ABC123', motivo_id: 6, conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez', kilometraje: 1200
  })
  expect(router.currentRoute.value.path).toBe('/inicio')
})

test('un 409 de sentido abre el diálogo y "registrar igual" reenvía con observación', async () => {
  porteria.post
    .mockRejectedValueOnce({
      status: 409, motivo: 'SENTIDO_INCOHERENTE', message: 'Este vehículo figura fuera. Para registrar la salida igual, confírmalo y escribe una observación.',
      errors: { estado: { dentro: false, sede_id: 1, desde: null, sin_historial: false, otra_sede: false } }
    })
    .mockResolvedValueOnce({ data: { id: 2, sentido: 'SALIDA', placa: 'ABC123' } })
  const { w } = await montar()
  await llenarHastaConfirmar(w)
  await avanzar(w)
  expect(w.get('[data-test=inconsistencia-detalle]').text()).toBe('Figura fuera.')
  await w.get('[data-test=inconsistencia-observacion]').setValue('Salió de noche sin registro')
  await w.get('[data-test=inconsistencia-registrar]').trigger('click')
  await flushPromises()
  expect(porteria.post).toHaveBeenLastCalledWith('/eventos', expect.objectContaining({ forzar: true, observaciones: 'Salió de noche sin registro' }))
})

test('un paso incompleto muestra el error y no avanza', async () => {
  const { w } = await montar()
  await avanzar(w)
  expect(w.get('[data-test=registro-error]').text()).toBe('Escribe la placa')
  expect(w.find('[data-test=paso-placa]').exists()).toBe(true)
})

test('otros errores del servidor se muestran sin diálogo', async () => {
  porteria.post.mockRejectedValue({ status: 409, motivo: 'OCUPADO', message: 'Otro registro de esta placa está en curso. Intenta de nuevo.', errors: [] })
  const { w } = await montar()
  await llenarHastaConfirmar(w)
  await avanzar(w)
  expect(w.find('[data-test=inconsistencia-registrar]').exists()).toBe(false)
  expect(w.get('[data-test=registro-error]').text()).toBe('Otro registro de esta placa está en curso. Intenta de nuevo.')
})
```

Agrega al final del archivo `afterEach(() => vi.useRealTimers())` (importa `afterEach` de vitest).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → FAIL.

- [ ] **Step 3: Write the implementation**

```vue
<!-- src/components/DialogoInconsistencia.vue -->
<script setup>
import { ref, computed } from 'vue'

defineProps({ mensaje: { type: String, required: true }, detalle: { type: String, default: '' } })
const emit = defineEmits(['registrar-igual', 'cancelar'])
const observacion = ref('')
const lista = computed(() => observacion.value.trim().length > 0)
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
    <div class="tarjeta w-full max-w-md space-y-4">
      <p class="text-lg font-bold text-amber-800" data-test="inconsistencia-mensaje">{{ mensaje }}</p>
      <p v-if="detalle" class="text-gray-700" data-test="inconsistencia-detalle">{{ detalle }}</p>
      <div>
        <label class="etiqueta" for="observacion">Observación (obligatoria)</label>
        <textarea id="observacion" v-model="observacion" rows="3" class="campo py-2" maxlength="500" data-test="inconsistencia-observacion" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn-secundario" data-test="inconsistencia-cancelar" @click="emit('cancelar')">Cancelar</button>
        <button type="button" class="btn-primario" :disabled="!lista" data-test="inconsistencia-registrar" @click="emit('registrar-igual', observacion.trim())">
          Registrar igual
        </button>
      </div>
    </div>
  </div>
</template>
```

```vue
<!-- src/components/ListaBuscable.vue -->
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  buscar: { type: Function, required: true },
  etiqueta: { type: Function, required: true },
  clave: { type: Function, required: true },
  seleccionado: { type: [String, Number, null], default: null },
  placeholder: { type: String, default: 'Buscar…' },
  inmediata: { type: Boolean, default: false }
})
const emit = defineEmits(['elegir'])

const texto = ref('')
const resultados = ref([])
const error = ref('')
let temporizador = null
let ultima = 0

async function ejecutar() {
  const numero = ++ultima
  error.value = ''
  try {
    const items = await props.buscar(texto.value.trim())
    if (numero === ultima) resultados.value = items
  } catch (e) {
    if (numero === ultima) error.value = e.message || 'No se pudo buscar'
  }
}

function alEscribir() {
  clearTimeout(temporizador)
  temporizador = setTimeout(ejecutar, 300)
}

onMounted(() => { if (props.inmediata) ejecutar() })
onBeforeUnmount(() => clearTimeout(temporizador))
</script>

<template>
  <div class="space-y-2">
    <input v-model="texto" class="campo" :placeholder="placeholder" data-test="buscable-texto" @input="alEscribir" />
    <p v-if="error" class="aviso-error">{{ error }}</p>
    <ul class="space-y-2">
      <li v-for="item in resultados" :key="clave(item)">
        <button
          type="button" class="btn w-full justify-start text-left border-2"
          :class="clave(item) === seleccionado ? 'border-primary-600 bg-primary-50' : 'border-gray-200 bg-white'"
          :aria-selected="String(clave(item) === seleccionado)" data-test="buscable-item" @click="emit('elegir', item)"
        >{{ etiqueta(item) }}</button>
      </li>
    </ul>
  </div>
</template>
```

```vue
<!-- src/views/RegistroView.vue -->
<script setup>
import { reactive, ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vue-toastification'
import MarcoGuarda from '@/components/MarcoGuarda.vue'
import ListaBuscable from '@/components/ListaBuscable.vue'
import DialogoInconsistencia from '@/components/DialogoInconsistencia.vue'
import { useAuthStore } from '@/stores/auth'
import { useCatalogosStore } from '@/stores/catalogos'
import { useEstadoStore } from '@/stores/estado'
import { useEventosStore } from '@/stores/eventos'
import { normalizarPlaca } from '@/utils/placa'
import { estadoInicial, aplicarSugerencia, pasosPara, validarPaso, construirCuerpo, detalleInconsistencia } from '@/registro/modelo'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const auth = useAuthStore()
const catalogos = useCatalogosStore()
const estadoStore = useEstadoStore()
const eventos = useEventosStore()

const sentidoInicial = ['INGRESO', 'SALIDA'].includes(route.params.sentido) ? route.params.sentido : null
const estado = reactive(estadoInicial(sentidoInicial))
const indice = ref(0)
const error = ref('')
const enviando = ref(false)
const motivos = ref([])
const inconsistencia = ref(null)

const motivo = computed(() => motivos.value.find((m) => m.id === estado.motivoId) || null)
const pasos = computed(() => pasosPara(estado, motivo.value))
const paso = computed(() => pasos.value[indice.value])
const esPropio = computed(() => estado.tipo === 'PROPIO')
const TIPOS = [{ valor: 'PROVEEDOR', texto: 'Proveedor' }, { valor: 'PROVEEDOR_ASISTENCIA', texto: 'Proveedor de asistencias' }]

watch(() => [estado.tipo, estado.sentido], async ([tipo, sentido]) => {
  motivos.value = tipo && sentido ? await catalogos.motivos(tipo, sentido) : []
})

onMounted(async () => {
  auth.cargarSedes().catch(() => {})
  if (typeof route.query.placa === 'string' && route.query.placa) {
    estado.placa = route.query.placa
    await consultarPlaca()
  }
})

async function consultarPlaca() {
  error.value = ''
  const placa = normalizarPlaca(estado.placa)
  if (!placa) {
    error.value = 'Escribe la placa'
    return
  }
  try {
    const sentido = estado.sentido
    Object.assign(estado, estadoInicial(sentido), { placa })
    aplicarSugerencia(estado, await estadoStore.sugerir(placa))
  } catch (e) {
    error.value = e.message
  }
}

function siguiente() {
  const falta = validarPaso(paso.value, estado, motivo.value)
  if (falta) {
    error.value = falta
    return
  }
  error.value = ''
  if (paso.value === 'confirmar') return enviar(false)
  indice.value += 1
}

function atras() {
  error.value = ''
  if (indice.value > 0) indice.value -= 1
  else router.back()
}

async function enviar(forzar) {
  enviando.value = true
  error.value = ''
  try {
    const ev = await eventos.registrar(construirCuerpo(estado, motivo.value, { forzar }))
    toast.success(`${ev.sentido === 'INGRESO' ? 'Ingreso' : 'Salida'} de ${ev.placa} registrado`)
    router.replace('/inicio')
  } catch (e) {
    if (e.status === 409 && e.motivo === 'SENTIDO_INCOHERENTE') {
      inconsistencia.value = { mensaje: e.message, detalle: detalleInconsistencia(e.errors && e.errors.estado, auth.nombreSede) }
    } else {
      error.value = e.message
    }
  } finally {
    enviando.value = false
  }
}

function registrarIgual(observacion) {
  estado.observaciones = observacion
  inconsistencia.value = null
  enviar(true)
}

const buscarConductor = async (q) => {
  const lista = await catalogos.conductores()
  const t = q.toLowerCase()
  return t ? lista.filter((c) => c.nombre.toLowerCase().includes(t) || c.usuario.toLowerCase().includes(t)) : lista
}
function elegirConductor(c) {
  estado.conductor = { modo: 'ad', usuario: c.usuario, nombre: c.nombre, documento: '' }
}
function usarOtro() {
  estado.conductor = { modo: 'otro', usuario: null, nombre: '', documento: '' }
}
const buscarAsistencia = (q) => catalogos.asistencias(q || undefined)
const buscarExequia = (q) => catalogos.exequias({ q: q || undefined, placa: estado.placa })
function elegirAsistencia(a) {
  estado.referencia = { asistenciaId: a.id, exequiaId: null, texto: '', etiqueta: `${a.codigo} · ${a.nombre_ser_querido}` }
}
function elegirExequia(x) {
  estado.referencia = { asistenciaId: null, exequiaId: x.id, texto: '', etiqueta: `${x.asistencia_codigo} · ${x.nombre_ser_querido}` }
}
const etiquetaExequia = (x) => `${x.es_de_la_placa ? '★ ' : ''}${x.tipo || 'Exequia'} ${x.fecha}${x.hora ? ` ${x.hora}` : ''} · ${x.nombre_ser_querido}${x.lugar ? ` · ${x.lugar}` : ''}`
</script>

<template>
  <MarcoGuarda :titulo="estado.sentido === 'INGRESO' ? 'Registrar ingreso' : estado.sentido === 'SALIDA' ? 'Registrar salida' : 'Registrar'">
    <div class="space-y-4">
      <section v-if="paso === 'placa'" class="space-y-3" data-test="paso-placa">
        <label class="etiqueta" for="placa">Placa</label>
        <div class="flex gap-2">
          <input id="placa" v-model="estado.placa" class="campo uppercase text-2xl tracking-widest" autocapitalize="characters" data-test="registro-placa" @keyup.enter="consultarPlaca" />
          <button type="button" class="btn-secundario" data-test="registro-consultar" @click="consultarPlaca">Consultar</button>
        </div>
        <div v-if="estado.sugerencia" class="tarjeta space-y-2">
          <p class="text-xl font-bold">{{ estado.sugerencia.placa }}</p>
          <p v-if="estado.sugerencia.vehiculo">Vehículo de la empresa · {{ estado.sugerencia.vehiculo.marca }} {{ estado.sugerencia.vehiculo.modelo }}</p>
          <p v-else-if="estado.sugerencia.vehiculo_externo">Proveedor · {{ estado.sugerencia.vehiculo_externo.empresa }}</p>
          <p v-else>Placa nueva</p>
          <p v-if="estado.sugerencia.estado" class="text-gray-700">
            {{ estado.sugerencia.estado.dentro ? 'Figura dentro' : 'Figura fuera' }}{{ estado.sugerencia.estado.sede_id ? ` · ${auth.nombreSede(estado.sugerencia.estado.sede_id)}` : '' }}
          </p>
          <div class="grid grid-cols-2 gap-3 pt-2">
            <button
              v-for="s in ['INGRESO', 'SALIDA']" :key="s" type="button" class="btn border-2"
              :class="estado.sentido === s ? 'bg-primary-700 text-white border-primary-700' : 'bg-white border-gray-300'"
              :data-test="`registro-sentido-${s}`" @click="estado.sentido = s"
            >{{ s === 'INGRESO' ? 'Ingreso' : 'Salida' }}</button>
          </div>
        </div>
      </section>

      <section v-else-if="paso === 'tipo'" class="space-y-3" data-test="paso-tipo">
        <p class="etiqueta">¿Qué tipo de vehículo es?</p>
        <button
          v-for="t in TIPOS" :key="t.valor" type="button" class="btn btn-grande w-full border-2"
          :class="estado.tipo === t.valor ? 'bg-primary-700 text-white border-primary-700' : 'bg-white border-gray-300'"
          :data-test="`registro-tipo-${t.valor}`" @click="estado.tipo = t.valor"
        >{{ t.texto }}</button>
      </section>

      <section v-else-if="paso === 'conductor'" class="space-y-3" data-test="paso-conductor">
        <template v-if="esPropio">
          <p class="etiqueta">Conductor</p>
          <template v-if="estado.conductor.modo === 'ad'">
            <ListaBuscable
              :buscar="buscarConductor" :etiqueta="(c) => c.nombre" :clave="(c) => c.usuario"
              :seleccionado="estado.conductor.usuario" placeholder="Buscar conductor" inmediata @elegir="elegirConductor"
            />
            <button type="button" class="btn-secundario w-full" data-test="registro-conductor-otro" @click="usarOtro">Otro (no está en la lista)</button>
          </template>
          <template v-else>
            <input v-model="estado.conductor.nombre" class="campo" placeholder="Nombre del conductor" data-test="registro-conductor-nombre" />
            <button type="button" class="btn-secundario w-full" @click="estado.conductor = { modo: 'ad', usuario: null, nombre: '', documento: '' }">Elegir de la lista</button>
          </template>
        </template>
        <template v-else>
          <div><label class="etiqueta" for="empresa">Empresa</label><input id="empresa" v-model="estado.empresa" class="campo" data-test="registro-empresa" /></div>
          <div><label class="etiqueta" for="cnombre">Nombre del conductor</label><input id="cnombre" v-model="estado.conductor.nombre" class="campo" data-test="registro-conductor-nombre" /></div>
          <div><label class="etiqueta" for="cdoc">Documento del conductor</label><input id="cdoc" v-model="estado.conductor.documento" class="campo" inputmode="numeric" data-test="registro-conductor-documento" /></div>
          <label v-if="!estado.sugerencia || !estado.sugerencia.vehiculo_externo" class="flex items-center gap-3 min-h-tactil">
            <input v-model="estado.guardarEnCatalogo" type="checkbox" class="w-6 h-6" data-test="registro-catalogo" />
            Guardar esta placa para la próxima vez
          </label>
        </template>
      </section>

      <section v-else-if="paso === 'motivo'" class="space-y-3" data-test="paso-motivo">
        <p class="etiqueta">Motivo</p>
        <button
          v-for="m in motivos" :key="m.id" type="button" class="btn w-full justify-start border-2"
          :class="estado.motivoId === m.id ? 'bg-primary-700 text-white border-primary-700' : 'bg-white border-gray-300'"
          :data-test="`registro-motivo-${m.id}`" @click="estado.motivoId = m.id"
        >{{ m.nombre }}</button>
      </section>

      <section v-else-if="paso === 'referencia'" class="space-y-3" data-test="paso-referencia">
        <p v-if="estado.referencia.etiqueta" class="tarjeta">Elegida: {{ estado.referencia.etiqueta }}</p>
        <template v-if="motivo.tipo_referencia === 'ASISTENCIA'">
          <p class="etiqueta">Asistencia</p>
          <ListaBuscable
            :buscar="buscarAsistencia" :etiqueta="(a) => `${a.codigo} · ${a.nombre_ser_querido}`" :clave="(a) => a.id"
            :seleccionado="estado.referencia.asistenciaId" placeholder="Código, ser querido o contrato" inmediata @elegir="elegirAsistencia"
          />
        </template>
        <template v-else-if="motivo.tipo_referencia === 'EXEQUIA'">
          <p class="etiqueta">Exequia</p>
          <ListaBuscable
            :buscar="buscarExequia" :etiqueta="etiquetaExequia" :clave="(x) => x.id"
            :seleccionado="estado.referencia.exequiaId" placeholder="Código o ser querido" inmediata @elegir="elegirExequia"
          />
        </template>
        <template v-else>
          <label class="etiqueta" for="reftexto">Referencia</label>
          <input id="reftexto" v-model="estado.referencia.texto" class="campo" maxlength="255" data-test="registro-referencia-texto" />
        </template>
      </section>

      <section v-else-if="paso === 'detalles'" class="space-y-3" data-test="paso-detalles">
        <div v-if="esPropio">
          <label class="etiqueta" for="km">Kilometraje (opcional)</label>
          <input id="km" v-model="estado.kilometraje" class="campo" inputmode="numeric" data-test="registro-km" />
        </div>
        <div>
          <label class="etiqueta" for="obs">Observaciones (opcional)</label>
          <textarea id="obs" v-model="estado.observaciones" rows="3" class="campo py-2" maxlength="500" data-test="registro-observaciones" />
        </div>
      </section>

      <section v-else-if="paso === 'confirmar'" class="tarjeta space-y-1" data-test="paso-confirmar">
        <p class="text-xl font-bold">{{ estado.sentido === 'INGRESO' ? 'Ingreso' : 'Salida' }} · {{ estado.placa }}</p>
        <p>Conductor: {{ estado.conductor.nombre || estado.conductor.usuario }}</p>
        <p v-if="!esPropio">Empresa: {{ estado.empresa }}</p>
        <p>Motivo: {{ motivo ? motivo.nombre : '' }}</p>
        <p v-if="estado.referencia.etiqueta || estado.referencia.texto">Referencia: {{ estado.referencia.etiqueta || estado.referencia.texto }}</p>
        <p v-if="estado.kilometraje">Kilometraje: {{ estado.kilometraje }}</p>
        <p v-if="estado.observaciones">Observaciones: {{ estado.observaciones }}</p>
      </section>

      <p v-if="error" class="aviso-error" data-test="registro-error">{{ error }}</p>

      <div class="grid grid-cols-2 gap-3 pt-2">
        <button type="button" class="btn-secundario" data-test="registro-atras" @click="atras">Atrás</button>
        <button type="button" class="btn-primario" :disabled="enviando" data-test="registro-siguiente" @click="siguiente">
          {{ paso === 'confirmar' ? (enviando ? 'Registrando…' : 'Registrar') : 'Siguiente' }}
        </button>
      </div>
    </div>

    <DialogoInconsistencia
      v-if="inconsistencia" :mensaje="inconsistencia.mensaje" :detalle="inconsistencia.detalle"
      @registrar-igual="registrarIgual" @cancelar="inconsistencia = null"
    />
  </MarcoGuarda>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` → PASS. Si el flujo falla por temporizadores, revisa que `ListaBuscable` con `inmediata` cargue al montar (en la prueba se avanzan 300 ms por si el componente busca con retraso; con `inmediata` ya hay resultados).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: asistente de registro de ingresos y salidas con el diálogo registrar igual"
```

---

### Task 6: Inicio, vehículos dentro/fuera y movimientos del día

**Files:**
- Create: `src/components/DialogoTexto.vue`
- Replace: `src/views/InicioView.vue`, `src/views/VehiculosView.vue`, `src/views/MovimientosView.vue`
- Test: `src/views/__tests__/inicio.spec.js`, `src/views/__tests__/vehiculos.spec.js`, `src/views/__tests__/movimientos.spec.js`

**Interfaces:**
- Consumes: stores, `MarcoGuarda`, `haceCuanto`, `horaCorta`, `normalizarPlaca`, `puedeEditar`, `useToast`.
- Produces:
  - `DialogoTexto` props `{ titulo, etiqueta, valorInicial = '', obligatorio = true, numerico = false }`; emite `aceptar(valor)` / `cancelar`. `data-test`: `dialogo-texto`, `dialogo-aceptar`, `dialogo-cancelar`.
  - InicioView `data-test`: `inicio-ingreso`, `inicio-salida`, `inicio-placa`, `inicio-buscar`, `inicio-dentro` (número), `inicio-fuera` (número).
  - VehiculosView: pestañas `vehiculos-tab-dentro` / `vehiculos-tab-fuera`; filas `vehiculo-fila`; acción `vehiculo-accion` (→ `/registrar/SALIDA?placa=` desde "dentro", `/registrar/INGRESO?placa=` desde "fuera"); la fila de carga inicial muestra "Carga inicial".
  - MovimientosView: filas `movimiento-fila`; botones `movimiento-anular` y `movimiento-km` (corregir kilometraje, solo propios) visibles si `puedeEditar`; marcas `movimiento-anulado`, `movimiento-inconsistente`.

- [ ] **Step 1: Write the failing tests**

```js
// src/views/__tests__/inicio.spec.js
import { test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn() }, tokenStorage: { leer: () => 't', guardar: () => {} } }))

import { porteria } from '@/services/api'
import InicioView from '@/views/InicioView.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  porteria.get.mockImplementation(async (url) => ({ data: url === '/estado/dentro' ? [{ placa: 'A' }, { placa: 'B' }] : [{ placa: 'C' }] }))
})

test('contadores y accesos al registro', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/inicio', component: InicioView }, { path: '/registrar/:sentido?', component: { template: '<div />' } }] })
  router.push('/inicio')
  await router.isReady()
  const w = mount(InicioView, { global: { plugins: [router], stubs: { MarcoGuarda: { template: '<div><slot /></div>' } } } })
  await flushPromises()
  expect(w.get('[data-test=inicio-dentro]').text()).toBe('2')
  expect(w.get('[data-test=inicio-fuera]').text()).toBe('1')
  await w.get('[data-test=inicio-placa]').setValue('abc-123')
  await w.get('[data-test=inicio-buscar]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/registrar?placa=ABC123')
  await w.get('[data-test=inicio-salida]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/registrar/SALIDA')
})
```

```js
// src/views/__tests__/vehiculos.spec.js
import { test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn() }, tokenStorage: { leer: () => 't', guardar: () => {} } }))

import { porteria } from '@/services/api'
import VehiculosView from '@/views/VehiculosView.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  porteria.get.mockImplementation(async (url) => {
    if (url === '/estado/dentro') return { data: [
      { id: 1, placa: 'XYZ1', tipo_vehiculo: 'PROVEEDOR', empresa: 'Flores', motivo: { nombre: 'Entrega' }, registrado_at: new Date().toISOString(), carga_inicial: false },
      { id: null, placa: 'CAR1', tipo_vehiculo: 'PROPIO', motivo: null, registrado_at: new Date().toISOString(), carga_inicial: true }
    ] }
    if (url === '/estado/fuera') return { data: [{ id: 2, placa: 'CAR2', tipo_vehiculo: 'PROPIO', sede_id: 1, motivo: { nombre: 'Exequias' }, registrado_at: new Date().toISOString() }] }
    return { data: [{ id: 1, nombre: 'Norte' }] }
  })
})

test('dentro y fuera con acción rápida', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/vehiculos', component: VehiculosView }, { path: '/registrar/:sentido?', component: { template: '<div />' } }] })
  router.push('/vehiculos')
  await router.isReady()
  const w = mount(VehiculosView, { global: { plugins: [router], stubs: { MarcoGuarda: { template: '<div><slot /></div>' } } } })
  await flushPromises()
  const filas = w.findAll('[data-test=vehiculo-fila]')
  expect(filas).toHaveLength(2)
  expect(filas[1].text()).toContain('Carga inicial')
  await filas[0].get('[data-test=vehiculo-accion]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/registrar/SALIDA?placa=XYZ1')

  await router.push('/vehiculos')
  await w.get('[data-test=vehiculos-tab-fuera]').trigger('click')
  const fuera = w.findAll('[data-test=vehiculo-fila]')
  expect(fuera).toHaveLength(1)
  expect(fuera[0].text()).toContain('Norte')
  await fuera[0].get('[data-test=vehiculo-accion]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/registrar/INGRESO?placa=CAR2')
})
```

```js
// src/views/__tests__/movimientos.spec.js
import { test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, tokenStorage: { leer: () => 't', guardar: () => {} } }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

import { porteria } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import MovimientosView from '@/views/MovimientosView.vue'

const reciente = () => new Date(Date.now() - 2 * 60000).toISOString()

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  useAuthStore().usuario = { usuario: 'g1', nombre: 'G', rol: 'guarda', sede: { id: 1, nombre: 'Norte' } }
  porteria.get.mockResolvedValue({ data: { items: [
    { id: 1, sentido: 'SALIDA', placa: 'CAR1', tipo_vehiculo: 'PROPIO', motivo: { nombre: 'Tanqueo' }, conductor_nombre: 'Juan', registrado_por: 'g1', registrado_at: reciente(), anulado: false, inconsistente: false },
    { id: 2, sentido: 'INGRESO', placa: 'XYZ1', tipo_vehiculo: 'PROVEEDOR', motivo: { nombre: 'Entrega' }, conductor_nombre: 'Ana', registrado_por: 'otro', registrado_at: reciente(), anulado: false, inconsistente: true },
    { id: 3, sentido: 'SALIDA', placa: 'CAR3', tipo_vehiculo: 'PROPIO', motivo: { nombre: 'Lavado' }, conductor_nombre: 'Luis', registrado_por: 'g1', registrado_at: reciente(), anulado: true, inconsistente: false }
  ], total: 3 } })
})

function montar() {
  return mount(MovimientosView, { global: { stubs: { MarcoGuarda: { template: '<div><slot /></div>' } } } })
}

test('muestra marcas y solo ofrece editar lo propio reciente', async () => {
  const w = montar()
  await flushPromises()
  const filas = w.findAll('[data-test=movimiento-fila]')
  expect(filas).toHaveLength(3)
  expect(filas[0].find('[data-test=movimiento-anular]').exists()).toBe(true)
  expect(filas[0].find('[data-test=movimiento-km]').exists()).toBe(true)
  expect(filas[1].find('[data-test=movimiento-anular]').exists()).toBe(false)
  expect(filas[1].find('[data-test=movimiento-inconsistente]').exists()).toBe(true)
  expect(filas[2].find('[data-test=movimiento-anulado]').exists()).toBe(true)
  expect(filas[2].find('[data-test=movimiento-anular]').exists()).toBe(false)
})

test('anular pide el motivo y actualiza la fila', async () => {
  porteria.post.mockResolvedValue({ data: { id: 1, sentido: 'SALIDA', placa: 'CAR1', motivo: { nombre: 'Tanqueo' }, registrado_por: 'g1', registrado_at: reciente(), anulado: true } })
  const w = montar()
  await flushPromises()
  await w.findAll('[data-test=movimiento-fila]')[0].get('[data-test=movimiento-anular]').trigger('click')
  await w.get('[data-test=dialogo-texto]').setValue('Placa equivocada')
  await w.get('[data-test=dialogo-aceptar]').trigger('click')
  await flushPromises()
  expect(porteria.post).toHaveBeenCalledWith('/eventos/1/anular', { motivo: 'Placa equivocada' })
  expect(w.findAll('[data-test=movimiento-fila]')[0].find('[data-test=movimiento-anulado]').exists()).toBe(true)
})

test('corregir kilometraje', async () => {
  porteria.patch.mockResolvedValue({ data: { id: 1, sentido: 'SALIDA', placa: 'CAR1', motivo: { nombre: 'Tanqueo' }, registrado_por: 'g1', registrado_at: reciente(), anulado: false, kilometraje: 1500 } })
  const w = montar()
  await flushPromises()
  await w.findAll('[data-test=movimiento-fila]')[0].get('[data-test=movimiento-km]').trigger('click')
  await w.get('[data-test=dialogo-texto]').setValue('1500')
  await w.get('[data-test=dialogo-aceptar]').trigger('click')
  await flushPromises()
  expect(porteria.patch).toHaveBeenCalledWith('/eventos/1', { kilometraje: 1500 })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` → FAIL.

- [ ] **Step 3: Write the implementation**

```vue
<!-- src/components/DialogoTexto.vue -->
<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  titulo: { type: String, required: true },
  etiqueta: { type: String, required: true },
  valorInicial: { type: [String, Number], default: '' },
  obligatorio: { type: Boolean, default: true },
  numerico: { type: Boolean, default: false }
})
const emit = defineEmits(['aceptar', 'cancelar'])
const valor = ref(String(props.valorInicial ?? ''))
const valido = computed(() => {
  const v = valor.value.trim()
  if (props.numerico) return /^\d{1,7}$/.test(v)
  return !props.obligatorio || v.length > 0
})
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
    <div class="tarjeta w-full max-w-md space-y-4">
      <p class="text-lg font-bold">{{ titulo }}</p>
      <label class="etiqueta" for="dialogo-valor">{{ etiqueta }}</label>
      <input id="dialogo-valor" v-model="valor" class="campo" :inputmode="numerico ? 'numeric' : 'text'" maxlength="255" data-test="dialogo-texto" />
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn-secundario" data-test="dialogo-cancelar" @click="emit('cancelar')">Cancelar</button>
        <button type="button" class="btn-primario" :disabled="!valido" data-test="dialogo-aceptar" @click="emit('aceptar', valor.trim())">Aceptar</button>
      </div>
    </div>
  </div>
</template>
```

```vue
<!-- src/views/InicioView.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MarcoGuarda from '@/components/MarcoGuarda.vue'
import { useEstadoStore } from '@/stores/estado'
import { normalizarPlaca } from '@/utils/placa'

const router = useRouter()
const estado = useEstadoStore()
const placa = ref('')
const error = ref('')

onMounted(async () => {
  try {
    await estado.cargarTodo()
  } catch (e) {
    error.value = e.message
  }
})

function buscar() {
  const p = normalizarPlaca(placa.value)
  if (p) router.push({ path: '/registrar', query: { placa: p } })
}
</script>

<template>
  <MarcoGuarda>
    <div class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <button type="button" class="btn-primario btn-grande" data-test="inicio-ingreso" @click="router.push('/registrar/INGRESO')">Registrar ingreso</button>
        <button type="button" class="btn-primario btn-grande" data-test="inicio-salida" @click="router.push('/registrar/SALIDA')">Registrar salida</button>
      </div>
      <form class="flex gap-2" @submit.prevent="buscar">
        <input v-model="placa" class="campo uppercase text-xl" placeholder="Buscar placa" autocapitalize="characters" data-test="inicio-placa" />
        <button type="submit" class="btn-secundario" data-test="inicio-buscar">Buscar</button>
      </form>
      <p v-if="error" class="aviso-error">{{ error }}</p>
      <div class="grid grid-cols-2 gap-3">
        <RouterLink to="/vehiculos" class="tarjeta text-center">
          <p class="text-4xl font-bold text-primary-800" data-test="inicio-dentro">{{ estado.dentro.length }}</p>
          <p class="text-gray-700">Dentro ahora</p>
        </RouterLink>
        <RouterLink to="/vehiculos?vista=fuera" class="tarjeta text-center">
          <p class="text-4xl font-bold text-primary-800" data-test="inicio-fuera">{{ estado.fuera.length }}</p>
          <p class="text-gray-700">Propios fuera</p>
        </RouterLink>
      </div>
    </div>
  </MarcoGuarda>
</template>
```

```vue
<!-- src/views/VehiculosView.vue -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarcoGuarda from '@/components/MarcoGuarda.vue'
import { useEstadoStore } from '@/stores/estado'
import { useAuthStore } from '@/stores/auth'
import { haceCuanto } from '@/utils/fechas'

const route = useRoute()
const router = useRouter()
const estado = useEstadoStore()
const auth = useAuthStore()
const vista = ref(route.query.vista === 'fuera' ? 'fuera' : 'dentro')
const error = ref('')

const filas = computed(() => (vista.value === 'dentro' ? estado.dentro : estado.fuera))
const TIPO = { PROPIO: 'Empresa', PROVEEDOR: 'Proveedor', PROVEEDOR_ASISTENCIA: 'Proveedor de asistencias' }

onMounted(async () => {
  auth.cargarSedes().catch(() => {})
  try {
    await estado.cargarTodo()
  } catch (e) {
    error.value = e.message
  }
})

function registrar(fila) {
  const sentido = vista.value === 'dentro' ? 'SALIDA' : 'INGRESO'
  router.push({ path: `/registrar/${sentido}`, query: { placa: fila.placa } })
}
</script>

<template>
  <MarcoGuarda titulo="Vehículos">
    <div class="grid grid-cols-2 gap-2 mb-4">
      <button type="button" class="btn border-2" :class="vista === 'dentro' ? 'bg-primary-700 text-white border-primary-700' : 'bg-white border-gray-300'" data-test="vehiculos-tab-dentro" @click="vista = 'dentro'">
        Dentro ({{ estado.dentro.length }})
      </button>
      <button type="button" class="btn border-2" :class="vista === 'fuera' ? 'bg-primary-700 text-white border-primary-700' : 'bg-white border-gray-300'" data-test="vehiculos-tab-fuera" @click="vista = 'fuera'">
        Propios fuera ({{ estado.fuera.length }})
      </button>
    </div>
    <p v-if="error" class="aviso-error mb-3">{{ error }}</p>
    <p v-if="!filas.length && !estado.cargando" class="text-gray-600">No hay vehículos.</p>
    <ul class="space-y-3">
      <li v-for="f in filas" :key="f.placa" class="tarjeta flex items-center justify-between gap-3" data-test="vehiculo-fila">
        <div>
          <p class="text-xl font-bold tracking-wider">{{ f.placa }}</p>
          <p class="text-gray-700">
            {{ TIPO[f.tipo_vehiculo] || '' }}{{ f.empresa ? ` · ${f.empresa}` : '' }} ·
            {{ f.carga_inicial ? 'Carga inicial' : (f.motivo ? f.motivo.nombre : '') }}
          </p>
          <p class="text-sm text-gray-600">
            {{ haceCuanto(f.registrado_at) }}<template v-if="vista === 'fuera' && f.sede_id"> · salió por {{ auth.nombreSede(f.sede_id) }}</template>
          </p>
        </div>
        <button type="button" class="btn-secundario shrink-0" data-test="vehiculo-accion" @click="registrar(f)">
          {{ vista === 'dentro' ? 'Salida' : 'Ingreso' }}
        </button>
      </li>
    </ul>
  </MarcoGuarda>
</template>
```

```vue
<!-- src/views/MovimientosView.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import MarcoGuarda from '@/components/MarcoGuarda.vue'
import DialogoTexto from '@/components/DialogoTexto.vue'
import { useEventosStore } from '@/stores/eventos'
import { useAuthStore } from '@/stores/auth'
import { horaCorta } from '@/utils/fechas'
import { puedeEditar } from '@/utils/permisos'

const eventos = useEventosStore()
const auth = useAuthStore()
const toast = useToast()
const error = ref('')
const dialogo = ref(null) // { tipo: 'anular' | 'km', evento }

onMounted(cargar)

async function cargar() {
  error.value = ''
  try {
    await eventos.cargarDelDia()
  } catch (e) {
    error.value = e.message
  }
}

async function aceptar(valor) {
  const { tipo, evento } = dialogo.value
  dialogo.value = null
  try {
    if (tipo === 'anular') {
      await eventos.anular(evento.id, valor)
      toast.success(`Registro de ${evento.placa} anulado`)
    } else {
      await eventos.corregir(evento.id, { kilometraje: Number(valor) })
      toast.success(`Kilometraje de ${evento.placa} corregido`)
    }
  } catch (e) {
    error.value = e.message
    // 409 MODIFICADO/ANULADO: los datos en pantalla ya no son los del servidor.
    if (e.status === 409) await cargar()
  }
}
</script>

<template>
  <MarcoGuarda titulo="Movimientos de hoy">
    <p v-if="error" class="aviso-error mb-3">{{ error }}</p>
    <p v-if="!eventos.delDia.length" class="text-gray-600">Sin movimientos hoy.</p>
    <ul class="space-y-3">
      <li v-for="e in eventos.delDia" :key="e.id" class="tarjeta space-y-2" :class="e.anulado ? 'opacity-60' : ''" data-test="movimiento-fila">
        <div class="flex items-center justify-between gap-2">
          <p class="text-lg font-bold">
            {{ horaCorta(e.registrado_at) }} · {{ e.sentido === 'INGRESO' ? 'Ingreso' : 'Salida' }} · <span class="tracking-wider">{{ e.placa }}</span>
          </p>
          <span v-if="e.anulado" class="rounded-lg bg-gray-200 px-2 py-1 text-sm" data-test="movimiento-anulado">Anulado</span>
          <span v-else-if="e.inconsistente" class="rounded-lg bg-amber-100 text-amber-900 px-2 py-1 text-sm" data-test="movimiento-inconsistente">Inconsistente</span>
        </div>
        <p class="text-gray-700">{{ e.motivo ? e.motivo.nombre : '' }} · {{ e.conductor_nombre }}<template v-if="e.kilometraje !== null && e.kilometraje !== undefined"> · {{ e.kilometraje }} km</template></p>
        <div v-if="puedeEditar(e, auth.usuario)" class="flex gap-2">
          <button v-if="e.tipo_vehiculo === 'PROPIO'" type="button" class="btn-secundario" data-test="movimiento-km" @click="dialogo = { tipo: 'km', evento: e }">Corregir km</button>
          <button type="button" class="btn-peligro" data-test="movimiento-anular" @click="dialogo = { tipo: 'anular', evento: e }">Anular</button>
        </div>
      </li>
    </ul>
    <DialogoTexto
      v-if="dialogo"
      :titulo="dialogo.tipo === 'anular' ? `Anular registro de ${dialogo.evento.placa}` : `Kilometraje de ${dialogo.evento.placa}`"
      :etiqueta="dialogo.tipo === 'anular' ? 'Motivo de la anulación' : 'Kilometraje'"
      :valor-inicial="dialogo.tipo === 'km' ? (dialogo.evento.kilometraje ?? '') : ''"
      :numerico="dialogo.tipo === 'km'"
      @aceptar="aceptar" @cancelar="dialogo = null"
    />
  </MarcoGuarda>
</template>
```

Nota de alcance: desde el front del guarda solo se corrige el kilometraje; para cambiar motivo, referencia o conductor se anula y se registra de nuevo (el backend permite más; el admin lo tendrá en la Fase 4).

- [ ] **Step 4: Run tests and build**

Run: `npm test` → PASS. Run: `npm run build` → sin errores ni advertencias de componentes sin resolver.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: inicio con contadores, vehículos dentro/fuera y movimientos del día"
```

---

### Task 7: Verificación de cierre

- [ ] **Step 1:** `npm test` → todo verde, salida limpia (sin advertencias de Vue). `npm run build` → sin errores.
- [ ] **Step 2: Prueba manual contra el backend local** (la hace el controlador o una persona): backend Mantix en `feature/porteria` con la base de pruebas (`npm run porteria:db:test` + variables de `src/porteria/testing/env.js` y un AD de prueba o el AD real en red interna) y `VITE_PROXY_TARGET=http://localhost:3020 npm run dev`. Recorrer: login → sede → registrar salida de un propio → ver en "Propios fuera" → registrar ingreso (diálogo si aplica) → movimientos → anular. Anotar lo encontrado.
- [ ] **Step 3:** `superpowers:requesting-code-review` y `superpowers:verification-before-completion`.
- [ ] **Step 4:** En `mantix-git/docs/superpowers/plans/2026-10-30-porteria-00-indice.md`, sección Fase 5, agregar: "Front: `cp .env.production.example .env.production`, `npm ci && npm run build` en `porteriasfn` y copiar `dist/` a `smb://192.9.17.11/www/porteria`; el servidor web debe servir `index.html` para rutas bajo `/porteria/` (fallback de SPA). Agregar el origen del front a `CORS_ORIGIN` de Mantix."
