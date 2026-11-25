// Compuerta de las rutas del módulo de laboratorio.
//
// Tres cosas se rompen en silencio acá y por eso se prueban recorriendo el
// router real con peticiones HTTP de verdad, no una lista escrita a mano:
//
// 1. EL ROL NUEVO. `tanatologo` no existe en el módulo de vehículos y entra
//    SOLO acá: el laboratorio es donde trabaja. Si se cae de la lista, la
//    persona que hace el aseo ve el tablero y no puede registrar nada —o no ve
//    ni el tablero—, y el módulo queda inservible para su único usuario real.
//    Al revés también importa: que entrar al laboratorio NO lo meta en la
//    configuración ni en los informes.
//
// 2. EL MIDDLEWARE DE SUBIDA. `POST /registro` tiene que montar
//    `evid.subidaEvidencia` ANTES del controlador. Sin él `req.files` llega
//    vacío y TODA actividad de tipo EVIDENCIA responde 400 aunque el operario
//    haya mandado la foto: las tres actividades que exigen prueba sanitaria
//    quedan imposibles de registrar y el mensaje culpa al que sí mandó la foto.
//
// 3. QUE CADA RUTA DE LA ESPECIFICACIÓN ESTÉ MONTADA. `GET /laboratorios` es la
//    que se olvida: sin ella `listarLaboratorios` es código muerto y la
//    pantalla de configuración no tiene de dónde sacar el selector de sede.
//
// `GET /registros` se monta sobre `laboratorioInformes.historial` y no sobre el
// controlador principal: `historial` es un sobre-conjunto de filtros y devuelve
// `total`, que es lo que la exportación a Excel necesita para saber cuántas
// páginas pedir. Tener dos funciones para el mismo trabajo obligaba al frontend
// a aprender dos formas, así que la otra se borró.
//
// Los manejadores se reemplazan por espías: acá se prueba la compuerta, no lo
// que hacen detrás (eso lo cubren los tests de cada controlador). El espía
// permite afirmar lo más fuerte: que ante un 401/403 el manejador NO corrió.

const SECRETO = 'secreto-solo-para-pruebas'
const JWT_SECRET_ANTES = process.env.JWT_SECRET
process.env.JWT_SECRET = SECRETO

jest.mock('../../config/db')

const mockEspia = nombre => jest.fn((req, res) => res.status(200).json({ handler: nombre, params: req.params }))

// LAS ONCE que exporta `laboratorio.controller` y que alguna ruta nombra.
// `routes/index.js` exige que el controlador exporte CADA función que una ruta
// nombre: si falta una, `router.get` recibe undefined y la suite entera falla
// con «Route.get() requires a callback function but got [object Undefined]».
// Ya pasó con `tableroPublico` en el módulo de vehículos.
//
// `listarRegistros` NO está: se borró del controlador (ver la cabecera), y esta
// lista es lo que lo fija —si alguien la revive, no tiene ruta que la nombre—.
const mockNombresCtrl = ['listarLaboratorios',
  'listarActividades', 'crearActividad', 'actualizarActividad',
  'listarReglas', 'crearRegla', 'actualizarRegla',
  'tablero', 'registrar', 'omitirTarea', 'servirEvidencia']

// Las tres del controlador de informes. `historial` también se monta, en
// `GET /registros`.
const mockNombresInf = ['cumplimiento', 'porPersona', 'historial']

// El módulo de vehículos no es el de este archivo, pero routes/index.js monta
// los dos y este archivo carga ese index: cada manejador que monte el router
// de vehículos tiene que estar en la lista o `router.get` recibe undefined y
// la suite no arranca. `tableroPublico` va aunque no sea una ruta de ese
// router: lo monta el index, fuera de verifyToken.
const mockNombresVehiculos = ['listarActividades', 'crearActividad', 'actualizarActividad',
  'listarReglas', 'crearRegla', 'actualizarRegla', 'sembrarVehiculo', 'tablero',
  'actualizarProgramacion', 'registrar', 'listarRegistros', 'informeFlota',
  'pendientes', 'tableroPublico']

