# Portería — Fase 4b (front de administración y pendientes del guarda) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantallas del admin en `porteriasfn` (consulta de movimientos con Excel, detalle con corrección completa y anulación, motivos, catálogo de proveedores) y los pendientes heredados del guarda: confirmación propia, clave de idempotencia, autocompletar de proveedores y "cargar más".

**Architecture:** Las pantallas del admin viven bajo `/admin/*` (meta `requiereAdmin`) con su propio marco (`MarcoAdmin`). Cada pantalla tiene su store Pinia (`motivos`, `proveedores`, `consulta`) y la lógica que no depende de Vue va en módulos puros con pruebas (`src/admin/*.js`). Las confirmaciones pasan por un único diálogo global que responde una promesa. El asistente genera una clave por registro y la manda como `clave_cliente`.

**Tech Stack:** Vue 3.5, Vite 7, Tailwind 3.4, Pinia 3 (options API), Vue Router 4, axios, vue-toastification, Vitest + jsdom + @vue/test-utils.

**Diseño de referencia:** `mantix-git/docs/superpowers/specs/2026-10-29-porteria-design.md` §9 y §13. Backend: plan `2026-10-31-porteria-fase4a-admin-backend.md` (rutas `/admin/*`, `clave_cliente`, `?sede_id=todas`, `?incluir_inactivos=1`).

## Global Constraints

- Repo `porteriasfn` (`/Users/Shared/Files From c.localized/apps/mantix/porteria/porteriasfn`), rama `feature/admin` creada desde `feature/guarda`. Nunca push. No tocar el despliegue (`smb://192.9.17.11 www/porteria`).
- Estilo del proyecto (patrón `peludos`): sin punto y coma, comillas simples, identificadores y textos en español, `data-test` en todo lo que prueban los tests, botones con `min-h-tactil` (clases `btn*`), clases existentes `campo`, `tarjeta`, `etiqueta`, `aviso-error`.
- Nunca `window.confirm`: siempre `confirmar(mensaje, opciones)` de `@/composables/confirmar`.
- La API se usa solo a través de `porteria` de `@/services/api` (respuesta = cuerpo `{ success, data }`; error = `{ status, codigo, motivo, message, errors }`).
- Las pantallas del admin solo para `admin_porteria`; el servidor vuelve a validar todo.
- Errores al usuario: el `message` del servidor; sin red, "Sin conexión con el servidor".
- Pruebas con `npm test` (Vitest). Cada tarea deja `npm test` y `npm run build` en verde.
- Commits con trailer `Co-Authored-By:` del modelo que los escribe.

## Antes de empezar

```bash
git -C porteriasfn checkout feature/guarda && git -C porteriasfn checkout -b feature/admin
```
Línea base: `npm test` (131 pruebas en verde) y `npm run build`.

## Mapa de archivos

| Archivo | Cambio |
|---|---|
| `src/composables/confirmar.js`, `src/components/ConfirmacionGlobal.vue`, `src/App.vue` | Confirmación propia |
| `src/components/MarcoGuarda.vue`, `src/views/SedeView.vue`, `src/views/RegistroView.vue` | Usan `confirmar` |
| `src/utils/clave.js`, `src/registro/modelo.js` | Clave de idempotencia |
| `src/views/RegistroView.vue` | Clave, autocompletar de proveedores |
| `src/stores/eventos.js`, `src/views/MovimientosView.vue` | "Cargar más" |
| `src/services/api.js` | Lee el error JSON de las descargas (`Blob`) |
| `src/composables/carga.js` | Carga/error/reintento |
| `src/components/MarcoAdmin.vue` | Marco de las pantallas del admin |
| `src/admin/motivos.js`, `src/stores/motivos.js`, `src/components/FormularioMotivo.vue`, `src/views/admin/AdminMotivosView.vue` | Motivos |
| `src/stores/proveedores.js`, `src/components/FormularioProveedor.vue`, `src/views/admin/AdminProveedoresView.vue` | Proveedores |
| `src/utils/fechas.js`, `src/services/archivos.js`, `src/stores/consulta.js`, `src/views/admin/AdminMovimientosView.vue` | Consulta y Excel |
| `src/admin/correccion.js`, `src/components/DetalleEvento.vue` | Detalle, corrección y anulación |
| `src/router/index.js`, `src/stores/auth.js` | Rutas `/admin`, guardia y inicio del admin |

---

### Task 1: Confirmación con diálogo propio

**Files:**
- Create: `src/composables/confirmar.js`, `src/components/ConfirmacionGlobal.vue`
- Modify: `src/App.vue`, `src/components/MarcoGuarda.vue`, `src/views/SedeView.vue`, `src/views/RegistroView.vue`
- Test: `src/components/__tests__/confirmacionGlobal.spec.js` (nuevo), `src/components/__tests__/marcoGuarda.spec.js`, `src/views/__tests__/sede.spec.js`, `src/views/__tests__/registro.spec.js`

**Interfaces:**
- Produces: `confirmar(mensaje, { aceptar = 'Aceptar', peligro = false } = {}) → Promise<boolean>`; `responder(valor)`; `confirmacion` (reactivo: `abierta`, `mensaje`, `aceptar`, `peligro`). `ConfirmacionGlobal` se monta una vez en `App.vue`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/components/__tests__/confirmacionGlobal.spec.js`:

```js
import { test, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ConfirmacionGlobal from '@/components/ConfirmacionGlobal.vue'
import { confirmar, responder } from '@/composables/confirmar'

afterEach(() => responder(false))

test('muestra el mensaje y resuelve true al aceptar', async () => {
  const w = mount(ConfirmacionGlobal)
  expect(w.find('[role=alertdialog]').exists()).toBe(false)
  const respuesta = confirmar('¿Cerrar sesión?', { aceptar: 'Cerrar sesión' })
  await flushPromises()
  expect(w.get('[data-test=confirmacion-mensaje]').text()).toBe('¿Cerrar sesión?')
  expect(w.get('[data-test=confirmacion-aceptar]').text()).toBe('Cerrar sesión')
  await w.get('[data-test=confirmacion-aceptar]').trigger('click')
  expect(await respuesta).toBe(true)
  expect(w.find('[role=alertdialog]').exists()).toBe(false)
})

test('cancelar resuelve false; el estilo de peligro se aplica', async () => {
  const w = mount(ConfirmacionGlobal)
  const respuesta = confirmar('¿Borrar?', { aceptar: 'Borrar', peligro: true })
  await flushPromises()
  expect(w.get('[data-test=confirmacion-aceptar]').classes()).toContain('btn-peligro')
  await w.get('[data-test=confirmacion-cancelar]').trigger('click')
  expect(await respuesta).toBe(false)
})

test('una confirmación nueva cancela la anterior', async () => {
  const primera = confirmar('Uno')
  const segunda = confirmar('Dos')
  expect(await primera).toBe(false)
  responder(true)
  expect(await segunda).toBe(true)
})
```

En `marcoGuarda.spec.js`, `sede.spec.js` y `registro.spec.js`, debajo de los `import` de `vitest`:

```js
const confirmar = vi.hoisted(() => vi.fn())
vi.mock('@/composables/confirmar', () => ({ confirmar }))
```

y en el `beforeEach` de cada uno agregar `confirmar.mockReset()` (en `marcoGuarda.spec.js`, si no hay `beforeEach` con `vi.clearAllMocks`, agregar uno que lo haga). Luego, en cada prueba que usaba `window.confirm`:
- `const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(X)` → `confirmar.mockResolvedValue(X)`.
- `vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)` → `confirmar.mockResolvedValueOnce(false).mockResolvedValueOnce(true)`.
- `const confirmar = vi.spyOn(window, 'confirm')` (sin valor) → se borra la línea (el mock ya existe y no debe llamarse).
- Se borran las líneas `confirmar.mockRestore()`.
- `toHaveBeenCalledWith('¿Cerrar sesión?')` → `toHaveBeenCalledWith('¿Cerrar sesión?', { aceptar: 'Cerrar sesión' })`.
- `toHaveBeenCalledWith('¿Salir sin registrar?')` → `toHaveBeenCalledWith('¿Salir sin registrar?', { aceptar: 'Salir', peligro: true })`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL (no existe `@/composables/confirmar`; las vistas siguen llamando a `window.confirm`).

- [ ] **Step 3: Implementar**

`src/composables/confirmar.js`:

```js
// Confirmaciones con un diálogo propio: Chrome puede suprimir window.confirm en una app instalada.
// Hay una sola a la vez; pedir otra cancela la anterior (responde false).
import { reactive } from 'vue'

export const confirmacion = reactive({ abierta: false, mensaje: '', aceptar: 'Aceptar', peligro: false })
let resolver = null

export function confirmar(mensaje, { aceptar = 'Aceptar', peligro = false } = {}) {
  if (resolver) resolver(false)
  Object.assign(confirmacion, { abierta: true, mensaje, aceptar, peligro })
  return new Promise((r) => { resolver = r })
}

export function responder(valor) {
  const r = resolver
  resolver = null
  confirmacion.abierta = false
  if (r) r(valor)
}
```

`src/components/ConfirmacionGlobal.vue`:

```vue
<script setup>
import { confirmacion, responder } from '@/composables/confirmar'
</script>

<template>
  <div
    v-if="confirmacion.abierta" class="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-4"
    role="alertdialog" aria-modal="true" aria-labelledby="confirmacion-mensaje" @keydown.esc="responder(false)"
  >
    <div class="tarjeta w-full max-w-md space-y-4">
      <p id="confirmacion-mensaje" class="text-lg font-bold" data-test="confirmacion-mensaje">{{ confirmacion.mensaje }}</p>
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn-secundario" data-test="confirmacion-cancelar" @click="responder(false)">Cancelar</button>
        <button
          type="button" :class="confirmacion.peligro ? 'btn-peligro' : 'btn-primario'"
          data-test="confirmacion-aceptar" @click="responder(true)"
        >{{ confirmacion.aceptar }}</button>
      </div>
    </div>
  </div>
</template>
```

`src/App.vue`:

```vue
<script setup>
import ConfirmacionGlobal from '@/components/ConfirmacionGlobal.vue'
</script>

<template>
  <RouterView />
  <ConfirmacionGlobal />
</template>
```

En `MarcoGuarda.vue` y `SedeView.vue`: `import { confirmar } from '@/composables/confirmar'` y

```js
async function salir() {
  if (!(await confirmar('¿Cerrar sesión?', { aceptar: 'Cerrar sesión' }))) return
  auth.logout()
  router.replace('/login')
}
```

En `RegistroView.vue`: `import { confirmar } from '@/composables/confirmar'` y la última línea de `onBeforeRouteLeave` pasa a

```js
  return !normalizarPlaca(estado.placa) || confirmar('¿Salir sin registrar?', { aceptar: 'Salir', peligro: true })
```

(Vue Router acepta que el guard devuelva una promesa de booleano.)

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test` y `npm run build`
Expected: PASS; `grep -rn "window.confirm" src` no devuelve nada.

- [ ] **Step 5: Commit**

```bash
git add src/composables/confirmar.js src/components/ConfirmacionGlobal.vue src/App.vue src/components/MarcoGuarda.vue src/views/SedeView.vue src/views/RegistroView.vue src/components/__tests__/confirmacionGlobal.spec.js src/components/__tests__/marcoGuarda.spec.js src/views/__tests__/sede.spec.js src/views/__tests__/registro.spec.js
git commit -m "feat: confirmaciones con diálogo propio en lugar de window.confirm"
```

---

### Task 2: Clave de idempotencia en el asistente

**Files:**
- Create: `src/utils/clave.js`
- Modify: `src/registro/modelo.js` (`estadoInicial`, `construirCuerpo`), `src/views/RegistroView.vue` (`enviar`)
- Test: `src/utils/__tests__/clave.spec.js` (nuevo), `src/registro/__tests__/modelo.spec.js`, `src/views/__tests__/registro.spec.js`

**Interfaces:**
- Produces: `nuevaClave() → string` (cumple `^[A-Za-z0-9-]{8,64}$`). `estado.clave` (`null` hasta el primer envío; se renueva al consultar otra placa). `construirCuerpo` agrega `clave_cliente` si hay clave.

- [ ] **Step 1: Escribir las pruebas que fallan**

`src/utils/__tests__/clave.spec.js`:

```js
import { test, expect, vi, afterEach } from 'vitest'
import { nuevaClave } from '@/utils/clave'

afterEach(() => vi.unstubAllGlobals())

const FORMATO = /^[A-Za-z0-9-]{8,64}$/

test('usa randomUUID si existe', () => {
  vi.stubGlobal('crypto', { randomUUID: () => '3f2c9a1e-7b4d-4c2a-9e1f-0a1b2c3d4e5f', getRandomValues: vi.fn() })
  expect(nuevaClave()).toBe('3f2c9a1e-7b4d-4c2a-9e1f-0a1b2c3d4e5f')
})

test('sin randomUUID (página sin HTTPS) arma una con getRandomValues', () => {
  vi.stubGlobal('crypto', { getRandomValues: (b) => b.fill(171) })
  const clave = nuevaClave()
  expect(clave).toBe('abababab-abab-abab-abab-abababababab')
  expect(clave).toMatch(FORMATO)
})

test('dos claves seguidas son distintas', () => {
  expect(nuevaClave()).not.toBe(nuevaClave())
  expect(nuevaClave()).toMatch(FORMATO)
})
```

En `src/registro/__tests__/modelo.spec.js` agregar (usa las funciones ya importadas en el archivo; si `construirCuerpo` o `estadoInicial` no están importadas, agregarlas al import):

```js
test('la clave viaja como clave_cliente solo si existe', () => {
  const estado = { ...estadoInicial('SALIDA'), placa: 'abc123', tipo: 'PROPIO', motivoId: 6, conductor: { modo: 'ad', usuario: 'j', nombre: 'J', documento: '' } }
  expect(estadoInicial().clave).toBeNull()
  expect(construirCuerpo(estado, null)).not.toHaveProperty('clave_cliente')
  expect(construirCuerpo({ ...estado, clave: 'k-12345678' }, null).clave_cliente).toBe('k-12345678')
})
```

En `src/views/__tests__/registro.spec.js`:
- Cada `expect(porteria.post).toHaveBeenCalledWith('/eventos', { … })` con objeto exacto agrega `clave_cliente: expect.any(String)` al objeto.
- Agregar:

```js
test('el reenvío forzado usa la misma clave; otra placa estrena clave', async () => {
  porteria.post
    .mockRejectedValueOnce({ status: 409, motivo: 'SENTIDO_INCOHERENTE', message: 'Figura fuera', errors: { estado: { dentro: false, sede_id: 1 } } })
    .mockResolvedValueOnce({ data: { id: 2, sentido: 'SALIDA', placa: 'ABC123' } })
  const { w } = await montar()
  await llenarHastaConfirmar(w)
  await avanzar(w)
  await w.get('[data-test=inconsistencia-observacion]').setValue('Sin registro previo')
  await w.get('[data-test=inconsistencia-registrar]').trigger('click')
  await flushPromises()
  const [[, primero], [, segundo]] = porteria.post.mock.calls
  expect(primero.clave_cliente).toMatch(/^[A-Za-z0-9-]{8,64}$/)
  expect(segundo.clave_cliente).toBe(primero.clave_cliente)
})

test('consultar otra placa descarta la clave anterior', async () => {
  porteria.post.mockRejectedValueOnce({ status: 0, motivo: 'SIN_CONEXION', message: 'Sin conexión' })
  const { w } = await montar()
  await llenarHastaConfirmar(w)
  await avanzar(w)
  const clave = porteria.post.mock.calls[0][1].clave_cliente
  // Cuatro pasos atrás (confirmar → detalles → motivo → conductor → placa); un quinto saldría de la ruta.
  for (let i = 0; i < 4; i += 1) await w.get('[data-test=registro-atras]').trigger('click')
  await w.get('[data-test=registro-placa]').setValue('abc-123')
  await w.get('[data-test=registro-consultar]').trigger('click')
  await flushPromises()
  porteria.post.mockResolvedValueOnce({ data: { id: 3, sentido: 'SALIDA', placa: 'ABC123' } })
  await avanzar(w)
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  await w.get('[data-test=buscable-item]').trigger('click')
  await avanzar(w)
  await w.get('[data-test=registro-motivo-6]').trigger('click')
  await avanzar(w)
  await avanzar(w)
  await avanzar(w)
  expect(porteria.post.mock.calls[1][1].clave_cliente).not.toBe(clave)
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL (`@/utils/clave` no existe; el cuerpo no trae `clave_cliente`).

- [ ] **Step 3: Implementar**

`src/utils/clave.js`:

```js
// Clave única por registro: un reintento con la misma clave no duplica el evento en el servidor.
// randomUUID solo existe en páginas seguras (HTTPS o localhost); si no, se arma con getRandomValues.
const hex = (b) => b.toString(16).padStart(2, '0')

export function nuevaClave() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const t = Array.from(crypto.getRandomValues(new Uint8Array(16)), hex).join('')
  return `${t.slice(0, 8)}-${t.slice(8, 12)}-${t.slice(12, 16)}-${t.slice(16, 20)}-${t.slice(20)}`
}
```

En `src/registro/modelo.js`: `estadoInicial` agrega `clave: null,` (después de `observaciones`) con el comentario `// Se fija al primer envío y se conserva en los reintentos de ese mismo registro.`; `construirCuerpo` agrega antes de `if (forzar)`:

