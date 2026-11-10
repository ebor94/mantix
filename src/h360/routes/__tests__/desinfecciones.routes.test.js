// Compuerta de las rutas del módulo de desinfecciones del parque automotor.
//
// Dos cosas se rompen en silencio acá y por eso se prueban recorriendo el
// router real con peticiones HTTP de verdad, no una lista escrita a mano:
//
// 1. EL ORDEN. El callback de n8n vive en /desinfecciones/evidencia/drive y
//    tiene al lado un comodín /desinfecciones/evidencia/:id. Si el comodín
//    gana, el callback se convierte en «servir la evidencia número 'drive'».
//
// 2. LA EXCEPCIÓN DE AUTENTICACIÓN. Ese callback es el único endpoint del
//    módulo que no pasa por verifyToken, porque n8n no puede mandar un JWT de
//    usuario. Una excepción así es correcta mientras siga siendo UNA, y lo que
//    la mantiene en una es una prueba que falle cuando alguien amplíe el hueco.
//
// Los manejadores se reemplazan por espías: acá se prueba la compuerta, no lo
// que hacen detrás (eso lo cubren los tests de cada controlador). El espía
// permite afirmar lo más fuerte: que ante un 401/403 el manejador NO corrió.

const SECRETO = 'secreto-solo-para-pruebas'
const JWT_SECRET_ANTES = process.env.JWT_SECRET
process.env.JWT_SECRET = SECRETO

jest.mock('../../config/db')

const mockEspia = nombre => jest.fn((req, res) => res.status(200).json({ handler: nombre, params: req.params }))

const mockNombresCtrl = ['listarActividades', 'crearActividad', 'actualizarActividad',
  'listarReglas', 'crearRegla', 'actualizarRegla', 'sembrarVehiculo', 'tablero',
  'actualizarProgramacion', 'registrar', 'listarRegistros', 'pendientes']
const mockNombresAut = ['solicitar', 'validar', 'listarAutorizaciones']

jest.mock('../../controllers/desinfecciones.controller', () =>
  Object.fromEntries(mockNombresCtrl.map(n => [n, mockEspia(`ctrl.${n}`)])))
jest.mock('../../controllers/desinfeccionesAutorizacion.controller', () =>
  Object.fromEntries(mockNombresAut.map(n => [n, mockEspia(`aut.${n}`)])))
jest.mock('../../services/desinfeccionEvidencia.service', () => ({
  // La subida real es multer; acá solo tiene que dejar pasar.
  subidaEvidencia: jest.fn((req, res, next) => next()),
  servirEvidencia: mockEspia('evid.servirEvidencia'),
  callbackDrive:   mockEspia('evid.callbackDrive'),
}))

const express = require('express')
const request = require('supertest')
const jwt = require('jsonwebtoken')
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba')
const ctrl = require('../../controllers/desinfecciones.controller')
const aut  = require('../../controllers/desinfeccionesAutorizacion.controller')
const evid = require('../../services/desinfeccionEvidencia.service')
const h360Router = require('../index')

const TOKEN_WEBHOOK_ANTES = process.env.DESINF_DRIVE_CALLBACK_TOKEN

const app = express()
app.use(express.json())
app.use('/api/h360', h360Router)

const token = rol =>
  jwt.sign({ usuario: 'U', nombre: 'N', email: 'u@x.co', rol, roles: [rol] }, SECRETO, { expiresIn: '1h' })

const pedir = async () => request(await servir(app))

const todosLosEspias = () => [...Object.values(ctrl), ...Object.values(aut),
  evid.servirEvidencia, evid.callbackDrive]
const vecesLlamados = () => todosLosEspias().reduce((n, e) => n + e.mock.calls.length, 0)