jest.mock('../../controllers/laboratorio.controller', () => ({
  ...Object.fromEntries(mockNombresCtrl.map(n => [n, mockEspia(`ctrl.${n}`)])),
  // `_internos` es EL DE VERDAD, no uno inventado: la ruta de registro toma de
  // ahí `ROLES_QUE_REGISTRAN` en vez de reescribir la lista, porque es la misma
  // que el tablero manda en `puede_registrar`. Si el doble trajera su propia
  // copia, esta suite probaría la lista del doble y la desincronización
  // —tablero que promete registrar y ruta que responde 403— pasaría sin que
  // nada falle. Requerir el módulo real acá no arrastra sharp ni multer: el
  // servicio de evidencia también está doblado.
  _internos: jest.requireActual('../../controllers/laboratorio.controller')._internos,
}))
jest.mock('../../controllers/laboratorioInformes.controller', () =>
  Object.fromEntries(mockNombresInf.map(n => [n, mockEspia(`inf.${n}`)])))

// El módulo de vehículos se dobla por dos razones: este archivo carga
// routes/index.js, que lo monta, y así una prueba que afirme «el laboratorio no
// toca los permisos de vehículos» mira un espía y no la base.
jest.mock('../../controllers/desinfecciones.controller', () =>
  Object.fromEntries(mockNombresVehiculos.map(n => [n, mockEspia(`veh.${n}`)])))

jest.mock('../../services/desinfeccionEvidencia.service', () => ({
  // La subida real es multer; acá solo tiene que dejar pasar y dejarse contar.
  subidaEvidencia: jest.fn((req, res, next) => next()),
  servirEvidencia: mockEspia('evid.servirEvidencia'),
  callbackDrive:   mockEspia('evid.callbackDrive'),
  servirEvidenciaDesde: jest.fn(() => mockEspia('evid.servirEvidenciaDesde')),
}))

const express = require('express')
const request = require('supertest')
const jwt = require('jsonwebtoken')
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba')
const ctrl = require('../../controllers/laboratorio.controller')
const inf  = require('../../controllers/laboratorioInformes.controller')
const veh  = require('../../controllers/desinfecciones.controller')
const evid = require('../../services/desinfeccionEvidencia.service')
const h360Router = require('../index')

const app = express()
app.use(express.json())
app.use('/api/h360', h360Router)

const token = rol =>
  jwt.sign({ usuario: 'U', nombre: 'N', email: 'u@x.co', rol, roles: [rol] }, SECRETO, { expiresIn: '1h' })

const pedir = async () => request(await servir(app))

// `_internos` del controlador no es un espía y viaja en el doble a propósito:
// se filtra por `.mock` en vez de por nombre, así que agregar otro dato al
// doble no vuelve a romper el conteo.
const todosLosEspias = () => [...Object.values(ctrl), ...Object.values(inf), ...Object.values(veh),
  evid.servirEvidencia, evid.callbackDrive].filter(e => typeof e === 'function' && e.mock)
const vecesLlamados = () => todosLosEspias().reduce((n, e) => n + e.mock.calls.length, 0)

// ── Las cuatro listas de rol, como las define la especificación ────────────
const VER       = ['tanatologo', 'asistente_tanatologo', 'asistente', 'asesor',
  'supervisora', 'coordinador', 'contabilidad', 'admin']
const REGISTRAR = ['tanatologo', 'asistente_tanatologo', 'asistente', 'coordinador', 'admin']
const CONFIG    = ['coordinador', 'admin']
const INFORMES  = ['coordinador', 'contabilidad', 'admin']

// Roles de otros módulos del sistema: no tienen nada que hacer en el aseo del
// laboratorio.
const AJENOS = ['recepcion', 'psicologia', 'tramitador']