```js
  if (estado.clave) cuerpo.clave_cliente = estado.clave
```

En `src/views/RegistroView.vue`: `import { nuevaClave } from '@/utils/clave'` y en `enviar`, antes del `try`:

```js
  if (!estado.clave) estado.clave = nuevaClave()
```

(`consultarPlaca` ya reemplaza el estado con `estadoInicial`, así que otra placa estrena clave.)

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/clave.js src/utils/__tests__/clave.spec.js src/registro/modelo.js src/registro/__tests__/modelo.spec.js src/views/RegistroView.vue src/views/__tests__/registro.spec.js
git commit -m "feat: clave de idempotencia por registro (clave_cliente)"
```

---

### Task 3: Autocompletar del catálogo de proveedores en el paso de placa

**Files:**
- Modify: `src/views/RegistroView.vue`
- Test: `src/views/__tests__/registro.spec.js`

**Interfaces:**
- Consumes: `catalogos.vehiculosExternos(q) → [{ id, placa, tipo, empresa }]` (ya existe).
- Produces: bajo el campo de placa, hasta 5 sugerencias (`data-test=registro-proveedor`) con 2+ caracteres y 300 ms sin escribir; elegir una llena la placa y la consulta.

- [ ] **Step 1: Escribir la prueba que falla**

En `src/views/__tests__/registro.spec.js`:

```js
test('sugiere vehículos del catálogo de proveedores al escribir la placa', async () => {
  const externos = [{ id: 4, placa: 'XYZ123', tipo: 'PROVEEDOR', empresa: 'Flores del Norte' }]
  porteria.get.mockImplementation(async (url, opciones) => {
    if (url === '/vehiculos-externos') return { data: opciones.params.q === 'XY' ? externos : [] }
    if (url.startsWith('/estado/placa/')) return { data: { ...SUGERENCIA, placa: 'XYZ123', vehiculo: null, vehiculo_externo: externos[0], tipo_vehiculo: 'PROVEEDOR' } }
    return { data: [] }
  })
  const { w } = await montar()
  await w.get('[data-test=registro-placa]').setValue('x')
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  expect(porteria.get).not.toHaveBeenCalledWith('/vehiculos-externos', expect.anything())
  await w.get('[data-test=registro-placa]').setValue('xy')
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  expect(porteria.get).toHaveBeenCalledWith('/vehiculos-externos', { params: { q: 'XY' } })
  const sugerida = w.get('[data-test=registro-proveedor]')
  expect(sugerida.text()).toBe('XYZ123 · Flores del Norte')
  await sugerida.trigger('click')
  await flushPromises()
  expect(porteria.get).toHaveBeenCalledWith('/estado/placa/XYZ123')
  expect(w.find('[data-test=registro-proveedor]').exists()).toBe(false)
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  expect(w.find('[data-test=registro-proveedor]').exists()).toBe(false)
})

