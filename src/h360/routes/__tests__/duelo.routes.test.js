// src/h360/routes/__tests__/duelo.routes.test.js
// Compuerta de las rutas del módulo R-56 (acompañamiento al duelo).
//
// Este módulo sirve datos de familias en duelo y, en las atenciones, dato de
// salud de un tercero (Ley 1581 de 2012). Lo único que separa a un coordinador
// de esos datos es verifyToken + requireRol('psicologia', 'admin'). Una ruta
// sin compuerta falla en silencio: funciona igual para quien debe entrar y para
// quien no. Por eso estas pruebas recorren el router real (no una lista escrita
// a mano) y mandan peticiones HTTP de verdad con supertest.
//
// Los controladores de duelo se reemplazan por espías: acá se prueba la
// compuerta, no lo que hacen detrás de ella (eso lo cubren los tests de cada
// controlador). Un espía permite afirmar lo más fuerte: que ante un 401/403 el
// manejador NO se ejecutó. La excepción es la última sección, que usa el
// controlador real de atenciones para probar su segunda capa.
//
// Todo se simula: no hay conexión a MySQL ni al ERP.

const SECRETO = 'secreto-solo-para-pruebas'
const JWT_SECRET_ANTES = process.env.JWT_SECRET
process.env.JWT_SECRET = SECRETO

jest.mock('../../config/db')

const mockNombresCtrl = ['bandeja', 'buscar', 'ficha', 'crear', 'actualizar', 'agregarIntento', 'guardarServicios']
const mockNombresAtenciones = ['listar', 'crear']

// Cada espía responde 200 con su propio nombre: así se comprueba qué manejador
// quedó cableado a cada ruta.
const mockEspia = nombre => jest.fn((req, res) => res.status(200).json({ handler: nombre, params: req.params }))
jest.mock('../../controllers/duelo.controller', () =>
  Object.fromEntries(mockNombresCtrl.map(n => [n, mockEspia(`duelo.${n}`)])))
jest.mock('../../controllers/duelo_atenciones.controller', () =>
  Object.fromEntries(mockNombresAtenciones.map(n => [n, mockEspia(`atenciones.${n}`)])))

const express = require('express')
const request = require('supertest')
const jwt = require('jsonwebtoken')
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba')
const db = require('../../config/db')
const { verifyToken } = require('../../middleware/auth')
const ctrl = require('../../controllers/duelo.controller')
const atenciones = require('../../controllers/duelo_atenciones.controller')
const dueloRouter = require('../duelo.routes')
const h360Router = require('../index')

