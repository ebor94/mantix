/**
 * Fase 1 — Test de equivalencia: la matriz en DB debe reproducir EXACTAMENTE
 * el comportamiento que hoy tiene el código.
 *
 * No reutiliza el parser de extraer.js a propósito: monta los routers reales
 * de Express con requireRol instrumentado, de modo que la fuente de verdad es
 * el código tal como se ejecuta en producción, no una lectura del texto.
 *
 * Salida: 0 si la matriz es idéntica, 1 si hay cualquier diferencia.
 *
 * Uso:  node src/scripts/h360_permisos/verificar.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') })
const Module = require('module')
const path   = require('path')
const fs     = require('fs')

const BASE  = path.join(__dirname, '../../h360')
const ROLES = ['asesor', 'asistente', 'tanatologo', 'asistente_tanatologo',
               'supervisora', 'coordinador', 'contabilidad', 'recepcion', 'admin']

// ── Instrumentar requireRol antes de cargar los routers ─────────────────────
const authPath = require.resolve(path.join(BASE, 'middleware/auth.js'))
const realLoad = Module._load
Module._load = function (req, parent) {
  const resolved = (() => { try { return Module._resolveFilename(req, parent) } catch { return null } })()
  if (resolved === authPath) {
    return {
      verifyToken: (_q, _s, n) => n && n(),
      requireRol: (...roles) => { const mw = (_q, _s, n) => n && n(); mw.__roles = roles; return mw },
    }
  }
  return realLoad.apply(this, arguments)
}

const db = require('../../h360/config/db')

const MODULO = {
  'asistencias.routes.js':          'asistencias',
  'exequias.routes.js':             'exequias',
  'vehiculos.routes.js':            'vehiculos',
  'homenajes_sala.routes.js':       'salas_velacion',
  'homenajes_residencia.routes.js': 'residencia',
  'novedades_externas.routes.js':   'novedades',
  'gestion_servicios.routes.js':    'gestion_servicios',
  'cofres.routes.js':               'cofres',
  'salas.routes.js':                'salas_catalogo',
  'sedes.routes.js':                'sedes',
}

function derivarAccion(metodo, ruta) {
  const segs = ruta.replace(/:\w+/g, '').split('/').filter(Boolean)
  if (segs.length) return segs.join('_').replace(/-/g, '_')
  return { get: 'ver', post: 'crear', patch: 'editar', put: 'editar', delete: 'eliminar' }[metodo]
}

const esperado = new Map()
const add = (clave, roles) => {
  if (!esperado.has(clave)) esperado.set(clave, new Set())
  roles.forEach(r => esperado.get(clave).add(r))
}

// ── Recorrer el stack real de Express ───────────────────────────────────────
let nEndpoints = 0
for (const [archivo, modulo] of Object.entries(MODULO)) {
  const full = path.join(BASE, 'routes', archivo)
  if (!fs.existsSync(full)) continue
  for (const layer of require(full).stack) {
    if (!layer.route) continue
    nEndpoints++
    const ruta     = layer.route.path
    const metodo   = Object.keys(layer.route.methods)[0]
    const rolLayer = layer.route.stack.find(s => s.handle && s.handle.__roles)
    const roles    = rolLayer ? rolLayer.handle.__roles : [...ROLES]
    const accion   = derivarAccion(metodo, ruta)
    add(`${accion === 'ver' ? 'ruta' : 'accion'}.${modulo}.${accion}`, roles)
  }
}

// ── Matrices del controller ─────────────────────────────────────────────────
const ctrl = fs.readFileSync(path.join(BASE, 'controllers/asistencias.controller.js'), 'utf8')
function bloque(nombre) {
  const i = ctrl.indexOf(`const ${nombre} = {`)
  if (i < 0) return null
  let d = 0, j = ctrl.indexOf('{', i)
  for (let k = j; k < ctrl.length; k++) {
    if (ctrl[k] === '{') d++
    if (ctrl[k] === '}' && --d === 0) return ctrl.slice(j, k + 1)
  }
  return null
}
for (const [rol, es] of Object.entries(eval('(' + bloque('ETAPAS_POR_ROL') + ')')))
  es.forEach(e => add(`etapa.${e}.editar`, [rol]))
for (const [rol, pe] of Object.entries(eval('(' + bloque('ETAPAS_PARA_CERRAR') + ')')))
  Object.keys(pe).forEach(s => add(`estado.${s}.cerrar`, [rol]))
for (const [st, cfg] of Object.entries(eval('(' + bloque('TRANSICIONES') + ')')))
  add(`estado.${st}.avanzar`, cfg.roles)

// ── Comparar contra DB ──────────────────────────────────────────────────────
;(async () => {
  const [rows] = await db.query(
    `SELECT p.clave, r.codigo FROM h360_rol_permisos rp
       JOIN h360_permisos p ON p.id = rp.permiso_id
       JOIN h360_roles    r ON r.id = rp.rol_id`)

  const enDB = new Map()
  rows.forEach(r => {
    if (!enDB.has(r.clave)) enDB.set(r.clave, new Set())
    enDB.get(r.clave).add(r.codigo)
  })

  const claves = new Set([...esperado.keys(), ...enDB.keys()])
  let celdas = 0
  const difs = []
  for (const clave of [...claves].sort())
    for (const rol of ROLES) {
      celdas++
      const enCodigo = esperado.get(clave)?.has(rol) || false
      const enBase   = enDB.get(clave)?.has(rol)     || false
      if (enCodigo !== enBase) difs.push(`${clave} / ${rol}: codigo=${enCodigo} db=${enBase}`)
    }

  console.log(`Endpoints Express montados : ${nEndpoints}`)
  console.log(`Claves de permiso          : ${claves.size}`)
  console.log(`Celdas comparadas          : ${celdas}`)
  console.log(`Diferencias                : ${difs.length}`)
  if (difs.length) {
    console.log('\nDETALLE:')
    difs.slice(0, 40).forEach(d => console.log('  ✗', d))
    if (difs.length > 40) console.log(`  … y ${difs.length - 40} más`)
  }
  console.log(`\n${difs.length === 0
    ? 'IDÉNTICO — el seed reproduce el comportamiento actual'
    : 'FALLA — no continuar a fase 2 hasta resolver'}`)

  await db.end()
  process.exit(difs.length ? 1 : 0)
})().catch(e => { console.error('ERR', e.message); process.exit(1) })