test('si el catálogo falla, no estorba', async () => {
  porteria.get.mockImplementation(async (url) => {
    if (url === '/vehiculos-externos') throw { status: 0, motivo: 'SIN_CONEXION', message: 'Sin conexión' }
    return { data: [] }
  })
  const { w } = await montar()
  await w.get('[data-test=registro-placa]').setValue('abc')
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  expect(w.find('[data-test=registro-proveedor]').exists()).toBe(false)
  expect(w.find('[data-test=registro-error]').exists()).toBe(false)
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/views/__tests__/registro.spec.js`
Expected: FAIL (no hay `registro-proveedor`).

- [ ] **Step 3: Implementar**

En `src/views/RegistroView.vue`:
- Import: agregar `onBeforeUnmount` al import de `vue`.
- En el script, después de `let peticionPlaca = 0`:

```js
// Autocompletar: con 2+ caracteres y 300 ms sin escribir se ofrecen placas del catálogo de proveedores.
const proveedoresSugeridos = ref([])
let peticionProveedores = 0
let temporizadorProveedores = null

function descartarProveedores() {
  clearTimeout(temporizadorProveedores)
  peticionProveedores += 1
  proveedoresSugeridos.value = []
}

watch(() => estado.placa, (valor) => {
  descartarProveedores()
  const placa = normalizarPlaca(valor)
  if (placa.length < 2 || (estado.sugerencia && estado.sugerencia.placa === placa)) return
  const numero = peticionProveedores
  temporizadorProveedores = setTimeout(async () => {
    try {
      const lista = await catalogos.vehiculosExternos(placa)
      if (numero === peticionProveedores) proveedoresSugeridos.value = lista.slice(0, 5)
    } catch {
      // Es una ayuda: si falla, el guarda escribe la placa completa.
    }
  }, 300)
}, { flush: 'sync' })

onBeforeUnmount(() => clearTimeout(temporizadorProveedores))

function usarProveedor(v) {
  estado.placa = v.placa
  consultarPlaca()
}
```

- En `consultarPlaca`, como primera línea: `descartarProveedores()`; y después de `aplicarSugerencia(estado, sugerencia)`: `descartarProveedores()`.
- En el template, dentro de `<section v-if="paso === 'placa'" …>`, después del `div` del campo y el botón Consultar:

```html
        <ul v-if="proveedoresSugeridos.length" class="tarjeta divide-y p-0" data-test="registro-proveedores">
          <li v-for="v in proveedoresSugeridos" :key="v.id">
            <button type="button" class="w-full text-left px-4 min-h-tactil text-lg" data-test="registro-proveedor" @click="usarProveedor(v)">
              <span class="font-bold tracking-wider">{{ v.placa }}</span> · {{ v.empresa }}
            </button>
          </li>
        </ul>
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/RegistroView.vue src/views/__tests__/registro.spec.js
git commit -m "feat: autocompletar placas del catálogo de proveedores en el asistente"
```

---

### Task 4: "Cargar más" en los movimientos del guarda

**Files:**
- Modify: `src/stores/eventos.js`, `src/views/MovimientosView.vue`
- Test: `src/stores/__tests__/eventos.spec.js`, `src/views/__tests__/movimientos.spec.js`

**Interfaces:**
- Produces: `eventos.pagina`, `eventos.dia`, `eventos.cargarMas()` (pide la página siguiente del mismo día y agrega sin repetir ids).

- [ ] **Step 1: Escribir las pruebas que fallan**

En `src/stores/__tests__/eventos.spec.js`:

```js
test('cargar más pide la página siguiente del mismo día y no repite filas', async () => {
  porteria.get
    .mockResolvedValueOnce({ data: { items: [{ id: 9 }, { id: 8 }], total: 4, pagina: 1, por_pagina: 2 } })
    .mockResolvedValueOnce({ data: { items: [{ id: 8 }, { id: 7 }], total: 4, pagina: 2, por_pagina: 2 } })
  const ev = useEventosStore()
  await ev.cargarDelDia('2026-10-05')
  await ev.cargarMas()
  expect(porteria.get).toHaveBeenLastCalledWith('/eventos', { params: { desde: '2026-10-05', hasta: '2026-10-05', pagina: 2 } })
  expect(ev.delDia.map((e) => e.id)).toEqual([9, 8, 7])
  expect(ev.pagina).toBe(2)
})
```

En `src/views/__tests__/movimientos.spec.js` (usa el helper `fila(id)` del archivo):

```js
test('"Cargar más" trae la siguiente página', async () => {
  porteria.get
    .mockResolvedValueOnce({ data: { items: [fila(1), fila(2)], total: 3, pagina: 1 } })
    .mockResolvedValueOnce({ data: { items: [fila(3)], total: 3, pagina: 2 } })
  const w = montar()
  await flushPromises()
  await w.get('[data-test=movimientos-mas]').trigger('click')
  await flushPromises()
  expect(w.findAll('[data-test=movimiento-fila]')).toHaveLength(3)
  expect(w.find('[data-test=movimientos-mas]').exists()).toBe(false)
})

test('si "Cargar más" falla, avisa y deja reintentar', async () => {
  porteria.get
    .mockResolvedValueOnce({ data: { items: [fila(1)], total: 2, pagina: 1 } })
    .mockRejectedValueOnce({ status: 0, motivo: 'SIN_CONEXION', message: 'Sin conexión con el servidor' })
  const w = montar()
  await flushPromises()
  await w.get('[data-test=movimientos-mas]').trigger('click')
  await flushPromises()
  expect(w.get('[data-test=movimientos-error]').text()).toBe('Sin conexión con el servidor')
  expect(w.find('[data-test=movimientos-mas]').exists()).toBe(true)
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/stores/__tests__/eventos.spec.js src/views/__tests__/movimientos.spec.js`
Expected: FAIL (`cargarMas` no existe; no hay botón).

- [ ] **Step 3: Implementar**

`src/stores/eventos.js`:

```js
export const useEventosStore = defineStore('eventos', {
  state: () => ({ delDia: [], total: 0, pagina: 1, dia: null }),
  actions: {
    async registrar(cuerpo) {
      return (await porteria.post('/eventos', cuerpo)).data
    },
    async cargarDelDia(hoy = hoyLocal()) {
      const { data } = await porteria.get('/eventos', { params: { desde: hoy, hasta: hoy } })
      this.dia = hoy
      this.delDia = data.items
      this.total = data.total
      this.pagina = data.pagina ?? 1
    },
    // Si entraron registros nuevos mientras tanto, la página siguiente puede repetir filas: se omiten.
    async cargarMas() {
      const { data } = await porteria.get('/eventos', { params: { desde: this.dia, hasta: this.dia, pagina: this.pagina + 1 } })
      const vistos = new Set(this.delDia.map((e) => e.id))
      this.delDia.push(...data.items.filter((e) => !vistos.has(e.id)))
      this.total = data.total
      this.pagina = data.pagina
    },
    // corregir, anular y reemplazar: sin cambios
  }
})
```

(Conservar `corregir`, `anular` y `reemplazar` tal como están.)

En `src/views/MovimientosView.vue`:
- Script, después de `const dialogo = …`:

```js
const cargandoMas = ref(false)

async function cargarMas() {
  error.value = ''
  cargandoMas.value = true
  try {
    await eventos.cargarMas()
  } catch (e) {
    error.value = e.message
  } finally {
    cargandoMas.value = false
  }
}
```

- Template, después del `</ul>`:

```html
    <button
      v-if="eventos.total > eventos.delDia.length" type="button" class="btn-secundario w-full mt-3"
      :disabled="cargandoMas" data-test="movimientos-mas" @click="cargarMas"
    >{{ cargandoMas ? 'Cargando…' : 'Cargar más' }}</button>
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test`
Expected: PASS (la prueba existente de "Mostrando 2 de 7" sigue en verde).

- [ ] **Step 5: Commit**

```bash
git add src/stores/eventos.js src/views/MovimientosView.vue src/stores/__tests__/eventos.spec.js src/views/__tests__/movimientos.spec.js
git commit -m "feat: cargar más movimientos del día"
```

---

### Task 5: Base del admin — errores de descargas, composable de carga y marco

**Files:**
- Modify: `src/services/api.js`
- Create: `src/composables/carga.js`, `src/components/MarcoAdmin.vue`
- Test: `src/services/__tests__/api.spec.js`, `src/composables/__tests__/carga.spec.js` (nuevo), `src/components/__tests__/marcoAdmin.spec.js` (nuevo)

**Interfaces:**
- Produces:
  - Una descarga (`responseType: 'blob'`) que falla devuelve el error normal del contrato (`motivo`, `message`) leído del cuerpo JSON.
  - `useCarga(fn) → { cargando: Ref<boolean>, error: Ref<string>, ejecutar(...args) → Promise<resultado | undefined> }`: descarta resultados de llamadas viejas; en error deja `error` con el mensaje y devuelve `undefined`.
  - `MarcoAdmin` (prop `titulo`): navegación a `/admin/movimientos`, `/admin/motivos`, `/admin/proveedores`, enlace "Caseta" (`/inicio`) y "Salir" con confirmación; aviso de Portería deshabilitada.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `src/services/__tests__/api.spec.js`:

```js
test('una descarga que falla trae el error del contrato aunque llegue como Blob', async () => {
  const cuerpo = { success: false, error: 'POR-ADM-005', motivo: 'DEMASIADOS_REGISTROS', message: 'El reporte supera 50000 movimientos.' }
  responder(413, new Blob([JSON.stringify(cuerpo)], { type: 'application/json' }))
  await expect(porteria.get('/admin/reportes/movimientos.xlsx', { responseType: 'blob' })).rejects.toEqual({
    status: 413, codigo: 'POR-ADM-005', motivo: 'DEMASIADOS_REGISTROS', message: 'El reporte supera 50000 movimientos.', errors: [],
  })
})

test('un Blob de error que no es JSON se trata como servidor sin contrato', async () => {
  responder(502, new Blob(['<html>Bad Gateway</html>'], { type: 'text/html' }))
  await expect(porteria.get('/admin/reportes/movimientos.xlsx', { responseType: 'blob' })).rejects.toMatchObject({
    status: 502, motivo: 'SIN_CONEXION',
  })
})
```

`src/composables/__tests__/carga.spec.js`:

```js
import { test, expect } from 'vitest'
import { useCarga } from '@/composables/carga'

const diferido = () => {
  let resolver
  let rechazar
  const promesa = new Promise((ok, mal) => { resolver = ok; rechazar = mal })
  return { promesa, resolver, rechazar }
}

test('marca la carga y devuelve el resultado', async () => {
  const d = diferido()
  const { cargando, error, ejecutar } = useCarga(() => d.promesa)
  const p = ejecutar()
  expect(cargando.value).toBe(true)
  d.resolver(5)
  expect(await p).toBe(5)
  expect(cargando.value).toBe(false)
  expect(error.value).toBe('')
})

test('en error deja el mensaje y devuelve undefined', async () => {
  const { error, ejecutar } = useCarga(async () => { throw { message: 'Sin conexión con el servidor' } })
  expect(await ejecutar()).toBeUndefined()
  expect(error.value).toBe('Sin conexión con el servidor')
})

test('descarta la respuesta de una llamada vieja', async () => {
  const vieja = diferido()
  const nueva = diferido()
  const llamadas = [vieja, nueva]
  const { cargando, error, ejecutar } = useCarga(() => llamadas.shift().promesa)
  const p1 = ejecutar()
  const p2 = ejecutar()
  nueva.resolver('nueva')
  expect(await p2).toBe('nueva')
  vieja.rechazar({ message: 'tarde' })
  expect(await p1).toBeUndefined()
  expect(error.value).toBe('')
  expect(cargando.value).toBe(false)
})
```

`src/components/__tests__/marcoAdmin.spec.js`:

```js
import { test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn() }, tokenStorage: { leer: () => 't', guardar: () => {} } }))
const confirmar = vi.hoisted(() => vi.fn())
vi.mock('@/composables/confirmar', () => ({ confirmar }))

import { useAuthStore } from '@/stores/auth'
import MarcoAdmin from '@/components/MarcoAdmin.vue'

async function montar() {
  const vacia = { template: '<div />' }
  const rutas = ['/admin/movimientos', '/admin/motivos', '/admin/proveedores', '/inicio', '/login'].map((path) => ({ path, component: vacia }))
  const router = createRouter({ history: createMemoryHistory(), routes: rutas })
  router.push('/admin/movimientos')
  await router.isReady()
  const w = mount(MarcoAdmin, { props: { titulo: 'Consulta' }, global: { plugins: [router] }, slots: { default: '<p>contenido</p>' } })
  return { w, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  confirmar.mockReset()
  useAuthStore().fijarSesion('t', { usuario: 'a1', nombre: 'Ana Admin', rol: 'admin_porteria', sede: null })
})

test('muestra título, usuario, navegación y contenido', async () => {
  const { w } = await montar()
  expect(w.get('h1').text()).toBe('Consulta')
  expect(w.text()).toContain('Ana Admin')
  expect(w.findAll('[data-test=admin-nav] a').map((a) => a.attributes('href'))).toEqual([
    '/admin/movimientos', '/admin/motivos', '/admin/proveedores', '/inicio',
  ])
  expect(w.text()).toContain('contenido')
})

test('salir confirma y vuelve al login', async () => {
  confirmar.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const { w, router } = await montar()
  await w.get('[data-test=admin-salir]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/admin/movimientos')
  await w.get('[data-test=admin-salir]').trigger('click')
  await flushPromises()
  expect(confirmar).toHaveBeenCalledWith('¿Cerrar sesión?', { aceptar: 'Cerrar sesión' })
  expect(router.currentRoute.value.path).toBe('/login')
  expect(useAuthStore().token).toBeNull()
})

test('avisa si Portería está deshabilitada', async () => {
  const { w } = await montar()
  useAuthStore().fijarServicio(false)
  await w.vm.$nextTick()
  expect(w.get('[data-test=admin-servicio]').text()).toBe('Portería no está disponible en este momento. Avisa a TI.')
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL (el Blob no se lee; faltan `carga.js` y `MarcoAdmin.vue`).

- [ ] **Step 3: Implementar**

En `src/services/api.js`, antes de `function crearCliente`:

```js
// Las descargas piden `responseType: 'blob'`: un error llega como Blob y hay que leer su JSON.
async function leerErrorBlob(e) {
  const r = e && e.response
  if (!r || typeof Blob === 'undefined' || !(r.data instanceof Blob)) return
  try {
    const texto = typeof r.data.text === 'function'
      ? await r.data.text()
      : await new Promise((ok, mal) => {
        const lector = new FileReader()
        lector.onload = () => ok(lector.result)
        lector.onerror = mal
        lector.readAsText(r.data)
      })
    r.data = JSON.parse(texto)
  } catch {
    r.data = null
  }
}
```

y el manejador de error del interceptor de respuesta pasa a ser `async (e) => { await leerErrorBlob(e); const err = normalizarError(e); … }` (el resto igual).

`src/composables/carga.js`:

```js
// Estado de una carga con error y reintento. Si se vuelve a cargar antes de que termine la anterior,
// la respuesta vieja se descarta (ni datos ni error).
import { ref } from 'vue'

export function useCarga(fn) {
  const cargando = ref(false)
  const error = ref('')
  let ultima = 0

  async function ejecutar(...args) {
    const numero = ++ultima
    cargando.value = true
    error.value = ''
    try {
      const resultado = await fn(...args)
      return numero === ultima ? resultado : undefined
    } catch (e) {
      if (numero === ultima) error.value = (e && e.message) || 'Ocurrió un error'
      return undefined
    } finally {
      if (numero === ultima) cargando.value = false
    }
  }

  return { cargando, error, ejecutar }
}
```

`src/components/MarcoAdmin.vue`:

```vue
<script setup>
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { confirmar } from '@/composables/confirmar'

defineProps({ titulo: { type: String, default: '' } })

const auth = useAuthStore()
const router = useRouter()
const ENLACES = [
  { a: '/admin/movimientos', texto: 'Movimientos' },
  { a: '/admin/motivos', texto: 'Motivos' },
  { a: '/admin/proveedores', texto: 'Proveedores' },
  { a: '/inicio', texto: 'Caseta' }
]

async function salir() {
  if (!(await confirmar('¿Cerrar sesión?', { aceptar: 'Cerrar sesión' }))) return
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="bg-primary-800 text-white px-4 py-3">
      <div class="flex items-center justify-between gap-2 max-w-6xl mx-auto">
        <div>
          <p class="text-lg font-bold">Administración · Portería</p>
          <p class="text-sm opacity-90">{{ auth.usuario ? auth.usuario.nombre : '' }}</p>
        </div>
        <button type="button" class="btn border-2 border-white/60 text-white text-base" data-test="admin-salir" @click="salir">Salir</button>
      </div>
      <nav class="mt-3 flex gap-2 overflow-x-auto max-w-6xl mx-auto" data-test="admin-nav">
        <RouterLink v-for="e in ENLACES" :key="e.a" :to="e.a" class="btn bg-primary-900 text-white text-base" active-class="ring-2 ring-white">{{ e.texto }}</RouterLink>
      </nav>
    </header>
    <p v-if="auth.servicioNoDisponible" class="bg-red-700 text-white px-4 py-2 text-center font-semibold" role="alert" data-test="admin-servicio">
      Portería no está disponible en este momento. Avisa a TI.
    </p>
    <main class="flex-1 p-4 max-w-6xl w-full mx-auto">
      <h1 v-if="titulo" class="text-2xl font-bold mb-4">{{ titulo }}</h1>
      <slot />
    </main>
  </div>
</template>
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test` y `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/api.js src/services/__tests__/api.spec.js src/composables/carga.js src/composables/__tests__/carga.spec.js src/components/MarcoAdmin.vue src/components/__tests__/marcoAdmin.spec.js
git commit -m "feat: base del admin (errores de descargas, carga con reintento y marco)"
```

---

### Task 6: Pantalla de motivos

**Files:**
- Create: `src/admin/motivos.js`, `src/stores/motivos.js`, `src/components/FormularioMotivo.vue`, `src/views/admin/AdminMotivosView.vue`
- Modify: `src/stores/auth.js` (`logout` reinicia `motivos`)
- Test: `src/admin/__tests__/motivos.spec.js`, `src/stores/__tests__/motivos.spec.js`, `src/views/__tests__/adminMotivos.spec.js` (nuevos)

**Interfaces:**
- Consumes: `GET/POST /admin/motivos`, `PATCH/DELETE /admin/motivos/:id` (plan 4a); `useCarga`, `MarcoAdmin`, `confirmar`.
- Produces:
  - `formularioMotivo(motivo | null) → formulario`; `validarMotivo(formulario, nuevo) → mensaje | null`; `datosMotivo(formulario, original | null) → cuerpo | null` (nuevo: todo; edición: solo lo cambiado, `null` si nada cambió).
  - Store `motivos`: `lista`, `cargar()`, `crear(datos)`, `actualizar(id, cambios)`, `eliminar(id)`. Cada cambio limpia la caché de `catalogos` (el asistente ve los motivos nuevos).

- [ ] **Step 1: Escribir las pruebas que fallan**

`src/admin/__tests__/motivos.spec.js`:

```js
import { test, expect } from 'vitest'
import { formularioMotivo, validarMotivo, datosMotivo } from '@/admin/motivos'

const guardado = {
  id: 3, codigo: 'LAVADO', nombre: 'Lavado', descripcion: null, aplica_propio: true, aplica_proveedor_asistencia: false,
  aplica_proveedor: false, aplica_ingreso: true, aplica_salida: true, tipo_referencia: 'NINGUNA', referencia_obligatoria: false,
  orden: 70, activo: true, en_uso: true
}

test('formulario vacío y desde un motivo', () => {
  expect(formularioMotivo(null)).toEqual({
    codigo: '', nombre: '', descripcion: '', aplica_propio: false, aplica_proveedor_asistencia: false, aplica_proveedor: false,
    aplica_ingreso: true, aplica_salida: true, tipo_referencia: 'NINGUNA', referencia_obligatoria: false, orden: '0', activo: true
  })
  expect(formularioMotivo(guardado)).toMatchObject({ codigo: 'LAVADO', nombre: 'Lavado', descripcion: '', orden: '70', aplica_propio: true })
})

test.each([
  [{ codigo: 'x' }, 'Código inválido (letras, números y _; de 2 a 40)'],
  [{ nombre: ' ' }, 'Indica el nombre'],
  [{ aplica_propio: false }, 'Marca al menos un tipo de vehículo'],
  [{ aplica_ingreso: false, aplica_salida: false }, 'Marca al menos un sentido'],
  [{ referencia_obligatoria: true }, 'Un motivo sin referencia no puede exigirla'],
  [{ orden: '1.5' }, 'Orden inválido'],
  [{ orden: '10000' }, 'Orden inválido']
])('nuevo con %j → %s', (cambio, mensaje) => {
  const f = { ...formularioMotivo(null), codigo: 'NUEVO_1', nombre: 'Nuevo', aplica_propio: true, ...cambio }
  expect(validarMotivo(f, true)).toBe(mensaje)
})

test('un formulario válido no tiene errores; en edición el código no se valida', () => {
  expect(validarMotivo({ ...formularioMotivo(null), codigo: 'nuevo_1', nombre: 'Nuevo', aplica_proveedor: true }, true)).toBeNull()
  expect(validarMotivo({ ...formularioMotivo(guardado), codigo: '' }, false)).toBeNull()
})

test('datos de un motivo nuevo: código en mayúsculas, textos recortados y orden numérico', () => {
  const f = { ...formularioMotivo(null), codigo: ' nuevo_1 ', nombre: ' Nuevo ', descripcion: ' ', aplica_proveedor: true, orden: '15' }
  expect(datosMotivo(f, null)).toEqual({
    codigo: 'NUEVO_1', nombre: 'Nuevo', descripcion: null, aplica_propio: false, aplica_proveedor_asistencia: false, aplica_proveedor: true,
    aplica_ingreso: true, aplica_salida: true, tipo_referencia: 'NINGUNA', referencia_obligatoria: false, orden: 15, activo: true
  })
})

test('en edición solo viaja lo que cambió (nunca el código)', () => {
  const f = { ...formularioMotivo(guardado), nombre: 'Lavado general', orden: '75' }
  expect(datosMotivo(f, guardado)).toEqual({ nombre: 'Lavado general', orden: 75 })
  expect(datosMotivo(formularioMotivo(guardado), guardado)).toBeNull()
})
```

`src/stores/__tests__/motivos.spec.js`:

```js
import { test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

import { porteria } from '@/services/api'
import { useMotivosStore } from '@/stores/motivos'
import { useCatalogosStore } from '@/stores/catalogos'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

test('carga, crea, edita y borra manteniendo el orden y limpiando la caché del asistente', async () => {
  const m = useMotivosStore()
  const catalogos = useCatalogosStore()
  porteria.get.mockResolvedValue({ data: [{ id: 1, nombre: 'B', orden: 20 }, { id: 2, nombre: 'A', orden: 10 }] })
  await m.cargar()
  expect(porteria.get).toHaveBeenCalledWith('/admin/motivos')

  catalogos.cache = { x: { datos: [], en: Date.now() } }
  porteria.post.mockResolvedValue({ data: { id: 3, nombre: 'C', orden: 15 } })
  await m.crear({ codigo: 'C' })
  expect(porteria.post).toHaveBeenCalledWith('/admin/motivos', { codigo: 'C' })
  expect(m.lista.map((x) => x.id)).toEqual([2, 3, 1])
  expect(catalogos.cache).toEqual({})

  porteria.patch.mockResolvedValue({ data: { id: 1, nombre: 'B', orden: 5 } })
  await m.actualizar(1, { orden: 5 })
  expect(porteria.patch).toHaveBeenCalledWith('/admin/motivos/1', { orden: 5 })
  expect(m.lista.map((x) => x.id)).toEqual([1, 2, 3])

  porteria.delete.mockResolvedValue({ data: { id: 2 } })
  await m.eliminar(2)
  expect(porteria.delete).toHaveBeenCalledWith('/admin/motivos/2')
  expect(m.lista.map((x) => x.id)).toEqual([1, 3])
})
```

`src/views/__tests__/adminMotivos.spec.js`:

```js
import { test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, tokenStorage: { leer: () => 't', guardar: () => {} } }))
const confirmar = vi.hoisted(() => vi.fn())
vi.mock('@/composables/confirmar', () => ({ confirmar }))
const toastExito = vi.hoisted(() => vi.fn())
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: toastExito, error: vi.fn() }) }))

import { porteria } from '@/services/api'
import AdminMotivosView from '@/views/admin/AdminMotivosView.vue'

const motivo = (cambios = {}) => ({
  id: 1, codigo: 'LAVADO', nombre: 'Lavado', descripcion: null, aplica_propio: true, aplica_proveedor_asistencia: false,
  aplica_proveedor: false, aplica_ingreso: true, aplica_salida: true, tipo_referencia: 'NINGUNA', referencia_obligatoria: false,
  orden: 70, activo: true, en_uso: false, ...cambios
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  confirmar.mockReset()
  porteria.get.mockResolvedValue({ data: [motivo(), motivo({ id: 2, codigo: 'OTRO', nombre: 'Otro', aplica_propio: false, aplica_proveedor: true, tipo_referencia: 'TEXTO', orden: 120, activo: false, en_uso: true })] })
})

const montar = () => mount(AdminMotivosView, { global: { stubs: { MarcoAdmin: { template: '<div><slot /></div>' } } } })

test('lista los motivos con su estado', async () => {
  const w = montar()
  await flushPromises()
  const filas = w.findAll('[data-test=motivo-fila]')
  expect(filas).toHaveLength(2)
  expect(filas[0].text()).toContain('Lavado')
  expect(filas[0].text()).toContain('Propio')
  expect(filas[1].get('[data-test=motivo-estado]').text()).toBe('Inactivo')
  expect(filas[1].find('[data-test=motivo-borrar]').exists()).toBe(false)
})

test('si la carga falla, muestra el error y deja reintentar', async () => {
  porteria.get.mockRejectedValueOnce({ status: 0, motivo: 'SIN_CONEXION', message: 'Sin conexión con el servidor' })
  const w = montar()
  await flushPromises()
  expect(w.get('[data-test=motivos-error]').text()).toBe('Sin conexión con el servidor')
  await w.get('[data-test=motivos-reintentar]').trigger('click')
  await flushPromises()
  expect(w.findAll('[data-test=motivo-fila]')).toHaveLength(2)
})

test('crear un motivo desde el formulario', async () => {
  porteria.post.mockResolvedValue({ data: motivo({ id: 3, codigo: 'NUEVO', nombre: 'Nuevo', orden: 0 }) })
  const w = montar()
  await flushPromises()
  await w.get('[data-test=motivo-nuevo]').trigger('click')
  await w.get('[data-test=motivo-codigo]').setValue('nuevo')
  await w.get('[data-test=motivo-nombre]').setValue('Nuevo')
  await w.get('[data-test=motivo-guardar]').trigger('click')
  await flushPromises()
  expect(w.get('[data-test=motivo-form-error]').text()).toBe('Marca al menos un tipo de vehículo')
  await w.get('[data-test=motivo-aplica_propio]').setValue(true)
  await w.get('[data-test=motivo-guardar]').trigger('click')
  await flushPromises()
  expect(porteria.post).toHaveBeenCalledWith('/admin/motivos', expect.objectContaining({ codigo: 'NUEVO', nombre: 'Nuevo', aplica_propio: true }))
  expect(w.find('[data-test=motivo-formulario]').exists()).toBe(false)
  expect(w.findAll('[data-test=motivo-fila]')).toHaveLength(3)
})

test('editar envía solo lo cambiado; un error del servidor queda en el formulario', async () => {
  porteria.patch.mockRejectedValueOnce({ status: 400, motivo: 'VALIDACION', message: 'Un motivo sin referencia no puede exigirla' })
  const w = montar()
  await flushPromises()
  await w.findAll('[data-test=motivo-editar]')[0].trigger('click')
  expect(w.find('[data-test=motivo-codigo]').exists()).toBe(false)
  await w.get('[data-test=motivo-nombre]').setValue('Lavado general')
  await w.get('[data-test=motivo-guardar]').trigger('click')
  await flushPromises()
  expect(porteria.patch).toHaveBeenCalledWith('/admin/motivos/1', { nombre: 'Lavado general' })
  expect(w.get('[data-test=motivo-form-error]').text()).toBe('Un motivo sin referencia no puede exigirla')
})

test('activar o inactivar en un toque', async () => {
  porteria.patch.mockResolvedValue({ data: motivo({ id: 2, codigo: 'OTRO', nombre: 'Otro', activo: true, en_uso: true, orden: 120 }) })
  const w = montar()
  await flushPromises()
  await w.findAll('[data-test=motivo-activo]')[1].trigger('click')
  await flushPromises()
  expect(porteria.patch).toHaveBeenCalledWith('/admin/motivos/2', { activo: true })
  expect(w.findAll('[data-test=motivo-estado]')[1].text()).toBe('Activo')
})

test('borrar pide confirmación; un 409 muestra el mensaje del servidor', async () => {
  confirmar.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  porteria.delete.mockRejectedValueOnce({ status: 409, motivo: 'MOTIVO_EN_USO', message: 'El motivo tiene registros: inactívalo en lugar de borrarlo' })
  const w = montar()
  await flushPromises()
  await w.get('[data-test=motivo-borrar]').trigger('click')
  await flushPromises()
  expect(porteria.delete).not.toHaveBeenCalled()
  expect(confirmar).toHaveBeenCalledWith('¿Borrar el motivo "Lavado"?', { aceptar: 'Borrar', peligro: true })
  await w.get('[data-test=motivo-borrar]').trigger('click')
  await flushPromises()
  expect(w.get('[data-test=motivos-error]').text()).toBe('El motivo tiene registros: inactívalo en lugar de borrarlo')
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL (faltan los módulos).

- [ ] **Step 3: Implementar**

`src/admin/motivos.js`:

```js
// Formulario de motivos del admin, sin Vue. Repite las reglas del servidor para avisar antes de enviar.
export const TIPOS = [
  { campo: 'aplica_propio', texto: 'Propio' },
  { campo: 'aplica_proveedor_asistencia', texto: 'Proveedor de asistencias' },
  { campo: 'aplica_proveedor', texto: 'Proveedor' }
]
export const SENTIDOS = [{ campo: 'aplica_ingreso', texto: 'Ingreso' }, { campo: 'aplica_salida', texto: 'Salida' }]
export const REFERENCIAS = [
  { valor: 'NINGUNA', texto: 'Ninguna' },
  { valor: 'ASISTENCIA', texto: 'Asistencia' },
  { valor: 'EXEQUIA', texto: 'Exequia' },
  { valor: 'TEXTO', texto: 'Texto libre' }
]
const BOOLEANOS = [...TIPOS.map((t) => t.campo), ...SENTIDOS.map((s) => s.campo), 'referencia_obligatoria', 'activo']
const CODIGO = /^[A-Z0-9_]{2,40}$/

export function formularioMotivo(m) {
  if (!m) {
    return {
      codigo: '', nombre: '', descripcion: '', aplica_propio: false, aplica_proveedor_asistencia: false, aplica_proveedor: false,
      aplica_ingreso: true, aplica_salida: true, tipo_referencia: 'NINGUNA', referencia_obligatoria: false, orden: '0', activo: true
    }
  }
  return {
    codigo: m.codigo,
    nombre: m.nombre,
    descripcion: m.descripcion || '',
    ...Object.fromEntries(BOOLEANOS.map((c) => [c, Boolean(m[c])])),
    tipo_referencia: m.tipo_referencia,
    orden: String(m.orden)
  }
}

export function validarMotivo(f, nuevo) {
  if (nuevo && !CODIGO.test(f.codigo.trim().toUpperCase())) return 'Código inválido (letras, números y _; de 2 a 40)'
  if (!f.nombre.trim()) return 'Indica el nombre'
  if (!TIPOS.some((t) => f[t.campo])) return 'Marca al menos un tipo de vehículo'
  if (!SENTIDOS.some((s) => f[s.campo])) return 'Marca al menos un sentido'
  if (f.referencia_obligatoria && f.tipo_referencia === 'NINGUNA') return 'Un motivo sin referencia no puede exigirla'
  if (!/^\d{1,4}$/.test(String(f.orden).trim())) return 'Orden inválido'
  return null
}

function cuerpo(f) {
  const datos = {
    nombre: f.nombre.trim(),
    descripcion: f.descripcion.trim() || null,
    tipo_referencia: f.tipo_referencia,
    orden: Number(String(f.orden).trim())
  }
  for (const c of BOOLEANOS) datos[c] = Boolean(f[c])
  return datos
}

export function datosMotivo(f, original) {
  const datos = cuerpo(f)
  if (!original) return { codigo: f.codigo.trim().toUpperCase(), ...datos }
  const cambios = Object.fromEntries(Object.entries(datos).filter(([c, v]) => v !== (original[c] ?? null)))
  return Object.keys(cambios).length ? cambios : null
}
```

`src/stores/motivos.js`:

```js
import { defineStore } from 'pinia'
import { porteria } from '@/services/api'
import { useCatalogosStore } from '@/stores/catalogos'

const porOrden = (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)

// Motivos del admin (activos e inactivos). Cada cambio limpia la caché del asistente.
export const useMotivosStore = defineStore('motivos', {
  state: () => ({ lista: [] }),
  actions: {
    async cargar() {
      this.lista = (await porteria.get('/admin/motivos')).data
      return this.lista
    },
    async crear(datos) {
      const { data } = await porteria.post('/admin/motivos', datos)
      this.lista = [...this.lista, data].sort(porOrden)
      useCatalogosStore().limpiar()
      return data
    },
    async actualizar(id, cambios) {
      const { data } = await porteria.patch(`/admin/motivos/${id}`, cambios)
      this.lista = this.lista.map((m) => (m.id === id ? data : m)).sort(porOrden)
      useCatalogosStore().limpiar()
      return data
    },
    async eliminar(id) {
      await porteria.delete(`/admin/motivos/${id}`)
      this.lista = this.lista.filter((m) => m.id !== id)
      useCatalogosStore().limpiar()
    }
  }
})
```

En `src/stores/auth.js`: importar `useMotivosStore` y en `logout` agregar `useMotivosStore().$reset()`.

`src/components/FormularioMotivo.vue`:

```vue
<script setup>
import { reactive, ref } from 'vue'
import { formularioMotivo, validarMotivo, datosMotivo, TIPOS, SENTIDOS, REFERENCIAS } from '@/admin/motivos'

const props = defineProps({
  motivo: { type: Object, default: null },
  // Mensaje del servidor al guardar (lo pasa la vista).
  error: { type: String, default: '' },
  guardando: { type: Boolean, default: false }
})
const emit = defineEmits(['guardar', 'cancelar'])
const nuevo = !props.motivo
const f = reactive(formularioMotivo(props.motivo))
const local = ref('')

function guardar() {
  local.value = validarMotivo(f, nuevo) || ''
  if (local.value) return
  const datos = datosMotivo(f, props.motivo)
  if (!datos) {
    emit('cancelar')
    return
  }
  emit('guardar', datos)
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" data-test="motivo-formulario">
    <div class="tarjeta w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto">
      <p class="text-lg font-bold">{{ nuevo ? 'Nuevo motivo' : `Editar ${motivo.codigo}` }}</p>
      <div v-if="nuevo">
        <label class="etiqueta" for="m-codigo">Código</label>
        <input id="m-codigo" v-model="f.codigo" class="campo uppercase" maxlength="40" data-test="motivo-codigo" />
      </div>
      <div>
        <label class="etiqueta" for="m-nombre">Nombre</label>
        <input id="m-nombre" v-model="f.nombre" class="campo" maxlength="100" data-test="motivo-nombre" />
      </div>
      <div>
        <label class="etiqueta" for="m-desc">Descripción (opcional)</label>
        <input id="m-desc" v-model="f.descripcion" class="campo" maxlength="255" data-test="motivo-descripcion" />
      </div>
      <fieldset>
        <legend class="etiqueta">Aplica a</legend>
        <label v-for="t in TIPOS" :key="t.campo" class="flex items-center gap-3 min-h-tactil">
          <input v-model="f[t.campo]" type="checkbox" class="w-6 h-6" :data-test="`motivo-${t.campo}`" /> {{ t.texto }}
        </label>
      </fieldset>
      <fieldset>
        <legend class="etiqueta">Sentido</legend>
        <label v-for="s in SENTIDOS" :key="s.campo" class="flex items-center gap-3 min-h-tactil">
          <input v-model="f[s.campo]" type="checkbox" class="w-6 h-6" :data-test="`motivo-${s.campo}`" /> {{ s.texto }}
        </label>
      </fieldset>
      <div>
        <label class="etiqueta" for="m-ref">Referencia</label>
        <select id="m-ref" v-model="f.tipo_referencia" class="campo" data-test="motivo-tipo_referencia">
          <option v-for="r in REFERENCIAS" :key="r.valor" :value="r.valor">{{ r.texto }}</option>
        </select>
      </div>
      <label class="flex items-center gap-3 min-h-tactil">
        <input v-model="f.referencia_obligatoria" type="checkbox" class="w-6 h-6" :disabled="f.tipo_referencia === 'NINGUNA'" data-test="motivo-referencia_obligatoria" />
        La referencia es obligatoria
      </label>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="etiqueta" for="m-orden">Orden</label>
          <input id="m-orden" v-model="f.orden" class="campo" inputmode="numeric" data-test="motivo-orden" />
        </div>
        <label class="flex items-center gap-3 min-h-tactil self-end">
          <input v-model="f.activo" type="checkbox" class="w-6 h-6" data-test="motivo-activo-form" /> Activo
        </label>
      </div>
      <p v-if="local || error" class="aviso-error" role="alert" data-test="motivo-form-error">{{ local || error }}</p>
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn-secundario" data-test="motivo-cancelar" @click="emit('cancelar')">Cancelar</button>
        <button type="button" class="btn-primario" :disabled="guardando" data-test="motivo-guardar" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </div>
  </div>
</template>
```

`src/views/admin/AdminMotivosView.vue`:

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import MarcoAdmin from '@/components/MarcoAdmin.vue'
import FormularioMotivo from '@/components/FormularioMotivo.vue'
import { useMotivosStore } from '@/stores/motivos'
import { useCarga } from '@/composables/carga'
import { confirmar } from '@/composables/confirmar'
import { TIPOS, REFERENCIAS } from '@/admin/motivos'

const motivos = useMotivosStore()
const toast = useToast()
const { cargando, error: errorCarga, ejecutar: cargar } = useCarga(() => motivos.cargar())
const error = ref('')
const edicion = ref(null) // { motivo: null | objeto }
const errorFormulario = ref('')
const guardando = ref(false)
const ocupado = ref(new Set())

onMounted(cargar)

const tiposDe = (m) => TIPOS.filter((t) => m[t.campo]).map((t) => t.texto).join(', ')
const sentidosDe = (m) => [m.aplica_ingreso && 'Ingreso', m.aplica_salida && 'Salida'].filter(Boolean).join(' y ')
const referenciaDe = (m) => {
  const r = REFERENCIAS.find((x) => x.valor === m.tipo_referencia)
  return m.tipo_referencia === 'NINGUNA' ? 'Sin referencia' : `${r ? r.texto : m.tipo_referencia}${m.referencia_obligatoria ? ' (obligatoria)' : ''}`
}

function abrir(motivo) {
  errorFormulario.value = ''
  edicion.value = { motivo }
}

async function guardar(datos) {
  errorFormulario.value = ''
  guardando.value = true
  try {
    const m = edicion.value.motivo
    if (m) await motivos.actualizar(m.id, datos)
    else await motivos.crear(datos)
    toast.success(m ? 'Motivo actualizado' : 'Motivo creado')
    edicion.value = null
  } catch (e) {
    errorFormulario.value = e.message
  } finally {
    guardando.value = false
  }
}

async function enFila(m, accion) {
  if (ocupado.value.has(m.id)) return
  error.value = ''
  ocupado.value = new Set(ocupado.value).add(m.id)
  try {
    await accion()
  } catch (e) {
    error.value = e.message
  } finally {
    const resto = new Set(ocupado.value)
    resto.delete(m.id)
    ocupado.value = resto
  }
}

const alternarActivo = (m) => enFila(m, async () => {
  await motivos.actualizar(m.id, { activo: !m.activo })
  toast.success(m.activo ? 'Motivo inactivado' : 'Motivo activado')
})

async function borrar(m) {
  if (!(await confirmar(`¿Borrar el motivo "${m.nombre}"?`, { aceptar: 'Borrar', peligro: true }))) return
  await enFila(m, async () => {
    await motivos.eliminar(m.id)
    toast.success('Motivo borrado')
  })
}
</script>

<template>
  <MarcoAdmin titulo="Motivos">
    <div class="flex justify-end mb-3">
      <button type="button" class="btn-primario" data-test="motivo-nuevo" @click="abrir(null)">Nuevo motivo</button>
    </div>
    <p v-if="errorCarga || error" class="aviso-error mb-3" role="alert" data-test="motivos-error">{{ errorCarga || error }}</p>
    <button v-if="errorCarga" type="button" class="btn-secundario mb-3" data-test="motivos-reintentar" @click="cargar">Reintentar</button>
    <p v-if="cargando && !motivos.lista.length" class="text-gray-600">Cargando…</p>
    <ul class="space-y-3">
      <li v-for="m in motivos.lista" :key="m.id" class="tarjeta space-y-2" :class="m.activo ? '' : 'opacity-70'" data-test="motivo-fila">
        <div class="flex items-center justify-between gap-2">
          <p class="text-lg font-bold">{{ m.nombre }} <span class="text-sm font-normal text-gray-600">· {{ m.codigo }} · orden {{ m.orden }}</span></p>
          <span class="rounded-lg px-2 py-1 text-sm" :class="m.activo ? 'bg-green-100 text-green-900' : 'bg-gray-200'" data-test="motivo-estado">{{ m.activo ? 'Activo' : 'Inactivo' }}</span>
        </div>
        <p class="text-gray-700">{{ tiposDe(m) }} · {{ sentidosDe(m) }} · {{ referenciaDe(m) }}</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn-secundario" data-test="motivo-editar" :disabled="ocupado.has(m.id)" @click="abrir(m)">Editar</button>
          <button type="button" class="btn-secundario" data-test="motivo-activo" :disabled="ocupado.has(m.id)" @click="alternarActivo(m)">{{ m.activo ? 'Inactivar' : 'Activar' }}</button>
          <button v-if="!m.en_uso" type="button" class="btn-peligro" data-test="motivo-borrar" :disabled="ocupado.has(m.id)" @click="borrar(m)">Borrar</button>
        </div>
      </li>
    </ul>
    <FormularioMotivo
      v-if="edicion" :motivo="edicion.motivo" :error="errorFormulario" :guardando="guardando"
      @guardar="guardar" @cancelar="edicion = null"
    />
  </MarcoAdmin>
</template>
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test` y `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin src/stores/motivos.js src/stores/auth.js src/components/FormularioMotivo.vue src/views/admin/AdminMotivosView.vue src/stores/__tests__/motivos.spec.js src/views/__tests__/adminMotivos.spec.js
git commit -m "feat: administración de motivos"
```

---

### Task 7: Pantalla del catálogo de proveedores

**Files:**
- Create: `src/stores/proveedores.js`, `src/components/FormularioProveedor.vue`, `src/views/admin/AdminProveedoresView.vue`
- Modify: `src/stores/auth.js` (`logout` reinicia `proveedores`)
- Test: `src/stores/__tests__/proveedores.spec.js`, `src/views/__tests__/adminProveedores.spec.js` (nuevos)

**Interfaces:**
- Consumes: `GET /vehiculos-externos?q=&incluir_inactivos=1`, `POST /vehiculos-externos`, `PATCH /vehiculos-externos/:id` (plan 4a, Task 3).
- Produces: store `proveedores`: `lista`, `buscar(q)`, `crear({ placa, tipo, empresa, descripcion })`, `actualizar(id, cambios)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`src/stores/__tests__/proveedores.spec.js`:

```js
import { test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))

import { porteria } from '@/services/api'
import { useProveedoresStore } from '@/stores/proveedores'
import { useCatalogosStore } from '@/stores/catalogos'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

test('busca con inactivos, crea al inicio de la lista y reemplaza al editar', async () => {
  const p = useProveedoresStore()
  porteria.get.mockResolvedValue({ data: [{ id: 1, placa: 'AAA111', activo: false }] })
  await p.buscar('aaa')
  expect(porteria.get).toHaveBeenCalledWith('/vehiculos-externos', { params: { q: 'aaa', incluir_inactivos: '1' } })
  await p.buscar('')
  expect(porteria.get).toHaveBeenLastCalledWith('/vehiculos-externos', { params: { incluir_inactivos: '1' } })

  porteria.post.mockResolvedValue({ data: { id: 2, placa: 'BBB222', activo: true } })
  await p.crear({ placa: 'bbb222', tipo: 'PROVEEDOR', empresa: 'X', descripcion: null })
  expect(porteria.post).toHaveBeenCalledWith('/vehiculos-externos', { placa: 'bbb222', tipo: 'PROVEEDOR', empresa: 'X', descripcion: null })
  expect(p.lista.map((v) => v.id)).toEqual([2, 1])

  useCatalogosStore().cache = { x: { datos: [], en: Date.now() } }
  porteria.patch.mockResolvedValue({ data: { id: 1, placa: 'AAA111', activo: true } })
  await p.actualizar(1, { activo: true })
  expect(porteria.patch).toHaveBeenCalledWith('/vehiculos-externos/1', { activo: true })
  expect(p.lista.find((v) => v.id === 1).activo).toBe(true)
})
```

`src/views/__tests__/adminProveedores.spec.js`:

```js
import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, tokenStorage: { leer: () => 't', guardar: () => {} } }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

import { porteria } from '@/services/api'
import AdminProveedoresView from '@/views/admin/AdminProveedoresView.vue'

const vehiculo = (cambios = {}) => ({ id: 1, placa: 'XYZ123', tipo: 'PROVEEDOR', empresa: 'Flores', descripcion: null, activo: true, ...cambios })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  setActivePinia(createPinia())
  vi.clearAllMocks()
  porteria.get.mockResolvedValue({ data: [vehiculo(), vehiculo({ id: 2, placa: 'QWE987', empresa: 'Cofres SA', tipo: 'PROVEEDOR_ASISTENCIA', activo: false })] })
})
afterEach(() => vi.useRealTimers())

