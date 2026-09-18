/**
 * Fase 1 — Extractor del catálogo de permisos.
 *
 * Lee la matriz de permisos que hoy vive hardcodeada en el código
 * (requireRol de los routes + ETAPAS_POR_ROL / ETAPAS_PARA_CERRAR /
 * TRANSICIONES del controller) y genera catalogo.json, que es la
 * entrada del seed.
 *
 * Uso:  node src/scripts/h360_permisos/extraer.js
 */
const fs   = require('fs')
const path = require('path')

const BASE = path.join(__dirname, '../../h360')

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

const ROLES = ['asesor', 'asistente', 'tanatologo', 'asistente_tanatologo',
               'supervisora', 'coordinador', 'contabilidad', 'recepcion', 'admin']

function derivarAccion(metodo, ruta) {
  const segs = ruta.replace(/:\w+/g, '').split('/').filter(Boolean)
  if (segs.length) return segs.join('_').replace(/-/g, '_')
  return { get: 'ver', post: 'crear', patch: 'editar', put: 'editar', delete: 'eliminar' }[metodo]
}

const porClave = new Map()
const add = (clave, modulo, roles) => {
  if (!porClave.has(clave)) porClave.set(clave, { clave, modulo, roles: new Set() })
  roles.forEach(r => porClave.get(clave).roles.add(r))
}

// ── Permisos de ruta/acción desde los routes ────────────────────────────────
for (const [archivo, modulo] of Object.entries(MODULO)) {
  const full = path.join(BASE, 'routes', archivo)
  if (!fs.existsSync(full)) continue
  const src = fs.readFileSync(full, 'utf8')

  // Constantes locales tipo: const ROLES_CAMPO = ['a','b']
  const consts = {}
  for (const c of src.matchAll(/const\s+(ROLES_\w+)\s*=\s*\[([^\]]*)\]/g))
    consts[c[1]] = c[2].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean)

  const re = /router\s*\.\s*(get|post|patch|put|delete)\s*\(\s*'([^']+)'\s*,\s*(?:requireRol\(([^)]*)\)\s*,\s*)?/g
  for (const m of src.matchAll(re)) {
    const [, metodo, ruta, rolesRaw] = m
    const roles = !rolesRaw
      ? [...ROLES]                                   // sin requireRol = cualquier autenticado
      : rolesRaw.split(',').flatMap(s => {
          s = s.trim()
          return s.startsWith('...') ? (consts[s.slice(3)] || []) : [s.replace(/^'|'$/g, '')]
        }).filter(Boolean)

    const accion = derivarAccion(metodo, ruta)
    add(`${accion === 'ver' ? 'ruta' : 'accion'}.${modulo}.${accion}`, modulo, roles)
  }
}

// ── Permisos de etapa/estado desde asistencias.controller.js ────────────────
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

const ETAPAS_POR_ROL     = eval('(' + bloque('ETAPAS_POR_ROL') + ')')
const ETAPAS_PARA_CERRAR = eval('(' + bloque('ETAPAS_PARA_CERRAR') + ')')
const TRANSICIONES       = eval('(' + bloque('TRANSICIONES') + ')')

for (const [rol, etapas] of Object.entries(ETAPAS_POR_ROL))
  etapas.forEach(e => add(`etapa.${e}.editar`, 'etapas', [rol]))
for (const [rol, porEstado] of Object.entries(ETAPAS_PARA_CERRAR))
  Object.keys(porEstado).forEach(est => add(`estado.${est}.cerrar`, 'estados', [rol]))
for (const [est, cfg] of Object.entries(TRANSICIONES))
  add(`estado.${est}.avanzar`, 'estados', cfg.roles)

// ── Requisitos de cierre: son REGLA DE PROCESO, no permiso. ─────────────────
// Se extraen aparte para confirmar que son idénticos entre roles; si lo son,
// pueden vivir indexados por estado (sin rol) y quedarse en código.
const requisitos = {}
let conflicto = false
for (const [rol, porEstado] of Object.entries(ETAPAS_PARA_CERRAR))
  for (const [est, etapas] of Object.entries(porEstado)) {
    const firma = etapas.join('+')
    if (requisitos[est] === undefined) requisitos[est] = firma
    else if (requisitos[est] !== firma) {
      conflicto = true
      console.error(`CONFLICTO en ${est}: '${requisitos[est]}' vs '${firma}' (rol ${rol})`)
    }
  }

const catalogo = [...porClave.values()]
  .map(c => ({ ...c, roles: [...c.roles].sort() }))
  .sort((a, b) => a.clave.localeCompare(b.clave))

fs.writeFileSync(path.join(__dirname, 'catalogo.json'),
  JSON.stringify({ catalogo, requisitos_cierre: requisitos }, null, 2))

const porModulo = {}
catalogo.forEach(c => { porModulo[c.modulo] = (porModulo[c.modulo] || 0) + 1 })
console.log('Permisos por módulo:')
Object.entries(porModulo).sort().forEach(([m, n]) => console.log(`  ${m.padEnd(20)} ${n}`))
console.log(`\nTOTAL: ${catalogo.length} permisos · ${ROLES.length} roles`)
console.log(`Requisitos de cierre consistentes entre roles: ${conflicto ? 'NO — revisar' : 'SÍ'}`)
console.log(`\nEscrito: ${path.join(__dirname, 'catalogo.json')}`)