afterAll(() => {
  if (JWT_SECRET_ANTES === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = JWT_SECRET_ANTES
})
beforeEach(() => jest.clearAllMocks())
afterEach(cerrarServidores)

// --- Utilidades -------------------------------------------------------------

// Todos los roles que el directorio puede dar (ROLE_MAP de ldap.service), menos
// los dos que sí tienen acceso. Más tres valores que no son un rol válido.
const ROLES_CON_ACCESO = ['psicologia', 'admin']
const ROLES_SIN_ACCESO = [
  'asesor', 'asistente', 'tanatologo', 'asistente_tanatologo', 'supervisora',
  'coordinador', 'contabilidad', 'recepcion', 'tramitador',
  'Psicologia', 'ADMIN', 'invitado', '',
]

const token = (rol, extra = {}, opciones = { expiresIn: '1h' }) =>
  jwt.sign({ usuario: 'U', nombre: 'N', email: 'u@x.co', rol, roles: [rol], ...extra }, SECRETO, opciones)

// Lo que se llamó de los espías de duelo, sumado.
const llamadasAlManejador = () =>
  [...Object.values(ctrl), ...Object.values(atenciones)]
    .filter(jest.isMockFunction)
    .reduce((n, f) => n + f.mock.calls.length, 0)

const usosDeBd = () =>
  Object.values(db).filter(jest.isMockFunction).reduce((n, f) => n + f.mock.calls.length, 0)

const rutasDe = router => router.stack.filter(c => c.route).flatMap(c =>
  Object.keys(c.route.methods).map(metodo => ({ metodo, ruta: c.route.path })))

const urlDe = ruta => '/api/h360/duelo' + ruta.replace(/:[A-Za-z_]+/g, '123')

// Mismo montaje que src/routes/index.js (/h360) bajo /api.
const appH360 = () => express().use(express.json()).use('/api/h360', h360Router)

async function pedir(app, metodo, url, tok) {
  let r = request(await servir(app))[metodo](url)
  if (tok !== undefined) r = r.set('Authorization', tok)
  if (['post', 'put', 'patch'].includes(metodo)) r = r.send({})
  return r
}

// Estado de cada rol frente a la misma ruta, para que un fallo muestre cuál se coló.
async function estadoPorRol(app, metodo, url, roles) {
  const estados = {}
  for (const rol of roles) estados[rol || '(vacío)'] = (await pedir(app, metodo, url, `Bearer ${token(rol)}`)).status
  return estados
}

// Lo que cada ruta debe invocar. Si se agrega una ruta, esta tabla debe crecer:
// es lo que obliga a decidir su compuerta de forma consciente.
const ESPERADO = {
  'get /bandeja':                    'duelo.bandeja',
  'get /buscar':                     'duelo.buscar',
  'get /gestion/:orden':             'duelo.ficha',
  'post /gestion':                   'duelo.crear',
  'patch /gestion/:id':              'duelo.actualizar',
  'post /gestion/:id/intentos':      'duelo.agregarIntento',
  'put /gestion/:id/servicios':      'duelo.guardarServicios',
  'get /gestion/:id/atenciones':     'atenciones.listar',
  'post /gestion/:id/atenciones':    'atenciones.crear',
}

const RUTAS = rutasDe(dueloRouter)

// --- Inventario -------------------------------------------------------------

describe('inventario del router de duelo', () => {
  test('todas las capas son rutas con método y camino propios (nada de use() suelto ni sub-routers que esquiven la prueba)', () => {
    const noRuta = dueloRouter.stack.filter(c => !c.route)
    expect(noRuta).toEqual([])
  })

  test('las rutas son exactamente las esperadas', () => {
    expect(RUTAS.map(r => `${r.metodo} ${r.ruta}`).sort()).toEqual(Object.keys(ESPERADO).sort())
  })

  test('cada ruta lleva dos capas: la compuerta de rol y luego el manejador', () => {
    const capas = dueloRouter.stack.map(c => c.route.stack.length)
    expect(capas.length).toBeGreaterThan(0)
    expect(capas.every(n => n === 2)).toBe(true)
  })

  test('los manejadores que usa el router existen de verdad en los controladores reales', () => {
    // Los controladores están simulados en este archivo; aquí se comprueba que
    // los nombres que simulamos son exports reales (si no, la prueba mentiría).
    const real = jest.requireActual('../../controllers/duelo.controller')
    const realAt = jest.requireActual('../../controllers/duelo_atenciones.controller')
    for (const n of mockNombresCtrl) expect(typeof real[n]).toBe('function')
    for (const n of mockNombresAtenciones) expect(typeof realAt[n]).toBe('function')
  })
})

// --- Compuerta, ruta por ruta, por HTTP --------------------------------------

describe.each(RUTAS)('$metodo $ruta', ({ metodo, ruta }) => {
  const url = urlDe(ruta)

  test('sin token, 401, y el manejador no se ejecuta', async () => {
    const r = await pedir(appH360(), metodo, url)
    expect(r.status).toBe(401)
    expect(llamadasAlManejador()).toBe(0)
  })

  test.each([
    ['con esquema que no es Bearer', `Basic ${token('psicologia')}`],
    ['con "Bearer" sin token', 'Bearer '],
    ['con basura', 'Bearer basura.sin.firma'],
    ['firmado con otro secreto', 'Bearer ' + jwt.sign({ rol: 'psicologia' }, 'otro-secreto')],
    ['vencido', 'Bearer ' + token('psicologia', {}, { expiresIn: -60 })],
    ['con alg none', 'Bearer ' + Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.'
      + Buffer.from('{"rol":"psicologia"}').toString('base64url') + '.'],
  ])('token %s, 401, y el manejador no se ejecuta', async (_n, cabecera) => {
    const r = await pedir(appH360(), metodo, url, cabecera)
    expect(r.status).toBe(401)
    expect(llamadasAlManejador()).toBe(0)
  })

  test('cualquier rol que no sea psicologia ni admin recibe 403, y el manejador no se ejecuta', async () => {
    const estados = await estadoPorRol(appH360(), metodo, url, ROLES_SIN_ACCESO)
    expect(estados).toEqual(Object.fromEntries(Object.keys(estados).map(k => [k, 403])))
    expect(Object.keys(estados)).toHaveLength(ROLES_SIN_ACCESO.length)
    expect(llamadasAlManejador()).toBe(0)
  })

  test('un token sin el campo rol recibe 403', async () => {
    const sinRol = jwt.sign({ usuario: 'U' }, SECRETO, { expiresIn: '1h' })
    const r = await pedir(appH360(), metodo, url, `Bearer ${sinRol}`)
    expect(r.status).toBe(403)
    expect(llamadasAlManejador()).toBe(0)
  })

  test('vale el rol ACTIVO: tener psicologia entre sus roles no basta si el activo es otro', async () => {
    const t = token('coordinador', { roles: ['coordinador', 'psicologia'] })
    const r = await pedir(appH360(), metodo, url, `Bearer ${t}`)
    expect(r.status).toBe(403)
    expect(llamadasAlManejador()).toBe(0)
  })

  test.each(ROLES_CON_ACCESO)('el rol %s pasa y llega al manejador correcto', async rol => {
    const r = await pedir(appH360(), metodo, url, `Bearer ${token(rol)}`)
    expect(r.status).toBe(200)
    expect(r.body.handler).toBe(ESPERADO[`${metodo} ${ruta}`])
    expect(llamadasAlManejador()).toBe(1)
  })
})

describe('HEAD en las rutas GET no esquiva la compuerta', () => {
  test.each(RUTAS.filter(r => r.metodo === 'get'))('HEAD $ruta', async ({ ruta }) => {
    const url = urlDe(ruta)
    expect((await pedir(appH360(), 'head', url)).status).toBe(401)
    expect((await pedir(appH360(), 'head', url, `Bearer ${token('coordinador')}`)).status).toBe(403)
    expect(llamadasAlManejador()).toBe(0)
  })
})

// --- Montaje -----------------------------------------------------------------

describe('montaje en /api/h360/duelo', () => {
  test('bajo /duelo nada responde sin token, ni siquiera un camino que no existe', async () => {
    for (const url of ['/api/h360/duelo', '/api/h360/duelo/', '/api/h360/duelo/no-existe', '/api/h360/duelo/gestion/1/otra']) {
      const r = await pedir(appH360(), 'get', url)
      expect([url, r.status]).toEqual([url, 401])
    }
  })

  test('con rol válido un camino que no existe da 404 y no cae en otro manejador', async () => {
    const r = await pedir(appH360(), 'get', '/api/h360/duelo/no-existe', `Bearer ${token('psicologia')}`)
    expect(r.status).toBe(404)
    expect(llamadasAlManejador()).toBe(0)
  })

  test('/gestion/:orden y /gestion/:id/atenciones no se pisan entre sí', async () => {
    const t = `Bearer ${token('psicologia')}`
    const a = await pedir(appH360(), 'get', '/api/h360/duelo/gestion/SAR-1883', t)
    expect(a.body).toMatchObject({ handler: 'duelo.ficha', params: { orden: 'SAR-1883' } })
    const b = await pedir(appH360(), 'get', '/api/h360/duelo/gestion/55/atenciones', t)
    expect(b.body).toMatchObject({ handler: 'atenciones.listar', params: { id: '55' } })
  })

  test('si el router se montara sin verifyToken, requireRol igual niega todo (no depende del montaje)', async () => {
    const sinVerificar = express().use(express.json()).use('/duelo', dueloRouter)
    for (const { metodo, ruta } of RUTAS) {
      const r = await pedir(sinVerificar, metodo, '/duelo' + ruta.replace(/:[A-Za-z_]+/g, '123'))
      expect([metodo, ruta, r.status]).toEqual([metodo, ruta, 403])
    }
    expect(llamadasAlManejador()).toBe(0)
  })
})

// --- Las rutas que ya existían ------------------------------------------------

// Prefijo de una capa montada con router.use('/algo', ...) en Express 4.
function prefijoDe(capa) {
  const m = /^\^\\\/(.+?)\\\/\?\(\?=\\\/\|\$\)$/.exec(capa.regexp.source)
  return m ? '/' + m[1].replace(/\\\//g, '/') : null
}

describe('montar duelo no cambia el resto de h360', () => {
  const montajes = {}
  for (const capa of h360Router.stack.filter(c => !c.route)) {
    const p = prefijoDe(capa)
    if (p === null) throw new Error(`No pude derivar el prefijo de la capa ${capa.regexp}`)
    ;(montajes[p] ||= []).push(capa)
  }
  const PUBLICOS = ['/auth']
  const protegidos = Object.keys(montajes).filter(p => !PUBLICOS.includes(p))

  test('el único módulo montado sin verifyToken es /auth (el login)', () => {
    const sinVerifyToken = Object.keys(montajes).filter(p => montajes[p][0].handle !== verifyToken)
    expect(sinVerifyToken).toEqual(PUBLICOS)
  })

  test('/duelo está montado con verifyToken y con su router', () => {
    expect(montajes['/duelo']).toHaveLength(2)
    expect(montajes['/duelo'][0].handle).toBe(verifyToken)
    expect(montajes['/duelo'][1].handle).toBe(dueloRouter)
  })

  test('el resto de módulos sigue montado: todos responden 401 sin token y no 404', async () => {
    expect(protegidos.length).toBeGreaterThan(10)
    const estados = {}
    for (const p of protegidos) estados[p] = (await pedir(appH360(), 'get', `/api/h360${p}/lo-que-sea`)).status
    expect(estados).toEqual(Object.fromEntries(protegidos.map(p => [p, 401])))
  })

  test('el health sigue público', async () => {
    const h = await pedir(appH360(), 'get', '/api/h360/health')
    expect(h.status).toBe(200)
    expect(h.body).toMatchObject({ ok: true, modulo: 'Homenajes360' })
  })

  test('una ruta de otro módulo conserva su compuerta propia (reportes es de coordinador y admin)', async () => {
    const t = rol => `Bearer ${token(rol)}`
    expect((await pedir(appH360(), 'get', '/api/h360/reportes/salas-velacion', t('psicologia'))).status).toBe(403)
    expect((await pedir(appH360(), 'get', '/api/h360/reportes/salas-velacion', t('recepcion'))).status).toBe(403)
  })
})

// --- Segunda capa de atenciones ----------------------------------------------

// Las funciones de atenciones verifican el rol por dentro. Si alguien las monta
// en otra ruta sin requireRol, el dato debe seguir protegido. Aquí se montan sin
// compuerta de rol (solo verifyToken para que haya req.user) con el controlador
// REAL, y se comprueba por HTTP que niega y que no toca la base.
describe('segunda capa: el controlador real de atenciones niega por sí solo', () => {
  const real = jest.requireActual('../../controllers/duelo_atenciones.controller')
  const appSinCompuerta = () => express().use(express.json())
    .get('/x/:id/atenciones', verifyToken, real.listar)
    .post('/x/:id/atenciones', verifyToken, real.crear)

  const CUERPO = { momento: '2026-11-05T14:30', modalidad: 'PRESENCIAL' }
  const enviar = async (metodo, rol) => {
    let r = request(await servir(appSinCompuerta()))[metodo]('/x/5/atenciones').set('Authorization', `Bearer ${token(rol)}`)
    if (metodo === 'post') r = r.send(CUERPO)
    return r
  }

  test.each(['get', 'post'])('%s: los roles sin acceso reciben 403 y la base no se toca', async metodo => {
    const estados = {}
    for (const rol of ROLES_SIN_ACCESO) estados[rol || '(vacío)'] = (await enviar(metodo, rol)).status
    expect(estados).toEqual(Object.fromEntries(Object.keys(estados).map(k => [k, 403])))
    expect(usosDeBd()).toBe(0)
  })

  // Control: sin esto, el 403 de arriba podría venir de un montaje roto.
  test.each(['get', 'post'])('%s: control, psicologia sí llega a la base', async metodo => {
    const r = await enviar(metodo, 'psicologia')
    expect([401, 403]).not.toContain(r.status)
    expect(usosDeBd()).toBeGreaterThan(0)
  })
})