const montar = () => mount(AdminProveedoresView, { global: { stubs: { MarcoAdmin: { template: '<div><slot /></div>' } } } })

test('carga al entrar y busca al escribir', async () => {
  const w = montar()
  await flushPromises()
  expect(w.findAll('[data-test=proveedor-fila]')).toHaveLength(2)
  expect(w.findAll('[data-test=proveedor-estado]')[1].text()).toBe('Inactivo')
  await w.get('[data-test=proveedores-buscar]').setValue('flo')
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  expect(porteria.get).toHaveBeenLastCalledWith('/vehiculos-externos', { params: { q: 'flo', incluir_inactivos: '1' } })
})

test('editar empresa y tipo', async () => {
  porteria.patch.mockResolvedValue({ data: vehiculo({ empresa: 'Flores del Norte' }) })
  const w = montar()
  await flushPromises()
  await w.findAll('[data-test=proveedor-editar]')[0].trigger('click')
  expect(w.get('[data-test=proveedor-placa]').attributes('disabled')).toBeDefined()
  await w.get('[data-test=proveedor-empresa]').setValue('Flores del Norte')
  await w.get('[data-test=proveedor-guardar]').trigger('click')
  await flushPromises()
  expect(porteria.patch).toHaveBeenCalledWith('/vehiculos-externos/1', { empresa: 'Flores del Norte' })
  expect(w.findAll('[data-test=proveedor-fila]')[0].text()).toContain('Flores del Norte')
})

test('agregar valida y muestra el error del servidor', async () => {
  porteria.post.mockRejectedValueOnce({ status: 409, motivo: 'PLACA_PROPIA', message: 'La placa es de un vehículo de la empresa' })
  const w = montar()
  await flushPromises()
  await w.get('[data-test=proveedor-nuevo]').trigger('click')
  await w.get('[data-test=proveedor-guardar]').trigger('click')
  expect(w.get('[data-test=proveedor-form-error]').text()).toBe('Escribe la placa, el tipo y la empresa')
  await w.get('[data-test=proveedor-placa]').setValue('abc-123')
  await w.get('[data-test=proveedor-tipo]').setValue('PROVEEDOR')
  await w.get('[data-test=proveedor-empresa]').setValue('Otra')
  await w.get('[data-test=proveedor-guardar]').trigger('click')
  await flushPromises()
  expect(porteria.post).toHaveBeenCalledWith('/vehiculos-externos', { placa: 'ABC123', tipo: 'PROVEEDOR', empresa: 'Otra', descripcion: null })
  expect(w.get('[data-test=proveedor-form-error]').text()).toBe('La placa es de un vehículo de la empresa')
})