let avisos
beforeEach(() => {
  jest.clearAllMocks()
  avisos = jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => { avisos.mockRestore(); await cerrarServidores() })
afterAll(() => {
  if (JWT_SECRET_ANTES === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = JWT_SECRET_ANTES
})

// ── Todo el módulo pasa por verifyToken ───────────────────────────────────
describe('el módulo entero exige JWT', () => {
  // La lista completa de la tabla «API» de la especificación. Es también la
  // prueba de que cada una está montada: una ruta que no existe no da 401, da
  // 404, y este test falla.
  const RUTAS = [
    ['get',   '/api/h360/laboratorio/laboratorios'],
    ['get',   '/api/h360/laboratorio/actividades'],
    ['post',  '/api/h360/laboratorio/actividades'],
    ['patch', '/api/h360/laboratorio/actividades/1'],
    ['get',   '/api/h360/laboratorio/reglas'],
    ['post',  '/api/h360/laboratorio/reglas'],
    ['patch', '/api/h360/laboratorio/reglas/1'],
    ['get',   '/api/h360/laboratorio/tablero'],
    ['post',  '/api/h360/laboratorio/registro'],
    ['patch', '/api/h360/laboratorio/tarea/5/omitir'],
    ['get',   '/api/h360/laboratorio/registros'],
    ['get',   '/api/h360/laboratorio/informes/cumplimiento'],
    ['get',   '/api/h360/laboratorio/informes/por-persona'],
    ['get',   '/api/h360/laboratorio/evidencia/7'],
  ]

  test.each(RUTAS)('%s %s sin token da 401 y no corre el manejador', async (metodo, ruta) => {
    const res = await (await pedir())[metodo](ruta).send({})

    expect(res.status).toBe(401)
    expect(vecesLlamados()).toBe(0)
  })

  // El laboratorio NO tiene pantalla pública: el televisor del garaje es del
  // módulo de vehículos. Un token de URL de allá no puede abrir nada de acá.
  test('no hay ninguna ruta pública de laboratorio', async () => {
    const res = await (await pedir()).get('/api/h360/publico/laboratorio/loquesea')

    expect(res.status).toBe(404)
    expect(vecesLlamados()).toBe(0)
  })
})

// ── El rol nuevo del módulo ───────────────────────────────────────────────
describe('tanatologo: el rol que entra solo acá', () => {
  test('ve el tablero', async () => {
    const res = await (await pedir())
      .get('/api/h360/laboratorio/tablero').set('Authorization', `Bearer ${token('tanatologo')}`)

    expect(res.status).toBe(200)
    expect(res.body.handler).toBe('ctrl.tablero')
  })

  test('registra, y la subida corre antes del manejador', async () => {
    const res = await (await pedir())
      .post('/api/h360/laboratorio/registro')
      .set('Authorization', `Bearer ${token('tanatologo')}`).send({})

    expect(res.body.handler).toBe('ctrl.registrar')
    expect(evid.subidaEvidencia).toHaveBeenCalled()
  })

  // Entrar al laboratorio no es configurarlo: la matriz de reglas decide cada
  // cuánto hay que hacer qué y es de coordinación.
  test.each([
    ['post',  '/api/h360/laboratorio/actividades', 'crearActividad'],
    ['patch', '/api/h360/laboratorio/actividades/1', 'actualizarActividad'],
    ['post',  '/api/h360/laboratorio/reglas', 'crearRegla'],
    ['patch', '/api/h360/laboratorio/reglas/1', 'actualizarRegla'],
  ])('recibe 403 en %s %s', async (metodo, ruta, handler) => {
    const res = await (await pedir())[metodo](ruta)
      .set('Authorization', `Bearer ${token('tanatologo')}`).send({})

    expect(res.status).toBe(403)
    expect(ctrl[handler]).not.toHaveBeenCalled()
  })

  // Los informes son el indicador de cumplimiento del área: los lee quien
  // responde por él, no quien ejecuta el aseo.
  test.each([
    ['/api/h360/laboratorio/informes/cumplimiento', 'cumplimiento'],
    ['/api/h360/laboratorio/informes/por-persona',  'porPersona'],
  ])('recibe 403 en %s', async (ruta, handler) => {
    const res = await (await pedir()).get(ruta)
      .set('Authorization', `Bearer ${token('tanatologo')}`)

    expect(res.status).toBe(403)
    expect(inf[handler]).not.toHaveBeenCalled()
  })

  // El rol nuevo es de ESTE módulo. Si se filtrara al de vehículos, el
  // tanatólogo vería los valores pactados con el lavadero.
  test('sigue sin ver el módulo de vehículos', async () => {
    const res = await (await pedir())
      .get('/api/h360/desinfecciones/tablero').set('Authorization', `Bearer ${token('tanatologo')}`)

    expect(res.status).toBe(403)
    expect(veh.tablero).not.toHaveBeenCalled()
  })
})

// ── Ver ───────────────────────────────────────────────────────────────────
describe('ver el laboratorio', () => {
  test.each(VER)('el rol %s ve el tablero', async (rol) => {
    const res = await (await pedir())
      .get('/api/h360/laboratorio/tablero').set('Authorization', `Bearer ${token(rol)}`)

    expect(res.status).toBe(200)
    expect(res.body.handler).toBe('ctrl.tablero')
  })

  test.each(AJENOS)('el rol %s no ve el tablero', async (rol) => {
    const res = await (await pedir())
      .get('/api/h360/laboratorio/tablero').set('Authorization', `Bearer ${token(rol)}`)

    expect(res.status).toBe(403)
    expect(ctrl.tablero).not.toHaveBeenCalled()
  })

  // La que es fácil de olvidar: sin ella `listarLaboratorios` queda muerta.
  test('GET /laboratorios llega a listarLaboratorios', async () => {
    const res = await (await pedir())
      .get('/api/h360/laboratorio/laboratorios').set('Authorization', `Bearer ${token('asesor')}`)

    expect(res.status).toBe(200)
    expect(res.body.handler).toBe('ctrl.listarLaboratorios')
  })

  test.each(AJENOS)('el rol %s no lista los laboratorios', async (rol) => {
    const res = await (await pedir())
      .get('/api/h360/laboratorio/laboratorios').set('Authorization', `Bearer ${token(rol)}`)

    expect(res.status).toBe(403)
    expect(ctrl.listarLaboratorios).not.toHaveBeenCalled()
  })

  test('el catálogo y la matriz se leen con permiso de ver', async () => {
    const cliente = await pedir()
    const actividades = await cliente.get('/api/h360/laboratorio/actividades')
      .set('Authorization', `Bearer ${token('asistente')}`)
    const reglas = await cliente.get('/api/h360/laboratorio/reglas')
      .set('Authorization', `Bearer ${token('asistente')}`)

    expect(actividades.body.handler).toBe('ctrl.listarActividades')
    expect(reglas.body.handler).toBe('ctrl.listarReglas')
  })

  // La foto es evidencia sanitaria y se sirve por endpoint con token, nunca
  // como estático. El handler es el del servicio montado sobre la tabla del
  // laboratorio, que el controlador arma al cargarse.
  test('la evidencia se sirve por el handler del controlador, con el id', async () => {
    const res = await (await pedir())
      .get('/api/h360/laboratorio/evidencia/77').set('Authorization', `Bearer ${token('supervisora')}`)

    expect(res.body.handler).toBe('ctrl.servirEvidencia')
    expect(res.body.params.id).toBe('77')
  })

  test.each(AJENOS)('el rol %s no ve la evidencia', async (rol) => {
    const res = await (await pedir())
      .get('/api/h360/laboratorio/evidencia/77').set('Authorization', `Bearer ${token(rol)}`)

    expect(res.status).toBe(403)
    expect(ctrl.servirEvidencia).not.toHaveBeenCalled()
  })
})

// ── Registrar y omitir ────────────────────────────────────────────────────
describe('registrar y omitir', () => {
  test.each(REGISTRAR)('el rol %s registra, y la subida corre antes', async (rol) => {
    const res = await (await pedir())
      .post('/api/h360/laboratorio/registro').set('Authorization', `Bearer ${token(rol)}`).send({})

    expect(res.body.handler).toBe('ctrl.registrar')
    expect(evid.subidaEvidencia).toHaveBeenCalled()
  })

  // Ver el estado sanitario no es ejecutar el aseo.
  test.each(['asesor', 'supervisora', 'contabilidad', ...AJENOS])(
    'el rol %s no registra', async (rol) => {
      const res = await (await pedir())
        .post('/api/h360/laboratorio/registro').set('Authorization', `Bearer ${token(rol)}`).send({})

      expect(res.status).toBe(403)
      expect(ctrl.registrar).not.toHaveBeenCalled()
    })

  // La subida es lo que llena `req.files`. Si corriera DESPUÉS del controlador
  // —o no estuviera—, toda actividad de EVIDENCIA respondería 400 con la foto
  // mandada. El orden se afirma con el espía del manejador: cuando el
  // controlador corre, la subida ya corrió.
  test('el middleware de subida corre ANTES del controlador', async () => {
    const orden = []
    evid.subidaEvidencia.mockImplementation((req, res, next) => { orden.push('subida'); next() })
    ctrl.registrar.mockImplementation((req, res) => { orden.push('ctrl'); res.json({ ok: true }) })

    await (await pedir()).post('/api/h360/laboratorio/registro')
      .set('Authorization', `Bearer ${token('tanatologo')}`).send({})

    expect(orden).toEqual(['subida', 'ctrl'])
  })

  // Un 403 no puede dejar la foto subida: el middleware va después de
  // `requireRol`, así que a un rol sin permiso no se le escribe nada.
  test('un rol sin permiso no llega ni a la subida', async () => {
    await (await pedir()).post('/api/h360/laboratorio/registro')
      .set('Authorization', `Bearer ${token('asesor')}`).send({})

    expect(evid.subidaEvidencia).not.toHaveBeenCalled()
  })

  // La ruta es PATCH /tarea/:id/omitir, singular, como la especificación y como
  // ya es /programacion/:id en el módulo de vehículos.
  test('PATCH /tarea/:id/omitir llega al manejador con el id', async () => {
    const res = await (await pedir())
      .patch('/api/h360/laboratorio/tarea/42/omitir')
      .set('Authorization', `Bearer ${token('tanatologo')}`).send({ motivo_omision: 'No hubo servicios' })

    expect(res.body.handler).toBe('ctrl.omitirTarea')
    expect(res.body.params.id).toBe('42')
  })

  test('en plural no existe: /tareas/:id/omitir da 404', async () => {
    const res = await (await pedir())
      .patch('/api/h360/laboratorio/tareas/42/omitir')
      .set('Authorization', `Bearer ${token('tanatologo')}`).send({ motivo_omision: 'No hubo servicios' })

    expect(res.status).toBe(404)
    expect(ctrl.omitirTarea).not.toHaveBeenCalled()
  })

  // Omitir cierra una tarea igual que registrarla: lo hace quien ejecuta.
  test.each(['asesor', 'supervisora', 'contabilidad'])(
    'el rol %s no omite tareas', async (rol) => {
      const res = await (await pedir())
        .patch('/api/h360/laboratorio/tarea/42/omitir')
        .set('Authorization', `Bearer ${token(rol)}`).send({ motivo_omision: 'x' })

      expect(res.status).toBe(403)
      expect(ctrl.omitirTarea).not.toHaveBeenCalled()
    })
})

// ── Configurar ────────────────────────────────────────────────────────────
describe('configurar el catálogo y la matriz', () => {
  test.each(CONFIG)('el rol %s configura actividades y reglas', async (rol) => {
    const cliente = await pedir()
    const actividad = await cliente.post('/api/h360/laboratorio/actividades')
      .set('Authorization', `Bearer ${token(rol)}`).send({})
    const regla = await cliente.patch('/api/h360/laboratorio/reglas/3')
      .set('Authorization', `Bearer ${token(rol)}`).send({})

    expect(actividad.body.handler).toBe('ctrl.crearActividad')
    expect(regla.body.handler).toBe('ctrl.actualizarRegla')
    expect(regla.body.params.id).toBe('3')
  })

  test.each(['tanatologo', 'asistente_tanatologo', 'asistente', 'asesor', 'supervisora', 'contabilidad'])(
    'el rol %s no configura reglas', async (rol) => {
      const res = await (await pedir()).post('/api/h360/laboratorio/reglas')
        .set('Authorization', `Bearer ${token(rol)}`).send({})

      expect(res.status).toBe(403)
      expect(ctrl.crearRegla).not.toHaveBeenCalled()
    })
})

// ── Informes ──────────────────────────────────────────────────────────────
describe('informes', () => {
  test.each(INFORMES)('el rol %s lee los dos informes', async (rol) => {
    const cliente = await pedir()
    const cumpl = await cliente.get('/api/h360/laboratorio/informes/cumplimiento')
      .set('Authorization', `Bearer ${token(rol)}`)
    const persona = await cliente.get('/api/h360/laboratorio/informes/por-persona')
      .set('Authorization', `Bearer ${token(rol)}`)

    expect(cumpl.body.handler).toBe('inf.cumplimiento')
    expect(persona.body.handler).toBe('inf.porPersona')
  })

  test.each(['tanatologo', 'asistente_tanatologo', 'asistente', 'asesor', 'supervisora', ...AJENOS])(
    'el rol %s no lee los informes', async (rol) => {
      const cliente = await pedir()
      const cumpl = await cliente.get('/api/h360/laboratorio/informes/cumplimiento')
        .set('Authorization', `Bearer ${token(rol)}`)
      const persona = await cliente.get('/api/h360/laboratorio/informes/por-persona')
        .set('Authorization', `Bearer ${token(rol)}`)

      expect(cumpl.status).toBe(403)
      expect(persona.status).toBe(403)
      expect(inf.cumplimiento).not.toHaveBeenCalled()
      expect(inf.porPersona).not.toHaveBeenCalled()
    })

  // Contabilidad responde por el indicador y no ejecuta el aseo: es el par que
  // demuestra que las dos listas son distintas y no una copia de la otra.
  test('contabilidad lee los informes pero no registra', async () => {
    const cliente = await pedir()
    const informe = await cliente.get('/api/h360/laboratorio/informes/cumplimiento')
      .set('Authorization', `Bearer ${token('contabilidad')}`)
    const registra = await cliente.post('/api/h360/laboratorio/registro')
      .set('Authorization', `Bearer ${token('contabilidad')}`).send({})

    expect(informe.status).toBe(200)
    expect(registra.status).toBe(403)
    expect(ctrl.registrar).not.toHaveBeenCalled()
  })

  // El histórico plano es `historial` y no `listarRegistros`: devuelve `total`,
  // que es lo que la exportación a Excel necesita para saber cuántas páginas
  // pedir. Es el endpoint que el frontend recorre.
  test('GET /registros se monta sobre informes.historial', async () => {
    const res = await (await pedir())
      .get('/api/h360/laboratorio/registros').set('Authorization', `Bearer ${token('contabilidad')}`)

    expect(res.body.handler).toBe('inf.historial')
  })

  // El historial es la misma lectura del tablero en plano, así que lo ve quien
  // ve el laboratorio: es de donde sale el papel que alguien va a buscar.
  test.each(VER)('el rol %s lee el historial', async (rol) => {
    const res = await (await pedir())
      .get('/api/h360/laboratorio/registros').set('Authorization', `Bearer ${token(rol)}`)

    expect(res.status).toBe(200)
    expect(res.body.handler).toBe('inf.historial')
  })

  test.each(AJENOS)('el rol %s no lee el historial', async (rol) => {
    const res = await (await pedir())
      .get('/api/h360/laboratorio/registros').set('Authorization', `Bearer ${token(rol)}`)

    expect(res.status).toBe(403)
    expect(inf.historial).not.toHaveBeenCalled()
  })
})

// ── Lo que este módulo NO cambia ──────────────────────────────────────────
describe('el módulo de vehículos queda intacto', () => {
  // Montar el laboratorio no puede mover una sola compuerta de allá. La lista
  // de vehículos sigue SIN `tanatologo`, que es el único rol nuevo.
  test.each(['asistente_tanatologo', 'asistente', 'asesor', 'supervisora',
    'coordinador', 'contabilidad', 'admin'])(
    'el rol %s sigue viendo el tablero de vehículos', async (rol) => {
      const res = await (await pedir())
        .get('/api/h360/desinfecciones/tablero').set('Authorization', `Bearer ${token(rol)}`)

      expect(res.status).toBe(200)
      expect(res.body.handler).toBe('veh.tablero')
    })

  test('/registros de vehículos sigue siendo el de vehículos', async () => {
    const res = await (await pedir())
      .get('/api/h360/desinfecciones/registros').set('Authorization', `Bearer ${token('coordinador')}`)

    expect(res.body.handler).toBe('veh.listarRegistros')
    expect(inf.historial).not.toHaveBeenCalled()
  })
})