let avisos
beforeEach(() => {
  jest.clearAllMocks()
  avisos = jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => { avisos.mockRestore(); await cerrarServidores() })
afterAll(() => {
  if (JWT_SECRET_ANTES === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = JWT_SECRET_ANTES
  if (TOKEN_WEBHOOK_ANTES === undefined) delete process.env.DESINF_DRIVE_CALLBACK_TOKEN
  else process.env.DESINF_DRIVE_CALLBACK_TOKEN = TOKEN_WEBHOOK_ANTES
})

// ── El callback de n8n ────────────────────────────────────────────────────
describe('callback de n8n: /desinfecciones/evidencia/drive', () => {
  test('no pasa por verifyToken: sin JWT no da «Token requerido»', async () => {
    delete process.env.DESINF_DRIVE_CALLBACK_TOKEN
    const res = await (await pedir()).post('/api/h360/desinfecciones/evidencia/drive').send({})

    // 503 = llegó al guardián del webhook, que falla cerrado sin secreto.
    // Si diera 401 «Token requerido», estaría detrás de verifyToken y n8n
    // no podría llamarlo nunca.
    expect(res.status).toBe(503)
    expect(res.body.mensaje).not.toMatch(/Token requerido/)
  })

  test('sin secreto configurado el manejador NO corre', async () => {
    delete process.env.DESINF_DRIVE_CALLBACK_TOKEN
    await (await pedir()).post('/api/h360/desinfecciones/evidencia/drive').send({})

    expect(evid.callbackDrive).not.toHaveBeenCalled()
  })

  test('con secreto mal da 401 y el manejador NO corre', async () => {
    process.env.DESINF_DRIVE_CALLBACK_TOKEN = 'el-bueno'
    const res = await (await pedir())
      .post('/api/h360/desinfecciones/evidencia/drive')
      .set('x-webhook-token', 'el-malo').send({})

    expect(res.status).toBe(401)
    expect(evid.callbackDrive).not.toHaveBeenCalled()
  })

  // La prueba del orden: el comodín /evidencia/:id no se lo puede comer.
  test('con el secreto bueno llega al callback y no a servirEvidencia', async () => {
    process.env.DESINF_DRIVE_CALLBACK_TOKEN = 'el-bueno'
    const res = await (await pedir())
      .post('/api/h360/desinfecciones/evidencia/drive')
      .set('x-webhook-token', 'el-bueno').send({ registro_id: 1 })

    expect(res.body.handler).toBe('evid.callbackDrive')
    expect(evid.servirEvidencia).not.toHaveBeenCalled()
  })

  test('el callback no abre el resto del módulo: el tablero sigue pidiendo JWT', async () => {
    process.env.DESINF_DRIVE_CALLBACK_TOKEN = 'el-bueno'
    const res = await (await pedir())
      .get('/api/h360/desinfecciones/tablero')
      .set('x-webhook-token', 'el-bueno')

    expect(res.status).toBe(401)
    expect(ctrl.tablero).not.toHaveBeenCalled()
  })
})

// ── Todo lo demás sí pasa por verifyToken ─────────────────────────────────
describe('el resto del módulo exige JWT', () => {
  const RUTAS = [
    ['get',   '/api/h360/desinfecciones/tablero'],
    ['get',   '/api/h360/desinfecciones/actividades'],
    ['post',  '/api/h360/desinfecciones/actividades'],
    ['get',   '/api/h360/desinfecciones/reglas'],
    ['post',  '/api/h360/desinfecciones/reglas'],
    ['patch', '/api/h360/desinfecciones/programacion/1'],
    ['post',  '/api/h360/desinfecciones/registro'],
    ['get',   '/api/h360/desinfecciones/registros'],
    ['get',   '/api/h360/desinfecciones/pendientes'],
    ['get',   '/api/h360/desinfecciones/evidencia/7'],
    ['get',   '/api/h360/desinfecciones/autorizaciones'],
    ['post',  '/api/h360/desinfecciones/vehiculos/3/sembrar'],
    ['post',  '/api/h360/desinfecciones/vehiculos/3/autorizacion/solicitar'],
    ['post',  '/api/h360/desinfecciones/vehiculos/3/autorizacion/validar'],
  ]

  test.each(RUTAS)('%s %s sin token da 401 y no corre el manejador', async (metodo, ruta) => {
    const res = await (await pedir())[metodo](ruta).send({})

    expect(res.status).toBe(401)
    expect(vecesLlamados()).toBe(0)
  })
})

// ── Compuertas de rol ────────────────────────────────────────────────────
describe('compuertas de rol', () => {
  // El personal de laboratorio que no ejecuta estas actividades, y los roles
  // de otros módulos, no ven los valores pactados con el lavadero.
  test.each(['asistente', 'tanatologo', 'recepcion', 'psicologia', 'tramitador'])(
    'el rol %s no ve el tablero', async (rol) => {
      const res = await (await pedir())
        .get('/api/h360/desinfecciones/tablero').set('Authorization', `Bearer ${token(rol)}`)

      expect(res.status).toBe(403)
      expect(ctrl.tablero).not.toHaveBeenCalled()
    })

  test.each(['asistente_tanatologo', 'asesor', 'supervisora', 'coordinador', 'contabilidad', 'admin'])(
    'el rol %s sí ve el tablero', async (rol) => {
      const res = await (await pedir())
        .get('/api/h360/desinfecciones/tablero').set('Authorization', `Bearer ${token(rol)}`)

      expect(res.status).toBe(200)
      expect(res.body.handler).toBe('ctrl.tablero')
    })

  // Configurar el catálogo decide cada cuánto hay que hacer qué, y de ahí sale
  // la inhabilitación de un vehículo: es de coordinación.
  test.each(['asistente_tanatologo', 'asesor', 'supervisora', 'contabilidad'])(
    'el rol %s no configura reglas', async (rol) => {
      const res = await (await pedir())
        .post('/api/h360/desinfecciones/reglas').set('Authorization', `Bearer ${token(rol)}`).send({})

      expect(res.status).toBe(403)
      expect(ctrl.crearRegla).not.toHaveBeenCalled()
    })

  test.each(['coordinador', 'admin'])('el rol %s sí configura reglas', async (rol) => {
    const res = await (await pedir())
      .post('/api/h360/desinfecciones/reglas').set('Authorization', `Bearer ${token(rol)}`).send({})

    expect(res.body.handler).toBe('ctrl.crearRegla')
  })

  // El asesor ve el aviso porque programa servicios, pero no ejecuta la
  // desinfección ni la registra.
  test('el asesor ve los pendientes pero no puede registrar', async () => {
    const cliente = await pedir()
    const ve = await cliente.get('/api/h360/desinfecciones/pendientes')
      .set('Authorization', `Bearer ${token('asesor')}`)
    const registra = await cliente.post('/api/h360/desinfecciones/registro')
      .set('Authorization', `Bearer ${token('asesor')}`).send({})

    expect(ve.status).toBe(200)
    expect(registra.status).toBe(403)
    expect(ctrl.registrar).not.toHaveBeenCalled()
  })

  test.each(['asistente_tanatologo', 'coordinador', 'admin'])(
    'el rol %s sí registra, y la subida corre antes del manejador', async (rol) => {
      const res = await (await pedir())
        .post('/api/h360/desinfecciones/registro').set('Authorization', `Bearer ${token(rol)}`).send({})

      expect(res.body.handler).toBe('ctrl.registrar')
      expect(evid.subidaEvidencia).toHaveBeenCalled()
    })

  // El historial de excepciones es rastro de auditoría.
  test.each(['asistente_tanatologo', 'asesor', 'supervisora'])(
    'el rol %s no lee el historial de autorizaciones', async (rol) => {
      const res = await (await pedir())
        .get('/api/h360/desinfecciones/autorizaciones').set('Authorization', `Bearer ${token(rol)}`)

      expect(res.status).toBe(403)
      expect(aut.listarAutorizaciones).not.toHaveBeenCalled()
    })

  test('pedir código para levantar un vehículo llega al manejador con el id', async () => {
    const res = await (await pedir())
      .post('/api/h360/desinfecciones/vehiculos/42/autorizacion/solicitar')
      .set('Authorization', `Bearer ${token('asesor')}`).send({ motivo: 'servicio urgente hoy' })

    expect(res.body.handler).toBe('aut.solicitar')
    expect(res.body.params.id).toBe('42')
  })

  // /vehiculos/:id/sembrar no puede confundirse con las de autorización.
  test('sembrar y autorizar son rutas distintas', async () => {
    const res = await (await pedir())
      .post('/api/h360/desinfecciones/vehiculos/42/sembrar')
      .set('Authorization', `Bearer ${token('coordinador')}`).send({})

    expect(res.body.handler).toBe('ctrl.sembrarVehiculo')
    expect(aut.solicitar).not.toHaveBeenCalled()
  })
})