test('activar un inactivo', async () => {
  porteria.patch.mockResolvedValue({ data: vehiculo({ id: 2, placa: 'QWE987', activo: true }) })
  const w = montar()
  await flushPromises()
  await w.findAll('[data-test=proveedor-activo]')[1].trigger('click')
  await flushPromises()
  expect(porteria.patch).toHaveBeenCalledWith('/vehiculos-externos/2', { activo: true })
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL (faltan los módulos).

- [ ] **Step 3: Implementar**

`src/stores/proveedores.js`:

```js
import { defineStore } from 'pinia'
import { porteria } from '@/services/api'
import { useCatalogosStore } from '@/stores/catalogos'

// Catálogo de proveedores visto por el admin: incluye inactivos para poder reactivarlos.
export const useProveedoresStore = defineStore('proveedores', {
  state: () => ({ lista: [] }),
  actions: {
    async buscar(q) {
      const params = q ? { q, incluir_inactivos: '1' } : { incluir_inactivos: '1' }
      this.lista = (await porteria.get('/vehiculos-externos', { params })).data
      return this.lista
    },
    async crear(datos) {
      const { data } = await porteria.post('/vehiculos-externos', datos)
      this.lista = [data, ...this.lista.filter((v) => v.id !== data.id)]
      useCatalogosStore().limpiar()
      return data
    },
    async actualizar(id, cambios) {
      const { data } = await porteria.patch(`/vehiculos-externos/${id}`, cambios)
      this.lista = this.lista.map((v) => (v.id === id ? data : v))
      useCatalogosStore().limpiar()
      return data
    }
  }
})
```

En `src/stores/auth.js`: importar `useProveedoresStore` y en `logout` agregar `useProveedoresStore().$reset()`.

`src/components/FormularioProveedor.vue`:

```vue
<script setup>
import { reactive, ref } from 'vue'
import { normalizarPlaca } from '@/utils/placa'

const props = defineProps({
  vehiculo: { type: Object, default: null },
  error: { type: String, default: '' },
  guardando: { type: Boolean, default: false }
})
const emit = defineEmits(['guardar', 'cancelar'])
const TIPOS = [{ valor: 'PROVEEDOR', texto: 'Proveedor' }, { valor: 'PROVEEDOR_ASISTENCIA', texto: 'Proveedor de asistencias' }]
const v = props.vehiculo
const f = reactive({ placa: v ? v.placa : '', tipo: v ? v.tipo : '', empresa: v ? v.empresa : '', descripcion: (v && v.descripcion) || '' })
const local = ref('')

function guardar() {
  const datos = { tipo: f.tipo, empresa: f.empresa.trim(), descripcion: f.descripcion.trim() || null }
  if ((!v && !normalizarPlaca(f.placa)) || !datos.tipo || !datos.empresa) {
    local.value = 'Escribe la placa, el tipo y la empresa'
    return
  }
  local.value = ''
  if (!v) return emit('guardar', { placa: normalizarPlaca(f.placa), ...datos })
  const cambios = Object.fromEntries(Object.entries(datos).filter(([c, valor]) => valor !== (v[c] ?? null)))
  if (Object.keys(cambios).length === 0) return emit('cancelar')
  emit('guardar', cambios)
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" data-test="proveedor-formulario">
    <div class="tarjeta w-full max-w-md space-y-3">
      <p class="text-lg font-bold">{{ v ? `Editar ${v.placa}` : 'Agregar vehículo de proveedor' }}</p>
      <div>
        <label class="etiqueta" for="p-placa">Placa</label>
        <input id="p-placa" v-model="f.placa" class="campo uppercase tracking-widest" maxlength="20" :disabled="Boolean(v)" data-test="proveedor-placa" />
      </div>
      <div>
        <label class="etiqueta" for="p-tipo">Tipo</label>
        <select id="p-tipo" v-model="f.tipo" class="campo" data-test="proveedor-tipo">
          <option value="" disabled>Elige el tipo</option>
          <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.texto }}</option>
        </select>
      </div>
      <div>
        <label class="etiqueta" for="p-empresa">Empresa</label>
        <input id="p-empresa" v-model="f.empresa" class="campo" maxlength="150" data-test="proveedor-empresa" />
      </div>
      <div>
        <label class="etiqueta" for="p-desc">Descripción (opcional)</label>
        <input id="p-desc" v-model="f.descripcion" class="campo" maxlength="255" data-test="proveedor-descripcion" />
      </div>
      <p v-if="local || error" class="aviso-error" role="alert" data-test="proveedor-form-error">{{ local || error }}</p>
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="btn-secundario" data-test="proveedor-cancelar" @click="emit('cancelar')">Cancelar</button>
        <button type="button" class="btn-primario" :disabled="guardando" data-test="proveedor-guardar" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
      </div>
    </div>
  </div>
</template>
```

`src/views/admin/AdminProveedoresView.vue`:

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useToast } from 'vue-toastification'
import MarcoAdmin from '@/components/MarcoAdmin.vue'
import FormularioProveedor from '@/components/FormularioProveedor.vue'
import { useProveedoresStore } from '@/stores/proveedores'
import { useCarga } from '@/composables/carga'

const proveedores = useProveedoresStore()
const toast = useToast()
const q = ref('')
const { cargando, error: errorCarga, ejecutar: buscar } = useCarga(() => proveedores.buscar(q.value.trim()))
const error = ref('')
const edicion = ref(null) // { vehiculo: null | objeto }
const errorFormulario = ref('')
const guardando = ref(false)
const ocupado = ref(new Set())
let temporizador = null

onMounted(buscar)
onBeforeUnmount(() => clearTimeout(temporizador))

function alEscribir() {
  clearTimeout(temporizador)
  temporizador = setTimeout(buscar, 300)
}

const TIPO = { PROVEEDOR: 'Proveedor', PROVEEDOR_ASISTENCIA: 'Proveedor de asistencias' }

function abrir(vehiculo) {
  errorFormulario.value = ''
  edicion.value = { vehiculo }
}

async function guardar(datos) {
  errorFormulario.value = ''
  guardando.value = true
  try {
    const v = edicion.value.vehiculo
    if (v) await proveedores.actualizar(v.id, datos)
    else await proveedores.crear(datos)
    toast.success(v ? 'Vehículo actualizado' : 'Vehículo agregado')
    edicion.value = null
  } catch (e) {
    errorFormulario.value = e.message
  } finally {
    guardando.value = false
  }
}

async function alternarActivo(v) {
  if (ocupado.value.has(v.id)) return
  error.value = ''
  ocupado.value = new Set(ocupado.value).add(v.id)
  try {
    await proveedores.actualizar(v.id, { activo: !v.activo })
    toast.success(v.activo ? 'Vehículo inactivado' : 'Vehículo activado')
  } catch (e) {
    error.value = e.message
  } finally {
    const resto = new Set(ocupado.value)
    resto.delete(v.id)
    ocupado.value = resto
  }
}
</script>

<template>
  <MarcoAdmin titulo="Proveedores">
    <div class="flex flex-wrap gap-2 mb-3">
      <input v-model="q" class="campo flex-1 min-w-[12rem]" placeholder="Placa o empresa" maxlength="50" data-test="proveedores-buscar" @input="alEscribir" />
      <button type="button" class="btn-primario" data-test="proveedor-nuevo" @click="abrir(null)">Agregar</button>
    </div>
    <p v-if="errorCarga || error" class="aviso-error mb-3" role="alert" data-test="proveedores-error">{{ errorCarga || error }}</p>
    <button v-if="errorCarga" type="button" class="btn-secundario mb-3" data-test="proveedores-reintentar" @click="buscar">Reintentar</button>
    <p v-if="cargando && !proveedores.lista.length" class="text-gray-600">Cargando…</p>
    <p v-else-if="!proveedores.lista.length && !errorCarga" class="text-gray-600">Sin resultados.</p>
    <p class="text-sm text-gray-600 mb-2">Se muestran hasta 30; afina la búsqueda para encontrar otros.</p>
    <ul class="space-y-3">
      <li v-for="v in proveedores.lista" :key="v.id" class="tarjeta space-y-2" :class="v.activo ? '' : 'opacity-70'" data-test="proveedor-fila">
        <div class="flex items-center justify-between gap-2">
          <p class="text-lg font-bold"><span class="tracking-wider">{{ v.placa }}</span> · {{ v.empresa }}</p>
          <span class="rounded-lg px-2 py-1 text-sm" :class="v.activo ? 'bg-green-100 text-green-900' : 'bg-gray-200'" data-test="proveedor-estado">{{ v.activo ? 'Activo' : 'Inactivo' }}</span>
        </div>
        <p class="text-gray-700">{{ TIPO[v.tipo] || v.tipo }}<template v-if="v.descripcion"> · {{ v.descripcion }}</template></p>
        <div class="flex gap-2">
          <button type="button" class="btn-secundario" data-test="proveedor-editar" :disabled="ocupado.has(v.id)" @click="abrir(v)">Editar</button>
          <button type="button" class="btn-secundario" data-test="proveedor-activo" :disabled="ocupado.has(v.id)" @click="alternarActivo(v)">{{ v.activo ? 'Inactivar' : 'Activar' }}</button>
        </div>
      </li>
    </ul>
    <FormularioProveedor
      v-if="edicion" :vehiculo="edicion.vehiculo" :error="errorFormulario" :guardando="guardando"
      @guardar="guardar" @cancelar="edicion = null"
    />
  </MarcoAdmin>
</template>
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test` y `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/proveedores.js src/stores/auth.js src/components/FormularioProveedor.vue src/views/admin/AdminProveedoresView.vue src/stores/__tests__/proveedores.spec.js src/views/__tests__/adminProveedores.spec.js
git commit -m "feat: administración del catálogo de proveedores"
```

---

### Task 8: Consulta de movimientos y descarga de Excel

**Files:**
- Modify: `src/utils/fechas.js` (agrega `fechaHora`)
- Create: `src/services/archivos.js`, `src/stores/consulta.js`, `src/views/admin/AdminMovimientosView.vue`
- Modify: `src/stores/auth.js` (`logout` reinicia `consulta`)
- Test: `src/utils/__tests__/fechas.spec.js`, `src/stores/__tests__/consulta.spec.js`, `src/views/__tests__/adminMovimientos.spec.js` (nuevos los dos últimos)

**Interfaces:**
- Consumes: `GET /eventos` con `sede_id=todas|<id>` (plan 4a, Task 2), `GET /admin/reportes/movimientos.xlsx`; `auth.cargarSedes()`, `auth.nombreSede(id)`; `useMotivosStore().cargar()`.
- Produces:
  - `fechaHora(valor) → 'AAAA-MM-DD HH:mm'` (hora local).
  - `guardarArchivo(blob, nombre)`, `nombreReporte(params) → 'movimientos_<desde|inicio>_<hasta|hoy>.xlsx'`.
  - Store `consulta`: `filtros` (`sede: 'todas' | id`, `desde`, `hasta`, `placa`, `tipo`, `motivoId`, `inconsistente: '' | '1' | '0'`), `items`, `total`, `pagina`, `buscar()`, `cargarMas()`, `descargarExcel()`, `reemplazar(evento)`; `paramsDe(filtros)` exportada.
  - La Task 9 agrega el detalle; esta tarea deja cada fila con `data-test=consulta-fila` y emite la selección guardando `seleccionado` (ref local) sin mostrar nada aún.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `src/utils/__tests__/fechas.spec.js` (importar `fechaHora`):

```js
test('fechaHora en hora local', () => {
  expect(fechaHora(new Date(2026, 9, 5, 7, 4))).toBe('2026-10-05 07:04')
  expect(fechaHora(null)).toBe('')
})
```

`src/stores/__tests__/consulta.spec.js`:

```js
import { test, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn() } }))
const guardarArchivo = vi.hoisted(() => vi.fn())
vi.mock('@/services/archivos', async (original) => ({ ...(await original()), guardarArchivo }))

import { porteria } from '@/services/api'
import { useConsultaStore, paramsDe } from '@/stores/consulta'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

test('params: todas las sedes, placa normalizada y solo filtros con valor', () => {
  expect(paramsDe({ sede: 'todas', desde: '2026-10-01', hasta: '2026-10-31', placa: ' abc-1 ', tipo: '', motivoId: '', inconsistente: '' }))
    .toEqual({ sede_id: 'todas', desde: '2026-10-01', hasta: '2026-10-31', placa: 'ABC1' })
  expect(paramsDe({ sede: 3, desde: '', hasta: '', placa: '', tipo: 'PROPIO', motivoId: 6, inconsistente: '1' }))
    .toEqual({ sede_id: '3', tipo_vehiculo: 'PROPIO', motivo_id: '6', inconsistente: '1' })
})

test('buscar y cargar más con los filtros aplicados, sin repetir filas', async () => {
  const c = useConsultaStore()
  c.filtros = { ...c.filtros, desde: '2026-10-01', hasta: '2026-10-02' }
  porteria.get
    .mockResolvedValueOnce({ data: { items: [{ id: 5 }, { id: 4 }], total: 3, pagina: 1 } })
    .mockResolvedValueOnce({ data: { items: [{ id: 4 }, { id: 3 }], total: 3, pagina: 2 } })
  await c.buscar()
  expect(porteria.get).toHaveBeenCalledWith('/eventos', { params: { sede_id: 'todas', desde: '2026-10-01', hasta: '2026-10-02' } })
  c.filtros.placa = 'zzz'
  await c.cargarMas()
  expect(porteria.get).toHaveBeenLastCalledWith('/eventos', { params: { sede_id: 'todas', desde: '2026-10-01', hasta: '2026-10-02', pagina: 2 } })
  expect(c.items.map((e) => e.id)).toEqual([5, 4, 3])
})

test('una fecha inicial posterior a la final no consulta', async () => {
  const c = useConsultaStore()
  c.filtros = { ...c.filtros, desde: '2026-10-05', hasta: '2026-10-01' }
  await expect(c.buscar()).rejects.toMatchObject({ message: 'La fecha inicial es posterior a la final' })
  expect(porteria.get).not.toHaveBeenCalled()
})

test('descarga el Excel con los filtros visibles', async () => {
  const c = useConsultaStore()
  c.filtros = { ...c.filtros, sede: 2, desde: '2026-10-01', hasta: '2026-10-31' }
  const blob = new Blob(['x'])
  porteria.get.mockResolvedValue(blob)
  await c.descargarExcel()
  expect(porteria.get).toHaveBeenCalledWith('/admin/reportes/movimientos.xlsx', {
    params: { sede_id: '2', desde: '2026-10-01', hasta: '2026-10-31' }, responseType: 'blob', timeout: 120000
  })
  expect(guardarArchivo).toHaveBeenCalledWith(blob, 'movimientos_2026-10-01_2026-10-31.xlsx')
})
```

`src/views/__tests__/adminMovimientos.spec.js`:

```js
import { test, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, tokenStorage: { leer: () => 't', guardar: () => {} } }))
const guardarArchivo = vi.hoisted(() => vi.fn())
vi.mock('@/services/archivos', async (original) => ({ ...(await original()), guardarArchivo }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

import { porteria } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import AdminMovimientosView from '@/views/admin/AdminMovimientosView.vue'

const evento = (id, cambios = {}) => ({
  id, sede_id: 1, sentido: 'SALIDA', tipo_vehiculo: 'PROPIO', placa: `CAR${id}`, motivo: { id: 6, nombre: 'Tanqueo' },
  conductor_nombre: 'Juan', registrado_at: new Date(2026, 9, 5, 8, 0).toISOString(), registrado_por: 'g1',
  anulado: false, inconsistente: false, ...cambios
})

function api({ eventos = { items: [evento(1), evento(2, { inconsistente: true, sede_id: 2 })], total: 3, pagina: 1 } } = {}) {
  porteria.get.mockImplementation(async (url, opciones = {}) => {
    if (url === '/catalogos/sedes') return { data: [{ id: 1, nombre: 'Norte' }, { id: 2, nombre: 'Sur' }] }
    if (url === '/admin/motivos') return { data: [{ id: 6, nombre: 'Tanqueo', orden: 60 }] }
    if (url === '/eventos') return { data: opciones.params.pagina === 2 ? { items: [evento(3)], total: 3, pagina: 2 } : eventos }
    if (url === '/admin/reportes/movimientos.xlsx') return new Blob(['x'])
    return { data: [] }
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  useAuthStore().fijarSesion('t', { usuario: 'a1', nombre: 'A', rol: 'admin_porteria', sede: null })
  api()
})

const montar = () => mount(AdminMovimientosView, { global: { stubs: { MarcoAdmin: { template: '<div><slot /></div>' }, DetalleEvento: true } } })

test('al entrar consulta hoy en todas las sedes y muestra sede, marca y "cargar más"', async () => {
  const w = montar()
  await flushPromises()
  const llamada = porteria.get.mock.calls.find(([url]) => url === '/eventos')
  expect(llamada[1].params.sede_id).toBe('todas')
  expect(llamada[1].params.desde).toBe(llamada[1].params.hasta)
  const filas = w.findAll('[data-test=consulta-fila]')
  expect(filas).toHaveLength(2)
  expect(filas[1].text()).toContain('Sur')
  expect(filas[1].find('[data-test=consulta-inconsistente]').exists()).toBe(true)
  expect(w.get('[data-test=consulta-total]').text()).toBe('2 de 3')
  await w.get('[data-test=consulta-mas]').trigger('click')
  await flushPromises()
  expect(w.findAll('[data-test=consulta-fila]')).toHaveLength(3)
  expect(w.find('[data-test=consulta-mas]').exists()).toBe(false)
})

test('buscar con filtros y descargar el Excel', async () => {
  const w = montar()
  await flushPromises()
  await w.get('[data-test=filtro-sede]').setValue('2')
  await w.get('[data-test=filtro-desde]').setValue('2026-10-01')
  await w.get('[data-test=filtro-hasta]').setValue('2026-10-31')
  await w.get('[data-test=filtro-inconsistente]').setValue('1')
  await w.get('[data-test=consulta-buscar]').trigger('click')
  await flushPromises()
  expect(porteria.get).toHaveBeenLastCalledWith('/eventos', { params: { sede_id: '2', desde: '2026-10-01', hasta: '2026-10-31', inconsistente: '1' } })
  await w.get('[data-test=consulta-excel]').trigger('click')
  await flushPromises()
  expect(guardarArchivo).toHaveBeenCalledWith(expect.any(Blob), 'movimientos_2026-10-01_2026-10-31.xlsx')
})

test('un error de la consulta o del Excel se muestra', async () => {
  const w = montar()
  await flushPromises()
  porteria.get.mockRejectedValueOnce({ status: 413, motivo: 'DEMASIADOS_REGISTROS', message: 'El reporte supera 50000 movimientos. Acota las fechas o los filtros.' })
  await w.get('[data-test=consulta-excel]').trigger('click')
  await flushPromises()
  expect(w.get('[data-test=consulta-error]').text()).toBe('El reporte supera 50000 movimientos. Acota las fechas o los filtros.')
  await w.get('[data-test=filtro-desde]').setValue('2026-10-09')
  await w.get('[data-test=filtro-hasta]').setValue('2026-10-01')
  await w.get('[data-test=consulta-buscar]').trigger('click')
  await flushPromises()
  expect(w.get('[data-test=consulta-error]').text()).toBe('La fecha inicial es posterior a la final')
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL (faltan los módulos).

- [ ] **Step 3: Implementar**

En `src/utils/fechas.js`:

```js
export function fechaHora(valor) {
  if (!valor) return ''
  const f = new Date(valor)
  return `${hoyLocal(f)} ${horaCorta(f)}`
}
```

`src/services/archivos.js`:

```js
// Descargas generadas en el navegador (el Excel del reporte llega como Blob).
export function guardarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const nombreReporte = (p) => `movimientos_${p.desde || 'inicio'}_${p.hasta || 'hoy'}.xlsx`
```

`src/stores/consulta.js`:

```js
import { defineStore } from 'pinia'
import { porteria } from '@/services/api'
import { guardarArchivo, nombreReporte } from '@/services/archivos'
import { hoyLocal } from '@/utils/fechas'
import { normalizarPlaca } from '@/utils/placa'

const filtrosIniciales = () => ({ sede: 'todas', desde: hoyLocal(), hasta: hoyLocal(), placa: '', tipo: '', motivoId: '', inconsistente: '' })
// Un Excel de muchas filas tarda más que una consulta normal.
const TIEMPO_EXCEL = 120000

export function paramsDe(f) {
  const p = { sede_id: f.sede === 'todas' ? 'todas' : String(f.sede) }
  if (f.desde) p.desde = f.desde
  if (f.hasta) p.hasta = f.hasta
  const placa = normalizarPlaca(f.placa || '')
  if (placa) p.placa = placa
  if (f.tipo) p.tipo_vehiculo = f.tipo
  if (f.motivoId) p.motivo_id = String(f.motivoId)
  if (f.inconsistente !== '') p.inconsistente = f.inconsistente
  return p
}

function validar(f) {
  if (f.desde && f.hasta && f.desde > f.hasta) throw { message: 'La fecha inicial es posterior a la final' }
}

// Consulta del admin: los filtros que se ven, y los ya aplicados para paginar sin mezclar.
export const useConsultaStore = defineStore('consulta', {
  state: () => ({ filtros: filtrosIniciales(), aplicados: null, items: [], total: 0, pagina: 0 }),
  actions: {
    async buscar() {
      validar(this.filtros)
      const params = paramsDe(this.filtros)
      const { data } = await porteria.get('/eventos', { params })
      this.aplicados = params
      this.items = data.items
      this.total = data.total
      this.pagina = data.pagina
    },
    async cargarMas() {
      const { data } = await porteria.get('/eventos', { params: { ...this.aplicados, pagina: this.pagina + 1 } })
      const vistos = new Set(this.items.map((e) => e.id))
      this.items.push(...data.items.filter((e) => !vistos.has(e.id)))
      this.total = data.total
      this.pagina = data.pagina
    },
    async descargarExcel() {
      validar(this.filtros)
      const params = paramsDe(this.filtros)
      const blob = await porteria.get('/admin/reportes/movimientos.xlsx', { params, responseType: 'blob', timeout: TIEMPO_EXCEL })
      guardarArchivo(blob, nombreReporte(params))
    },
    reemplazar(evento) {
      const i = this.items.findIndex((e) => e.id === evento.id)
      if (i >= 0) this.items.splice(i, 1, evento)
    }
  }
})
```

En `src/stores/auth.js`: importar `useConsultaStore` y en `logout` agregar `useConsultaStore().$reset()`.

`src/views/admin/AdminMovimientosView.vue`:

```vue
<script setup>
import { ref, onMounted } from 'vue'
import MarcoAdmin from '@/components/MarcoAdmin.vue'
import { useAuthStore } from '@/stores/auth'
import { useConsultaStore } from '@/stores/consulta'
import { useMotivosStore } from '@/stores/motivos'
import { useCarga } from '@/composables/carga'
import { fechaHora } from '@/utils/fechas'

const auth = useAuthStore()
const consulta = useConsultaStore()
const motivos = useMotivosStore()
const { cargando, error: errorBusqueda, ejecutar: buscar } = useCarga(() => consulta.buscar())
const error = ref('')
const descargando = ref(false)
const cargandoMas = ref(false)
const seleccionado = ref(null)
const TIPOS = [{ valor: 'PROPIO', texto: 'Propio' }, { valor: 'PROVEEDOR_ASISTENCIA', texto: 'Proveedor de asistencias' }, { valor: 'PROVEEDOR', texto: 'Proveedor' }]

onMounted(() => {
  auth.cargarSedes().catch(() => {})
  motivos.cargar().catch(() => {})
  buscar()
})

async function conError(accion, bandera) {
  error.value = ''
  bandera.value = true
  try {
    await accion()
  } catch (e) {
    error.value = e.message
  } finally {
    bandera.value = false
  }
}
const cargarMas = () => conError(() => consulta.cargarMas(), cargandoMas)
const descargar = () => conError(() => consulta.descargarExcel(), descargando)
function consultar() {
  error.value = ''
  buscar()
}
</script>

<template>
  <MarcoAdmin titulo="Movimientos">
    <div class="tarjeta grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
      <div>
        <label class="etiqueta" for="f-sede">Sede</label>
        <select id="f-sede" v-model="consulta.filtros.sede" class="campo" data-test="filtro-sede">
          <option value="todas">Todas</option>
          <option v-for="s in auth.sedes" :key="s.id" :value="String(s.id)">{{ s.nombre }}</option>
        </select>
      </div>
      <div>
        <label class="etiqueta" for="f-desde">Desde</label>
        <input id="f-desde" v-model="consulta.filtros.desde" type="date" class="campo" data-test="filtro-desde" />
      </div>
      <div>
        <label class="etiqueta" for="f-hasta">Hasta</label>
        <input id="f-hasta" v-model="consulta.filtros.hasta" type="date" class="campo" data-test="filtro-hasta" />
      </div>
      <div>
        <label class="etiqueta" for="f-placa">Placa</label>
        <input id="f-placa" v-model="consulta.filtros.placa" class="campo uppercase" maxlength="20" data-test="filtro-placa" />
      </div>
      <div>
        <label class="etiqueta" for="f-tipo">Tipo</label>
        <select id="f-tipo" v-model="consulta.filtros.tipo" class="campo" data-test="filtro-tipo">
          <option value="">Todos</option>
          <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.texto }}</option>
        </select>
      </div>
      <div>
        <label class="etiqueta" for="f-motivo">Motivo</label>
        <select id="f-motivo" v-model="consulta.filtros.motivoId" class="campo" data-test="filtro-motivo">
          <option value="">Todos</option>
          <option v-for="m in motivos.lista" :key="m.id" :value="String(m.id)">{{ m.nombre }}</option>
        </select>
      </div>
      <div>
        <label class="etiqueta" for="f-inc">Inconsistencias</label>
        <select id="f-inc" v-model="consulta.filtros.inconsistente" class="campo" data-test="filtro-inconsistente">
          <option value="">Todas</option>
          <option value="1">Solo inconsistentes</option>
          <option value="0">Sin inconsistencia</option>
        </select>
      </div>
      <div class="flex gap-2 items-end">
        <button type="button" class="btn-primario flex-1" :disabled="cargando" data-test="consulta-buscar" @click="consultar">{{ cargando ? 'Buscando…' : 'Buscar' }}</button>
        <button type="button" class="btn-secundario flex-1" :disabled="descargando" data-test="consulta-excel" @click="descargar">{{ descargando ? 'Generando…' : 'Excel' }}</button>
      </div>
    </div>

    <p v-if="errorBusqueda || error" class="aviso-error mb-3" role="alert" data-test="consulta-error">{{ error || errorBusqueda }}</p>
    <p v-if="consulta.aplicados" class="text-gray-600 mb-2">Mostrando <span data-test="consulta-total">{{ consulta.items.length }} de {{ consulta.total }}</span></p>
    <p v-if="consulta.aplicados && !consulta.items.length && !cargando" class="text-gray-600">Sin movimientos con esos filtros.</p>

    <ul class="space-y-2">
      <li v-for="e in consulta.items" :key="e.id">
        <button
          type="button" class="tarjeta w-full text-left space-y-1" :class="e.anulado ? 'opacity-60' : ''"
          data-test="consulta-fila" @click="seleccionado = e"
        >
          <span class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-bold">{{ fechaHora(e.registrado_at) }} · {{ e.sentido === 'INGRESO' ? 'Ingreso' : 'Salida' }} · <span class="tracking-wider">{{ e.placa }}</span></span>
            <span v-if="e.anulado" class="rounded-lg bg-gray-200 px-2 py-1 text-sm" data-test="consulta-anulado">Anulado</span>
            <span v-else-if="e.inconsistente" class="rounded-lg bg-amber-100 text-amber-900 px-2 py-1 text-sm" data-test="consulta-inconsistente">Inconsistente</span>
          </span>
          <span class="block text-gray-700">{{ auth.nombreSede(e.sede_id) }} · {{ e.motivo ? e.motivo.nombre : '' }} · {{ e.conductor_nombre }}</span>
        </button>
      </li>
    </ul>
    <button
      v-if="consulta.total > consulta.items.length" type="button" class="btn-secundario w-full mt-3"
      :disabled="cargandoMas" data-test="consulta-mas" @click="cargarMas"
    >{{ cargandoMas ? 'Cargando…' : 'Cargar más' }}</button>
  </MarcoAdmin>
</template>
```

(`seleccionado` lo usa la Task 9 para abrir el detalle.)

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test` y `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/fechas.js src/utils/__tests__/fechas.spec.js src/services/archivos.js src/stores/consulta.js src/stores/auth.js src/views/admin/AdminMovimientosView.vue src/stores/__tests__/consulta.spec.js src/views/__tests__/adminMovimientos.spec.js
git commit -m "feat: consulta de movimientos del admin con filtros, paginación y Excel"
```

---

### Task 9: Detalle del evento con corrección completa y anulación

**Files:**
- Create: `src/admin/correccion.js`, `src/components/DetalleEvento.vue`
- Modify: `src/views/admin/AdminMovimientosView.vue` (abre el detalle), `src/stores/consulta.js` (`corregir`, `anular`, `recargar`)
- Test: `src/admin/__tests__/correccion.spec.js`, `src/components/__tests__/detalleEvento.spec.js` (nuevos), `src/stores/__tests__/consulta.spec.js`

**Interfaces:**
- Consumes: `PATCH /eventos/:id`, `POST /eventos/:id/anular`, `GET /eventos/:id`; `catalogos.motivos(tipo, sentido)`, `catalogos.conductores()`, `catalogos.asistencias(q)`, `catalogos.exequias({ q, placa })`; `ListaBuscable`, `DialogoTexto`.
- Produces:
  - `formularioCorreccion(evento) → formulario`; `validarCorreccion(formulario, evento, motivo) → mensaje | null`; `cambiosCorreccion(formulario, evento, motivo) → cuerpo | null`.
  - Store `consulta`: `corregir(id, cambios) → evento`, `anular(id, motivo) → evento`, `recargar(id) → evento` (cada una reemplaza la fila).
  - `DetalleEvento` (prop `evento`; emite `cerrar`).

Reglas del servidor que replica `cambiosCorreccion` (diseño §7 y `detalleEvento.js`):
- Si cambia el motivo o la referencia se envían `motivo_id`, `asistencia_id`, `exequia_id` y `referencia_texto` (los que no aplican al tipo de referencia del motivo, en `null`).
- Si cambia cualquier dato del conductor se envía el conductor completo: propio de la lista (`conductor_otro: false`, `conductor_usuario`, `conductor_nombre`, `conductor_documento: null`, `empresa: null`), propio "otro" (`conductor_otro: true`, `conductor_usuario: null`, nombre, documento, `empresa: null`) o proveedor (`conductor_otro: false`, `conductor_usuario: null`, nombre, documento, empresa).
- `kilometraje` (solo propios) y `observaciones`: se envían si cambian (vacío → `null`).
- Un evento inconsistente necesita observación.

- [ ] **Step 1: Escribir las pruebas que fallan**

`src/admin/__tests__/correccion.spec.js`:

```js
import { test, expect } from 'vitest'
import { formularioCorreccion, validarCorreccion, cambiosCorreccion } from '@/admin/correccion'

const NINGUNA = { id: 6, tipo_referencia: 'NINGUNA', referencia_obligatoria: false }
const TEXTO = { id: 3, tipo_referencia: 'TEXTO', referencia_obligatoria: true }
const ASIST = { id: 1, tipo_referencia: 'ASISTENCIA', referencia_obligatoria: true }

const propio = {
  id: 10, tipo_vehiculo: 'PROPIO', sentido: 'SALIDA', placa: 'ABC123', motivo_id: 6, asistencia_id: null, exequia_id: null,
  referencia_texto: null, referencia: null, conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez', conductor_documento: null,
  conductor_otro: false, empresa: null, kilometraje: 1200, observaciones: null, inconsistente: false
}
const proveedor = {
  ...propio, id: 11, tipo_vehiculo: 'PROVEEDOR', motivo_id: 3, referencia_texto: 'Factura 1', conductor_usuario: null,
  conductor_nombre: 'Luis', conductor_documento: '1090', empresa: 'Flores', kilometraje: null
}

test('el formulario parte del evento', () => {
  expect(formularioCorreccion(propio)).toEqual({
    motivoId: 6, referencia: { asistenciaId: null, exequiaId: null, texto: '', etiqueta: '' },
    conductor: { modo: 'ad', usuario: 'jperez', nombre: 'Juan Pérez', documento: '' }, empresa: '', kilometraje: '1200', observaciones: ''
  })
  expect(formularioCorreccion(proveedor).conductor).toEqual({ modo: 'proveedor', usuario: null, nombre: 'Luis', documento: '1090' })
})

test('sin cambios no hay cuerpo', () => {
  expect(cambiosCorreccion(formularioCorreccion(propio), propio, NINGUNA)).toBeNull()
  expect(cambiosCorreccion(formularioCorreccion(proveedor), proveedor, TEXTO)).toBeNull()
})

test('kilometraje y observaciones viajan solos', () => {
  const f = { ...formularioCorreccion(propio), kilometraje: '', observaciones: ' Revisado ' }
  expect(cambiosCorreccion(f, propio, NINGUNA)).toEqual({ kilometraje: null, observaciones: 'Revisado' })
})

test('cambiar el motivo envía la referencia completa del nuevo motivo', () => {
  const f = { ...formularioCorreccion(propio), motivoId: 1, referencia: { asistenciaId: 77, exequiaId: null, texto: 'x', etiqueta: 'A-77' } }
  expect(cambiosCorreccion(f, propio, ASIST)).toEqual({ motivo_id: 1, asistencia_id: 77, exequia_id: null, referencia_texto: null })
})

test('cambiar el conductor envía el conductor completo', () => {
  const otro = { ...formularioCorreccion(propio), conductor: { modo: 'otro', usuario: null, nombre: 'Pedro', documento: '' } }
  expect(cambiosCorreccion(otro, propio, NINGUNA)).toEqual({
    conductor_otro: true, conductor_usuario: null, conductor_nombre: 'Pedro', conductor_documento: null, empresa: null
  })
  const empresa = { ...formularioCorreccion(proveedor), empresa: 'Flores SAS' }
  expect(cambiosCorreccion(empresa, proveedor, TEXTO)).toEqual({
    conductor_otro: false, conductor_usuario: null, conductor_nombre: 'Luis', conductor_documento: '1090', empresa: 'Flores SAS'
  })
})

test.each([
  [{ motivoId: null }, NINGUNA, 'Elige el motivo'],
  [{ motivoId: 1 }, ASIST, 'Selecciona la asistencia'],
  [{ conductor: { modo: 'ad', usuario: null, nombre: '', documento: '' } }, NINGUNA, 'Selecciona el conductor'],
  [{ conductor: { modo: 'otro', usuario: null, nombre: ' ', documento: '' } }, NINGUNA, 'Escribe el nombre del conductor'],
  [{ kilometraje: '12a' }, NINGUNA, 'Kilometraje inválido']
])('propio con %j → %s', (cambio, motivo, mensaje) => {
  expect(validarCorreccion({ ...formularioCorreccion(propio), ...cambio }, propio, motivo)).toBe(mensaje)
})

test('proveedor sin empresa o documento; forzado sin observación', () => {
  expect(validarCorreccion({ ...formularioCorreccion(proveedor), empresa: '' }, proveedor, TEXTO)).toBe('Escribe la empresa, el nombre y el documento del conductor')
  expect(validarCorreccion({ ...formularioCorreccion(proveedor), referencia: { asistenciaId: null, exequiaId: null, texto: '', etiqueta: '' } }, proveedor, TEXTO)).toBe('Escribe la referencia')
  const forzado = { ...propio, inconsistente: true, observaciones: 'x' }
  expect(validarCorreccion({ ...formularioCorreccion(forzado), observaciones: '' }, forzado, NINGUNA)).toBe('El registro forzado necesita una observación')
  expect(validarCorreccion(formularioCorreccion(propio), propio, NINGUNA)).toBeNull()
})
```

En `src/stores/__tests__/consulta.spec.js` (el mock de `porteria` pasa a `{ get: vi.fn(), post: vi.fn(), patch: vi.fn() }`):

```js
test('corregir, anular y recargar reemplazan la fila', async () => {
  const c = useConsultaStore()
  c.items = [{ id: 1, kilometraje: 1 }, { id: 2 }]
  porteria.patch.mockResolvedValue({ data: { id: 1, kilometraje: 5 } })
  porteria.post.mockResolvedValue({ data: { id: 2, anulado: true } })
  porteria.get.mockResolvedValue({ data: { id: 1, kilometraje: 6 } })
  await c.corregir(1, { kilometraje: 5 })
  expect(porteria.patch).toHaveBeenCalledWith('/eventos/1', { kilometraje: 5 })
  await c.anular(2, 'Duplicado')
  expect(porteria.post).toHaveBeenCalledWith('/eventos/2/anular', { motivo: 'Duplicado' })
  expect(await c.recargar(1)).toEqual({ id: 1, kilometraje: 6 })
  expect(porteria.get).toHaveBeenCalledWith('/eventos/1')
  expect(c.items).toEqual([{ id: 1, kilometraje: 6 }, { id: 2, anulado: true }])
})
```

`src/components/__tests__/detalleEvento.spec.js`:

```js
import { test, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api', () => ({ porteria: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, tokenStorage: { leer: () => 't', guardar: () => {} } }))
const toastExito = vi.hoisted(() => vi.fn())
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: toastExito, error: vi.fn() }) }))

import { porteria } from '@/services/api'
import { useConsultaStore } from '@/stores/consulta'
import DetalleEvento from '@/components/DetalleEvento.vue'

const MOTIVOS = [{ id: 6, nombre: 'Tanqueo', tipo_referencia: 'NINGUNA', referencia_obligatoria: false }, { id: 7, nombre: 'Lavado', tipo_referencia: 'NINGUNA', referencia_obligatoria: false }]
const evento = (cambios = {}) => ({
  id: 10, sede_id: 1, tipo_vehiculo: 'PROPIO', sentido: 'SALIDA', placa: 'ABC123', motivo_id: 6, motivo: { id: 6, nombre: 'Tanqueo' },
  asistencia_id: null, exequia_id: null, referencia_texto: null, referencia: null, conductor_usuario: 'jperez', conductor_nombre: 'Juan Pérez',
  conductor_documento: null, conductor_otro: false, empresa: null, kilometraje: 1200, observaciones: null, inconsistente: false,
  inconsistencia_tipo: null, registrado_at: new Date(2026, 9, 5, 8, 0).toISOString(), registrado_por: 'g1', corregido_por: null, anulado: false, ...cambios
})

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  setActivePinia(createPinia())
  vi.clearAllMocks()
  porteria.get.mockImplementation(async (url) => {
    if (url === '/catalogos/motivos') return { data: MOTIVOS }
    if (url === '/catalogos/conductores') return { data: [{ usuario: 'jperez', nombre: 'Juan Pérez' }, { usuario: 'mgomez', nombre: 'María Gómez' }] }
    if (url === '/eventos/10') return { data: evento({ kilometraje: 1300, corregido_por: 'otro' }) }
    return { data: [] }
  })
})
afterEach(() => vi.useRealTimers())

// El padre pasa la fila viva de la store, como AdminMovimientosView: recargar o anular cambian el prop.
const montar = (e = evento()) => {
  useConsultaStore().items = [e]
  return mount({
    components: { DetalleEvento },
    setup: () => ({ consulta: useConsultaStore() }),
    template: '<DetalleEvento :evento="consulta.items[0]" />'
  })
}

test('muestra los datos del evento', async () => {
  const w = montar(evento({ inconsistente: true, inconsistencia_tipo: 'SALIDA_OTRA_SEDE', observaciones: 'Salió por Sur' }))
  await flushPromises()
  const texto = w.text()
  expect(texto).toContain('ABC123')
  expect(texto).toContain('Tanqueo')
  expect(texto).toContain('Juan Pérez')
  expect(texto).toContain('Salida por otra sede')
  expect(texto).toContain('Salió por Sur')
})

test('corrige motivo y kilometraje', async () => {
  porteria.patch.mockResolvedValue({ data: evento({ motivo_id: 7, motivo: { id: 7, nombre: 'Lavado' }, kilometraje: 1250 }) })
  const w = montar()
  await flushPromises()
  await w.get('[data-test=detalle-corregir]').trigger('click')
  await flushPromises()
  await w.get('[data-test=correccion-motivo]').setValue('7')
  await w.get('[data-test=correccion-km]').setValue('1250')
  await w.get('[data-test=correccion-guardar]').trigger('click')
  await flushPromises()
  expect(porteria.patch).toHaveBeenCalledWith('/eventos/10', { motivo_id: 7, asistencia_id: null, exequia_id: null, referencia_texto: null, kilometraje: 1250 })
  expect(toastExito).toHaveBeenCalledWith('Registro de ABC123 corregido')
  expect(w.find('[data-test=correccion-guardar]').exists()).toBe(false)
  expect(useConsultaStore().items[0].kilometraje).toBe(1250)
})

test('cambia el conductor a otro de la lista', async () => {
  porteria.patch.mockResolvedValue({ data: evento({ conductor_usuario: 'mgomez', conductor_nombre: 'María Gómez' }) })
  const w = montar()
  await flushPromises()
  await w.get('[data-test=detalle-corregir]').trigger('click')
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
  const opcion = w.findAll('[data-test=buscable-item]').find((b) => b.text() === 'María Gómez')
  await opcion.trigger('click')
  await w.get('[data-test=correccion-guardar]').trigger('click')
  await flushPromises()
  expect(porteria.patch).toHaveBeenCalledWith('/eventos/10', {
    conductor_otro: false, conductor_usuario: 'mgomez', conductor_nombre: 'María Gómez', conductor_documento: null, empresa: null
  })
})

test('un 409 MODIFICADO recarga el evento y avisa', async () => {
  porteria.patch.mockRejectedValue({ status: 409, motivo: 'MODIFICADO', message: 'El registro cambió mientras lo editabas. Vuelve a abrirlo.' })
  const w = montar()
  await flushPromises()
  await w.get('[data-test=detalle-corregir]').trigger('click')
  await flushPromises()
  await w.get('[data-test=correccion-km]').setValue('1250')
  await w.get('[data-test=correccion-guardar]').trigger('click')
  await flushPromises()
  expect(w.get('[data-test=detalle-error]').text()).toBe('El registro cambió mientras lo editabas. Vuelve a abrirlo.')
  expect(porteria.get).toHaveBeenCalledWith('/eventos/10')
  expect(useConsultaStore().items[0].kilometraje).toBe(1300)
  expect(w.get('[data-test=correccion-km]').element.value).toBe('1300')
})

test('anular pide el motivo; un anulado no ofrece acciones', async () => {
  porteria.post.mockResolvedValue({ data: evento({ anulado: true, anulado_motivo: 'Duplicado' }) })
  const w = montar()
  await flushPromises()
  await w.get('[data-test=detalle-anular]').trigger('click')
  await w.get('[data-test=dialogo-texto]').setValue('Duplicado')
  await w.get('[data-test=dialogo-aceptar]').trigger('click')
  await flushPromises()
  expect(porteria.post).toHaveBeenCalledWith('/eventos/10/anular', { motivo: 'Duplicado' })
  expect(w.find('[data-test=detalle-anular]').exists()).toBe(false)
  expect(w.find('[data-test=detalle-corregir]').exists()).toBe(false)
  expect(w.text()).toContain('Duplicado')
})
```

En `src/views/__tests__/adminMovimientos.spec.js`:

```js
test('tocar una fila abre el detalle', async () => {
  const w = montar()
  await flushPromises()
  expect(w.find('detalle-evento-stub').exists()).toBe(false)
  await w.findAll('[data-test=consulta-fila]')[0].trigger('click')
  expect(w.find('detalle-evento-stub').exists()).toBe(true)
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL (faltan `correccion.js`, `DetalleEvento.vue` y las acciones de la store).

- [ ] **Step 3: Implementar**

`src/admin/correccion.js`:

```js
// Corrección completa de un evento por el admin, sin Vue. El servidor vuelve a validar todo; esto evita
// enviar cuerpos que sabe que va a rechazar y arma el conductor y la referencia como los espera.
const texto = (v) => {
  const t = String(v ?? '').trim()
  return t === '' ? null : t
}
const etiquetaReferencia = (r) => (r ? [r.codigo, r.nombre_ser_querido].filter(Boolean).join(' · ') : '')

export function formularioCorreccion(e) {
  const propio = e.tipo_vehiculo === 'PROPIO'
  return {
    motivoId: e.motivo_id,
    referencia: { asistenciaId: e.asistencia_id ?? null, exequiaId: e.exequia_id ?? null, texto: e.referencia_texto || '', etiqueta: etiquetaReferencia(e.referencia) },
    conductor: {
      modo: propio ? (e.conductor_otro ? 'otro' : 'ad') : 'proveedor',
      usuario: propio && !e.conductor_otro ? e.conductor_usuario : null,
      nombre: e.conductor_nombre || '',
      documento: e.conductor_documento || ''
    },
    empresa: e.empresa || '',
    kilometraje: e.kilometraje === null || e.kilometraje === undefined ? '' : String(e.kilometraje),
    observaciones: e.observaciones || ''
  }
}

function conductorDe(f, e) {
  const c = f.conductor
  if (e.tipo_vehiculo !== 'PROPIO') {
    return { conductor_otro: false, conductor_usuario: null, conductor_nombre: texto(c.nombre), conductor_documento: texto(c.documento), empresa: texto(f.empresa) }
  }
  if (c.modo === 'otro') {
    return { conductor_otro: true, conductor_usuario: null, conductor_nombre: texto(c.nombre), conductor_documento: texto(c.documento), empresa: null }
  }
  return { conductor_otro: false, conductor_usuario: c.usuario, conductor_nombre: texto(c.nombre), conductor_documento: null, empresa: null }
}

const conductorActual = (e) => ({
  conductor_otro: Boolean(e.conductor_otro),
  conductor_usuario: e.conductor_usuario ?? null,
  conductor_nombre: e.conductor_nombre ?? null,
  conductor_documento: e.conductor_documento ?? null,
  empresa: e.empresa ?? null
})

export function validarCorreccion(f, e, motivo) {
  if (!f.motivoId || !motivo) return 'Elige el motivo'
  const r = f.referencia
  if (motivo.referencia_obligatoria) {
    if (motivo.tipo_referencia === 'ASISTENCIA' && !r.asistenciaId) return 'Selecciona la asistencia'
    if (motivo.tipo_referencia === 'EXEQUIA' && !r.exequiaId) return 'Selecciona la exequia'
    if (motivo.tipo_referencia === 'TEXTO' && !texto(r.texto)) return 'Escribe la referencia'
  }
  const c = f.conductor
  if (e.tipo_vehiculo !== 'PROPIO') {
    if (!texto(f.empresa) || !texto(c.nombre) || !texto(c.documento)) return 'Escribe la empresa, el nombre y el documento del conductor'
  } else if (c.modo === 'otro') {
    if (!texto(c.nombre)) return 'Escribe el nombre del conductor'
  } else if (!c.usuario) {
    return 'Selecciona el conductor'
  }
  if (f.kilometraje.trim() !== '' && !(/^\d{1,7}$/.test(f.kilometraje.trim()) && Number(f.kilometraje) <= 5000000)) return 'Kilometraje inválido'
  if (e.inconsistente && !texto(f.observaciones)) return 'El registro forzado necesita una observación'
  return null
}

export function cambiosCorreccion(f, e, motivo) {
  const cambios = {}
  const r = f.referencia
  const tipoRef = motivo ? motivo.tipo_referencia : 'NINGUNA'
  const referencia = {
    motivo_id: f.motivoId,
    asistencia_id: tipoRef === 'ASISTENCIA' ? r.asistenciaId : null,
    exequia_id: tipoRef === 'EXEQUIA' ? r.exequiaId : null,
    referencia_texto: tipoRef === 'TEXTO' ? texto(r.texto) : null
  }
  const refActual = {
    motivo_id: e.motivo_id,
    asistencia_id: tipoRef === 'ASISTENCIA' ? e.asistencia_id ?? null : null,
    exequia_id: tipoRef === 'EXEQUIA' ? e.exequia_id ?? null : null,
    referencia_texto: tipoRef === 'TEXTO' ? e.referencia_texto ?? null : null
  }
  if (JSON.stringify(referencia) !== JSON.stringify(refActual)) Object.assign(cambios, referencia)

  const conductor = conductorDe(f, e)
  if (JSON.stringify(conductor) !== JSON.stringify(conductorActual(e))) Object.assign(cambios, conductor)

  if (e.tipo_vehiculo === 'PROPIO') {
    const km = f.kilometraje.trim() === '' ? null : Number(f.kilometraje)
    if (km !== (e.kilometraje ?? null)) cambios.kilometraje = km
  }
  const obs = texto(f.observaciones)
  if (obs !== (e.observaciones ?? null)) cambios.observaciones = obs
  return Object.keys(cambios).length ? cambios : null
}
```

En `src/stores/consulta.js`, dentro de `actions`:

```js
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
    async recargar(id) {
      const { data } = await porteria.get(`/eventos/${id}`)
      this.reemplazar(data)
      return data
    },
```

`src/components/DetalleEvento.vue`:

```vue
<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useToast } from 'vue-toastification'
import ListaBuscable from '@/components/ListaBuscable.vue'
import DialogoTexto from '@/components/DialogoTexto.vue'
import { useAuthStore } from '@/stores/auth'
import { useCatalogosStore } from '@/stores/catalogos'
import { useConsultaStore } from '@/stores/consulta'
import { fechaHora } from '@/utils/fechas'
import { formularioCorreccion, validarCorreccion, cambiosCorreccion } from '@/admin/correccion'

const props = defineProps({ evento: { type: Object, required: true } })
const emit = defineEmits(['cerrar'])

const auth = useAuthStore()
const catalogos = useCatalogosStore()
const consulta = useConsultaStore()
const toast = useToast()
const editando = ref(false)
const anulando = ref(false)
const guardando = ref(false)
const error = ref('')
const motivos = ref([])
const f = reactive(formularioCorreccion(props.evento))
const esPropio = computed(() => props.evento.tipo_vehiculo === 'PROPIO')
const motivo = computed(() => motivos.value.find((m) => m.id === f.motivoId) || null)
const TIPO = { PROPIO: 'Propio', PROVEEDOR_ASISTENCIA: 'Proveedor de asistencias', PROVEEDOR: 'Proveedor' }
const INCONSISTENCIA = { INGRESO_ESTANDO_DENTRO: 'Ingreso estando dentro', SALIDA_ESTANDO_FUERA: 'Salida estando fuera', SALIDA_OTRA_SEDE: 'Salida por otra sede' }

// Si el evento cambia (otra fila, o el servidor devolvió una versión nueva), el formulario parte de él.
watch(() => props.evento, (e) => Object.assign(f, formularioCorreccion(e)))

async function abrirCorreccion() {
  error.value = ''
  editando.value = true
  try {
    const lista = await catalogos.motivos(props.evento.tipo_vehiculo, props.evento.sentido)
    // El motivo actual puede estar inactivo: se ofrece igual para no perderlo.
    const actual = props.evento.motivo
    motivos.value = lista.some((m) => m.id === props.evento.motivo_id) || !actual
      ? lista
      : [{ id: props.evento.motivo_id, nombre: `${actual.nombre} (inactivo)`, tipo_referencia: 'NINGUNA', referencia_obligatoria: false }, ...lista]
  } catch (e) {
    error.value = e.message
  }
}

function elegirMotivo(id) {
  f.motivoId = Number(id)
  f.referencia = { asistenciaId: null, exequiaId: null, texto: '', etiqueta: '' }
}

const buscarConductor = async (q) => {
  const lista = await catalogos.conductores()
  const t = q.toLowerCase()
  const tiene = (x) => String(x ?? '').toLowerCase().includes(t)
  return t ? lista.filter((c) => tiene(c.nombre) || tiene(c.usuario)) : lista
}
const buscarAsistencia = (q) => catalogos.asistencias(q || undefined)
const buscarExequia = (q) => catalogos.exequias({ q: q || undefined, placa: props.evento.placa })

function cancelarCorreccion() {
  editando.value = false
  error.value = ''
  Object.assign(f, formularioCorreccion(props.evento))
}

async function guardar() {
  error.value = validarCorreccion(f, props.evento, motivo.value) || ''
  if (error.value) return
  const cambios = cambiosCorreccion(f, props.evento, motivo.value)
  if (!cambios) {
    editando.value = false
    return
  }
  guardando.value = true
  try {
    await consulta.corregir(props.evento.id, cambios)
    toast.success(`Registro de ${props.evento.placa} corregido`)
    editando.value = false
  } catch (e) {
    error.value = e.message
    // Otro cambio se guardó antes: se trae la versión actual para no pisarla.
    if (e.status === 409 || e.motivo === 'SIN_CONEXION') await consulta.recargar(props.evento.id).catch(() => {})
  } finally {
    guardando.value = false
  }
}

async function anular(motivoAnulacion) {
  anulando.value = false
  error.value = ''
  guardando.value = true
  try {
    await consulta.anular(props.evento.id, motivoAnulacion)
    toast.success(`Registro de ${props.evento.placa} anulado`)
  } catch (e) {
    error.value = e.message
    if (e.status === 409 || e.motivo === 'SIN_CONEXION') await consulta.recargar(props.evento.id).catch(() => {})
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" data-test="detalle-evento">
    <div class="tarjeta w-full max-w-2xl space-y-3 max-h-[90vh] overflow-y-auto">
      <div class="flex items-start justify-between gap-2">
        <p class="text-xl font-bold">
          {{ evento.sentido === 'INGRESO' ? 'Ingreso' : 'Salida' }} · <span class="tracking-wider">{{ evento.placa }}</span>
        </p>
        <button type="button" class="btn-secundario" data-test="detalle-cerrar" @click="emit('cerrar')">Cerrar</button>
      </div>
      <dl class="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
        <dt class="font-semibold">Fecha</dt><dd>{{ fechaHora(evento.registrado_at) }}</dd>
        <dt class="font-semibold">Sede</dt><dd>{{ auth.nombreSede(evento.sede_id) }}</dd>
        <dt class="font-semibold">Tipo</dt><dd>{{ TIPO[evento.tipo_vehiculo] || evento.tipo_vehiculo }}</dd>
        <dt class="font-semibold">Motivo</dt><dd>{{ evento.motivo ? evento.motivo.nombre : '' }}</dd>
        <template v-if="evento.referencia || evento.referencia_texto">
          <dt class="font-semibold">Referencia</dt>
          <dd>{{ evento.referencia ? [evento.referencia.codigo, evento.referencia.nombre_ser_querido].filter(Boolean).join(' · ') : evento.referencia_texto }}</dd>
        </template>
        <dt class="font-semibold">Conductor</dt><dd>{{ evento.conductor_nombre }}{{ evento.conductor_otro ? ' (otro)' : '' }}{{ evento.conductor_documento ? ` · ${evento.conductor_documento}` : '' }}</dd>
        <template v-if="evento.empresa"><dt class="font-semibold">Empresa</dt><dd>{{ evento.empresa }}</dd></template>
        <template v-if="evento.kilometraje !== null && evento.kilometraje !== undefined"><dt class="font-semibold">Kilometraje</dt><dd>{{ evento.kilometraje }}</dd></template>
        <template v-if="evento.inconsistente"><dt class="font-semibold">Inconsistencia</dt><dd>{{ INCONSISTENCIA[evento.inconsistencia_tipo] || 'Sí' }}</dd></template>
        <template v-if="evento.observaciones"><dt class="font-semibold">Observaciones</dt><dd>{{ evento.observaciones }}</dd></template>
        <dt class="font-semibold">Registró</dt><dd>{{ evento.registrado_por }}</dd>
        <template v-if="evento.corregido_por"><dt class="font-semibold">Corrigió</dt><dd>{{ evento.corregido_por }} · {{ fechaHora(evento.corregido_at) }}</dd></template>
        <template v-if="evento.anulado"><dt class="font-semibold">Anulado</dt><dd>{{ evento.anulado_por }} · {{ evento.anulado_motivo }}</dd></template>
      </dl>

      <p v-if="error" class="aviso-error" role="alert" data-test="detalle-error">{{ error }}</p>

      <div v-if="!evento.anulado && !editando" class="grid grid-cols-2 gap-3">
        <button type="button" class="btn-secundario" :disabled="guardando" data-test="detalle-corregir" @click="abrirCorreccion">Corregir</button>
        <button type="button" class="btn-peligro" :disabled="guardando" data-test="detalle-anular" @click="anulando = true">Anular</button>
      </div>

      <section v-if="editando && !evento.anulado" class="space-y-3 border-t pt-3" data-test="detalle-correccion">
        <div>
          <label class="etiqueta" for="c-motivo">Motivo</label>
          <select id="c-motivo" :value="String(f.motivoId)" class="campo" data-test="correccion-motivo" @change="elegirMotivo($event.target.value)">
            <option v-for="m in motivos" :key="m.id" :value="String(m.id)">{{ m.nombre }}</option>
          </select>
        </div>
        <template v-if="motivo && motivo.tipo_referencia === 'ASISTENCIA'">
          <p v-if="f.referencia.etiqueta" class="text-gray-700">Elegida: {{ f.referencia.etiqueta }}</p>
          <ListaBuscable
            :buscar="buscarAsistencia" :etiqueta="(a) => `${a.codigo} · ${a.nombre_ser_querido}`" :clave="(a) => a.id"
            :seleccionado="f.referencia.asistenciaId" placeholder="Asistencia"
            @elegir="(a) => (f.referencia = { asistenciaId: a.id, exequiaId: null, texto: '', etiqueta: `${a.codigo} · ${a.nombre_ser_querido}` })"
          />
        </template>
        <template v-else-if="motivo && motivo.tipo_referencia === 'EXEQUIA'">
          <p v-if="f.referencia.etiqueta" class="text-gray-700">Elegida: {{ f.referencia.etiqueta }}</p>
          <ListaBuscable
            :buscar="buscarExequia" :etiqueta="(x) => `${x.asistencia_codigo} · ${x.nombre_ser_querido} · ${x.fecha}`" :clave="(x) => x.id"
            :seleccionado="f.referencia.exequiaId" placeholder="Exequia"
            @elegir="(x) => (f.referencia = { asistenciaId: null, exequiaId: x.id, texto: '', etiqueta: `${x.asistencia_codigo} · ${x.nombre_ser_querido}` })"
          />
        </template>
        <div v-else-if="motivo && motivo.tipo_referencia === 'TEXTO'">
          <label class="etiqueta" for="c-ref">Referencia</label>
          <input id="c-ref" v-model="f.referencia.texto" class="campo" maxlength="255" data-test="correccion-referencia" />
        </div>

        <template v-if="esPropio">
          <p class="etiqueta">Conductor</p>
          <template v-if="f.conductor.modo === 'ad'">
            <ListaBuscable
              :buscar="buscarConductor" :etiqueta="(c) => c.nombre" :clave="(c) => c.usuario" :seleccionado="f.conductor.usuario"
              placeholder="Buscar conductor" inmediata
              @elegir="(c) => (f.conductor = { modo: 'ad', usuario: c.usuario, nombre: c.nombre, documento: '' })"
            />
            <button type="button" class="btn-secundario w-full" data-test="correccion-conductor-otro" @click="f.conductor = { modo: 'otro', usuario: null, nombre: '', documento: '' }">Otro (no está en la lista)</button>
          </template>
          <template v-else>
            <input v-model="f.conductor.nombre" class="campo" maxlength="150" placeholder="Nombre del conductor" data-test="correccion-conductor-nombre" />
            <input v-model="f.conductor.documento" class="campo" maxlength="30" placeholder="Documento (opcional)" data-test="correccion-conductor-documento" />
            <button type="button" class="btn-secundario w-full" @click="f.conductor = { modo: 'ad', usuario: null, nombre: '', documento: '' }">Elegir de la lista</button>
          </template>
          <div>
            <label class="etiqueta" for="c-km">Kilometraje</label>
            <input id="c-km" v-model="f.kilometraje" class="campo" inputmode="numeric" data-test="correccion-km" />
          </div>
        </template>
        <template v-else>
          <div><label class="etiqueta" for="c-empresa">Empresa</label><input id="c-empresa" v-model="f.empresa" class="campo" maxlength="150" data-test="correccion-empresa" /></div>
          <div><label class="etiqueta" for="c-cnombre">Nombre del conductor</label><input id="c-cnombre" v-model="f.conductor.nombre" class="campo" maxlength="150" data-test="correccion-conductor-nombre" /></div>
          <div><label class="etiqueta" for="c-cdoc">Documento del conductor</label><input id="c-cdoc" v-model="f.conductor.documento" class="campo" maxlength="30" data-test="correccion-conductor-documento" /></div>
        </template>
        <div>
          <label class="etiqueta" for="c-obs">Observaciones</label>
          <textarea id="c-obs" v-model="f.observaciones" rows="3" class="campo py-2" maxlength="500" data-test="correccion-observaciones" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="btn-secundario" :disabled="guardando" data-test="correccion-cancelar" @click="cancelarCorreccion">Cancelar</button>
          <button type="button" class="btn-primario" :disabled="guardando" data-test="correccion-guardar" @click="guardar">{{ guardando ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </section>
    </div>
    <DialogoTexto
      v-if="anulando" :titulo="`Anular registro de ${evento.placa}`" etiqueta="Motivo de la anulación"
      @aceptar="anular" @cancelar="anulando = false"
    />
  </div>
</template>
```

`consulta.recargar` y `consulta.anular` reemplazan la fila en la store; `AdminMovimientosView` pasa al detalle esa fila viva (ver abajo) y el `watch` del prop rehace el formulario.

En `src/views/admin/AdminMovimientosView.vue`:
- Import: `import DetalleEvento from '@/components/DetalleEvento.vue'` y `computed` en el import de `vue`.
- Script: `seleccionado` guarda solo el id: `const seleccionadoId = ref(null)` y `const seleccionado = computed(() => consulta.items.find((e) => e.id === seleccionadoId.value) || null)` (borrar el `ref` anterior).
- Template: en el botón de la fila `@click="seleccionadoId = e.id"`, y antes de `</MarcoAdmin>`:

```html
    <DetalleEvento v-if="seleccionado" :evento="seleccionado" @cerrar="seleccionadoId = null" />
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test` y `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/admin/correccion.js src/admin/__tests__/correccion.spec.js src/components/DetalleEvento.vue src/components/__tests__/detalleEvento.spec.js src/stores/consulta.js src/stores/__tests__/consulta.spec.js src/views/admin/AdminMovimientosView.vue src/views/__tests__/adminMovimientos.spec.js
git commit -m "feat: detalle del movimiento con corrección completa y anulación (admin)"
```

---

### Task 10: Rutas del admin y navegación

**Files:**
- Modify: `src/router/index.js`, `src/stores/auth.js` (`rutaInicio`), `src/components/MarcoGuarda.vue`, `src/views/SedeView.vue`
- Test: `src/router/__tests__/guardia.spec.js`, `src/stores/__tests__/auth.spec.js`, `src/components/__tests__/marcoGuarda.spec.js`, `src/views/__tests__/sede.spec.js`

**Interfaces:**
- Consumes: las tres vistas de `src/views/admin/`.
- Produces: rutas `/admin` (redirige a `/admin/movimientos`), `/admin/movimientos`, `/admin/motivos`, `/admin/proveedores` con `meta.requiereAdmin`; un no admin va a su `rutaInicio`. El admin sin sede inicia en `/admin`. Enlace "Administración" en el marco del guarda y en la elección de sede, solo para el admin.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `src/router/__tests__/guardia.spec.js`:
- 'rutas definidas' espera `['/', '/login', '/sin-conexion', '/sede', '/inicio', '/registrar/:sentido?', '/vehiculos', '/movimientos', '/admin', '/admin/movimientos', '/admin/motivos', '/admin/proveedores']`.
- Agregar:

```js
test('las rutas del admin exigen el rol', () => {
  const admin = ruta('/admin/motivos', { requiereAdmin: true })
  expect(decidirNavegacion(admin, auth({ esAdmin: false }))).toEqual({ path: '/inicio' })
  expect(decidirNavegacion(admin, auth({ esAdmin: true, sede: null }))).toBe(true)
  expect(decidirNavegacion(admin, { token: null })).toEqual({ path: '/login', query: { redirect: '/admin/motivos' } })
})
```

En `src/stores/__tests__/auth.spec.js`:

```js
test('el admin sin sede empieza en la administración', () => {
  const auth = useAuthStore()
  auth.usuario = { usuario: 'a', rol: 'admin_porteria', sede: null }
  expect(auth.rutaInicio).toBe('/admin')
  auth.usuario = { usuario: 'a', rol: 'admin_porteria', sede: { id: 1 } }
  expect(auth.rutaInicio).toBe('/inicio')
})
```

En `src/components/__tests__/marcoGuarda.spec.js` (la función `montar` agrega `{ path: '/admin', component: vacia }` a sus rutas):

```js
test('el enlace a la administración solo aparece para el admin', async () => {
  const { w } = await montar()
  expect(w.find('[data-test=marco-admin]').exists()).toBe(false)
  useAuthStore().usuario = { ...useAuthStore().usuario, rol: 'admin_porteria' }
  await w.vm.$nextTick()
  expect(w.get('[data-test=marco-admin]').attributes('href')).toBe('/admin')
})
```

(Si el `beforeEach` de ese archivo no fija un `usuario` guarda, fijarlo al inicio de la prueba: `useAuthStore().usuario = { usuario: 'g', nombre: 'G', rol: 'guarda', sede: { id: 1, nombre: 'Norte' } }`.)

En `src/views/__tests__/sede.spec.js`:

```js
test('el admin puede ir a la administración sin elegir sede', async () => {
  porteria.get.mockResolvedValue({ data: [] })
  useAuthStore().usuario = { usuario: 'a', nombre: 'A', rol: 'admin_porteria', sede: null }
  const vacia = { template: '<div />' }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/sede', component: SedeView }, { path: '/admin', component: vacia }] })
  router.push('/sede')
  await router.isReady()
  const w = mount(SedeView, { global: { plugins: [router] } })
  await flushPromises()
  expect(w.get('[data-test=sede-admin]').attributes('href')).toBe('/admin')
})
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`src/router/index.js`, al final de `routes`:

```js
  { path: '/admin', redirect: '/admin/movimientos' },
  { path: '/admin/movimientos', component: () => import('@/views/admin/AdminMovimientosView.vue'), meta: { requiereAdmin: true } },
  { path: '/admin/motivos', component: () => import('@/views/admin/AdminMotivosView.vue'), meta: { requiereAdmin: true } },
  { path: '/admin/proveedores', component: () => import('@/views/admin/AdminProveedoresView.vue'), meta: { requiereAdmin: true } }
```

y en `decidirNavegacion`, después del chequeo de token:

```js
  if (meta.requiereAdmin && !auth.esAdmin) return { path: auth.rutaInicio }
```

`src/stores/auth.js`, getter:

```js
    // El guarda empieza eligiendo sede; el admin sin sede, en la administración.
    rutaInicio: (s) => {
      if (s.usuario && s.usuario.sede) return '/inicio'
      return s.usuario && s.usuario.rol === 'admin_porteria' ? '/admin' : '/sede'
    }
```

`MarcoGuarda.vue`, dentro de `<nav>` al final:

```html
        <RouterLink v-if="auth.esAdmin" to="/admin" class="btn bg-primary-800 text-white text-base" data-test="marco-admin">Administración</RouterLink>
```

`SedeView.vue`: `import { RouterLink } from 'vue-router'` (junto a `useRoute, useRouter`) y antes del botón Salir:

```html
    <RouterLink v-if="auth.esAdmin" to="/admin" class="btn-secundario w-full" data-test="sede-admin">Ir a la administración</RouterLink>
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test` y `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/router/index.js src/stores/auth.js src/components/MarcoGuarda.vue src/views/SedeView.vue src/router/__tests__/guardia.spec.js src/stores/__tests__/auth.spec.js src/components/__tests__/marcoGuarda.spec.js src/views/__tests__/sede.spec.js
git commit -m "feat: rutas y navegación de la administración"
```

---

## Verificación final

- `npm test` y `npm run build` en verde; `grep -rn "window.confirm" src` vacío.
- Prueba en el navegador con `porteria-front` (`.claude/launch.json`) contra el backend local con la Fase 4a: login de admin sin sede → `/admin/movimientos`; filtros con "Todas"; Excel descargado y abierto; detalle → corregir km → anular; motivos: crear, inactivar, intentar borrar uno con registros (409); proveedores: buscar, inactivar, reactivar; como guarda, `/admin/motivos` redirige a `/inicio`. Si no hay backend local con AD, probar con la API simulada en las pruebas y dejar la prueba manual para el piloto (Fase 5).
- `git log --oneline` muestra los 10 commits en `feature/admin`; `git status` limpio. Sin push.
