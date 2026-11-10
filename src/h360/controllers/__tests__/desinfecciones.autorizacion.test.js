// El código de autorización que levanta un vehículo inhabilitado por
// desinfección vencida.
//
// Lo que se cuida acá es lo que haría daño si se rompiera en silencio:
//   · que la excepción quede justificada (motivo de verdad, no «urgente»);
//   · que el código no se pueda adivinar ni tantear sin tope;
//   · que consumir el código y subir el vehículo sean un solo hecho — si se
//     separan, o el código se quema sin activar nada, o el vehículo queda
//     arriba con el código todavía bueno para una segunda vez;
//   · que la respuesta diga que la desinfección SIGUE vencida, porque el
//     barrido de esta noche va a volver a bajar el vehículo y sin ese aviso
//     mañana eso se reporta como un bug.

jest.mock('../../config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }))
jest.mock('../../services/googleChat.service', () => ({
  enviar:            jest.fn(async () => ({ ok: true })),
  enviarOperaciones: jest.fn(async () => ({ ok: true })),
}))

// ── Dobles de Express ──────────────────────────────────────────────────────
function resDoble() {
  const r = { codigo: 200, cuerpo: null }
  r.status = c => { r.codigo = c; return r }
  r.json   = b => { r.cuerpo = b; return r }
  return r
}
const reqDoble = (body = {}, params = { id: '7' }, query = {}) => ({
  body, params, query,
  user: { usuario: 'ASESOR1', nombre: 'Asesora Uno', rol: 'asesor' },
})

// Conexión de transacción simulada: guarda lo que se escribió y permite hacer
// fallar una consulta a propósito.
function connDoble({ fallaEn = null, afectadas = 1 } = {}) {
  const c = {
    consultas: [], commits: 0, rollbacks: 0, liberada: false,
    beginTransaction: jest.fn(),
    commit:   jest.fn(() => { c.commits++ }),
    rollback: jest.fn(() => { c.rollbacks++; return Promise.resolve() }),
    release:  jest.fn(() => { c.liberada = true }),
  }
  c.query = jest.fn(async (sql, params) => {
    c.consultas.push({ sql, params })
    if (fallaEn && new RegExp(fallaEn, 'i').test(sql)) throw new Error('fallo simulado de base')
    return [{ affectedRows: afectadas }]
  })
  return c
}

let db, gchat, crypto, ctrl
let vehiculo, autorizaciones, consultas

const FUTURO = () => new Date(Date.now() + 10 * 60 * 1000)
const PASADO = () => new Date(Date.now() - 60 * 1000)
const MOTIVO = 'Traslado urgente a Medicina Legal y el lavadero está cerrado'

beforeEach(() => {
  // El controlador lleva el contador de intentos fallidos en memoria del
  // proceso, así que cada prueba necesita su propia instancia: si no, el tope
  // de una prueba bloquearía a la siguiente.
  jest.resetModules()
  db     = require('../../config/db')
  gchat  = require('../../services/googleChat.service')
  crypto = require('crypto')
  ctrl   = require('../desinfeccionesAutorizacion.controller')

  vehiculo = {
    id: 7, placa: 'ABC123', activo: 0,
    inactivo_origen: 'DESINFECCION',
    inactivo_motivo: 'Limpieza y lavado vencida desde 2026-11-01',
  }
  autorizaciones = []
  consultas = []

  db.query = jest.fn(async (sql, params) => {
    consultas.push({ sql, params })
    if (/FROM vehiculos/i.test(sql)) return [vehiculo ? [vehiculo] : []]
    if (/FROM h360_desinf_autorizacion/i.test(sql)) {
      // Filtra por código como lo hace el WHERE real, para poder distinguir
      // «el vehículo no tiene códigos» de «el código es otro».
      const codigo = params && params[1]
      return [autorizaciones.filter(a => a.codigo === codigo)]
    }
    if (/^\s*INSERT/i.test(sql)) return [{ insertId: 42 }]
    return [{ affectedRows: 1 }]
  })
  db.getConnection = jest.fn(async () => connDoble())
})

afterEach(() => { jest.restoreAllMocks() })

const sqlDe = re => consultas.filter(q => re.test(q.sql))

// ═══════════════════════════════════════════════════════════════════════════
// solicitar
// ═══════════════════════════════════════════════════════════════════════════
describe('solicitar: no se emite un código donde no hay excepción que autorizar', () => {
  test('vehículo que no existe → 404', async () => {
    vehiculo = null
    const res = resDoble()
    await ctrl.solicitar(reqDoble({ motivo: MOTIVO }), res, jest.fn())
    expect(res.codigo).toBe(404)
    expect(sqlDe(/INSERT/i)).toHaveLength(0)
  })

  // Un vehículo activo no necesita autorización; emitir un código ahí deja un
  // código vivo que mañana sirve para subirlo sin pasar por el motivo.
  test('vehículo ya activo → 400 y no se guarda nada', async () => {
    vehiculo.activo = 1
    const res = resDoble()
    await ctrl.solicitar(reqDoble({ motivo: MOTIVO }), res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(sqlDe(/INSERT/i)).toHaveLength(0)
    expect(gchat.enviar).not.toHaveBeenCalled()
  })

  // La columna inactivo_origen existe para que el módulo no suba lo que él no
  // bajó: un carro accidentado no se habilita con un código de desinfección.
  test.each([['MANUAL'], [null]])('inhabilitado por %s → 400', async origen => {
    vehiculo.inactivo_origen = origen
    const res = resDoble()
    await ctrl.solicitar(reqDoble({ motivo: MOTIVO }), res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(sqlDe(/INSERT/i)).toHaveLength(0)
  })

  test.each([
    ['ausente',   undefined],
    ['vacío',     '   '],
    ['muy corto', 'urgente'],
  ])('motivo %s → 400', async (_, motivo) => {
    const res = resDoble()
    await ctrl.solicitar(reqDoble({ motivo }), res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('motivo')
    expect(sqlDe(/INSERT/i)).toHaveLength(0)
  })

  test('el motivo se recorta a 300 caracteres', async () => {
    await ctrl.solicitar(reqDoble({ motivo: 'x'.repeat(500) }), resDoble(), jest.fn())
    const ins = sqlDe(/INSERT INTO h360_desinf_autorizacion/i)[0]
    expect(ins.params[2]).toHaveLength(300)
  })
})

describe('solicitar: emite el código', () => {
  // Dos códigos vivos del mismo vehículo circulando por el chat es justo lo
  // que hace imposible saber cuál se usó.
  test('cancela los ENVIADO previos ANTES de insertar el nuevo', async () => {
    await ctrl.solicitar(reqDoble({ motivo: MOTIVO }), resDoble(), jest.fn())

    const iCancela = consultas.findIndex(q =>
      /UPDATE h360_desinf_autorizacion/i.test(q.sql) && /'CANCELADO'/.test(q.sql))
    const iInserta = consultas.findIndex(q => /INSERT INTO h360_desinf_autorizacion/i.test(q.sql))

    expect(iCancela).toBeGreaterThanOrEqual(0)
    expect(iInserta).toBeGreaterThanOrEqual(0)
    expect(iCancela).toBeLessThan(iInserta)
    // Cancela solo los del mismo vehículo y solo los que están ENVIADO.
    expect(consultas[iCancela].sql).toMatch(/vehiculo_id = \?/)
    expect(consultas[iCancela].sql).toMatch(/estado = 'ENVIADO'/)
    expect(consultas[iCancela].params).toEqual(['7'])
  })

  // Seis dígitos de Math.random se predicen observando salidas; esto abre un
  // vehículo inhabilitado por una razón sanitaria.
  test('el código tiene 6 dígitos y sale de crypto, no de Math.random', async () => {
    const espiaCrypto = jest.spyOn(crypto, 'randomInt')
    const espiaMath   = jest.spyOn(Math, 'random')

    await ctrl.solicitar(reqDoble({ motivo: MOTIVO }), resDoble(), jest.fn())

    const ins = sqlDe(/INSERT INTO h360_desinf_autorizacion/i)[0]
    expect(ins.params[1]).toMatch(/^\d{6}$/)
    expect(espiaCrypto).toHaveBeenCalledWith(100000, 1000000)
    expect(espiaMath).not.toHaveBeenCalled()
  })

  test('guarda vencimiento, quién lo pide y su nombre', async () => {
    const res = resDoble()
    await ctrl.solicitar(reqDoble({ motivo: MOTIVO }), res, jest.fn())

    const ins = sqlDe(/INSERT INTO h360_desinf_autorizacion/i)[0]
    expect(ins.params[0]).toBe('7')
    expect(ins.params[3]).toBe('ASESOR1')
    expect(ins.params[4]).toBe('Asesora Uno')
    expect(ins.params[5]).toBeInstanceOf(Date)
    expect(ins.params[5].getTime()).toBeGreaterThan(Date.now())
    expect(res.cuerpo.ok).toBe(true)
    expect(res.cuerpo.enviado).toBe(true)
  })

  // El código no vuelve nunca por HTTP: todo el mecanismo existe para que lo
  // entregue otra persona por otro canal.
  test('la respuesta no trae el código', async () => {
    const res = resDoble()
    await ctrl.solicitar(reqDoble({ motivo: MOTIVO }), res, jest.fn())
    expect(JSON.stringify(res.cuerpo)).not.toMatch(/\b\d{6}\b/)
  })

  test('el mensaje de Chat lleva placa, motivo, quién lo pide, por qué está abajo y el vencimiento en Bogotá', async () => {
    await ctrl.solicitar(reqDoble({ motivo: MOTIVO }), resDoble(), jest.fn())

    expect(gchat.enviar).toHaveBeenCalledTimes(1)
    // Espacio de códigos de autorización, no el muro de operaciones.
    expect(gchat.enviarOperaciones).not.toHaveBeenCalled()

    const texto = gchat.enviar.mock.calls[0][0]
    expect(texto).toContain('ABC123')
    expect(texto).toContain(MOTIVO)
    expect(texto).toContain('Asesora Uno')
    expect(texto).toContain('Limpieza y lavado vencida desde 2026-11-01')
    expect(texto).toMatch(/\b\d{6}\b/)
    // Hora de Bogotá, no un ISO recortado: el pool devuelve Date y el ISO
    // corre el día.
    const ins = sqlDe(/INSERT INTO h360_desinf_autorizacion/i)[0]
    expect(texto).toContain(ins.params[5].toLocaleString('es-CO', { timeZone: 'America/Bogota' }))
    expect(texto).not.toContain(ins.params[5].toISOString())
  })

  // Si la pantalla dijera «revisa el chat» cuando el mensaje no salió, el
  // usuario esperaría un aviso que nunca llega y pediría otro código.
  test.each([
    ['el webhook falla',         { ok: false, status: 500 }],
    ['el webhook no está puesto',{ ok: false, mensaje: 'Webhook no configurado' }],
  ])('si %s el código queda guardado y la respuesta lo advierte', async (_, resultado) => {
    gchat.enviar.mockResolvedValueOnce(resultado)
    // El controlador deja el fallo en el log a propósito; acá solo se calla
    // para no ensuciar la salida de la suite.
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const res = resDoble()

    await ctrl.solicitar(reqDoble({ motivo: MOTIVO }), res, jest.fn())

    expect(sqlDe(/INSERT INTO h360_desinf_autorizacion/i)).toHaveLength(1)
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.ok).toBe(true)
    expect(res.cuerpo.enviado).toBe(false)
    expect(res.cuerpo.solicitud_id).toBe(42)
    expect(res.cuerpo.mensaje).toMatch(/no salió|no sali/i)
    expect(res.cuerpo.mensaje).not.toMatch(/revisa el chat/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// validar
// ═══════════════════════════════════════════════════════════════════════════
describe('validar: lo que rechaza', () => {
  test.each([
    ['ausente',     undefined],
    ['corto',       '123'],
    ['con letras',  'abc123'],
  ])('código %s → 400 y no se abre transacción', async (_, codigo) => {
    const res = resDoble()
    await ctrl.validar(reqDoble({ codigo }), res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  // El mensaje no puede distinguir «este vehículo no tiene códigos» de «el
  // código es otro»: lo primero le diría a quien tantea dónde seguir.
  test('código inexistente → 400 genérico, igual que si el vehículo no tuviera ninguno', async () => {
    // Dos vehículos distintos para que el intento fallido de uno no cuente
    // contra el otro y las dos respuestas sean comparables.
    autorizaciones = []
    const sinCodigos = resDoble()
    await ctrl.validar(reqDoble({ codigo: '123456' }, { id: '7' }), sinCodigos, jest.fn())

    autorizaciones = [{ id: 9, vehiculo_id: 8, codigo: '999999', expira_at: FUTURO() }]
    const conOtroCodigo = resDoble()
    await ctrl.validar(reqDoble({ codigo: '123456' }, { id: '8' }), conOtroCodigo, jest.fn())

    expect(sinCodigos.codigo).toBe(400)
    expect(conOtroCodigo.codigo).toBe(400)
    expect(sinCodigos.cuerpo).toEqual(conOtroCodigo.cuerpo)
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test('código vencido → lo marca EXPIRADO y 400', async () => {
    autorizaciones = [{ id: 9, vehiculo_id: 7, codigo: '123456', expira_at: PASADO() }]
    const res = resDoble()

    await ctrl.validar(reqDoble({ codigo: '123456' }), res, jest.fn())

    const upd = sqlDe(/UPDATE h360_desinf_autorizacion/i).find(q => /'EXPIRADO'/.test(q.sql))
    expect(upd).toBeDefined()
    expect(upd.params).toEqual([9])
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.mensaje).toBe('El código ha expirado. Solicita uno nuevo.')
    // No activa nada.
    expect(db.getConnection).not.toHaveBeenCalled()
  })
})

describe('validar: el código correcto sube el vehículo', () => {
  let conn
  beforeEach(() => {
    autorizaciones = [{ id: 9, vehiculo_id: 7, codigo: '123456', expira_at: FUTURO() }]
    conn = connDoble()
    db.getConnection = jest.fn(async () => conn)
  })

  test('marca USADO con usado_por/usado_at y activa el vehículo en la MISMA transacción', async () => {
    const res = resDoble()
    await ctrl.validar(reqDoble({ codigo: '123456' }), res, jest.fn())

    expect(res.codigo).toBe(200)
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1)

    const usado = conn.consultas.find(q => /UPDATE h360_desinf_autorizacion/i.test(q.sql))
    expect(usado).toBeDefined()
    expect(usado.sql).toMatch(/estado = 'USADO'/)
    expect(usado.sql).toMatch(/usado_por = \?/)
    expect(usado.sql).toMatch(/usado_at = NOW\(\)/)
    // Solo consume uno que siga ENVIADO: cierra la carrera de dos validaciones
    // simultáneas con el mismo código.
    expect(usado.sql).toMatch(/estado = 'ENVIADO'/)
    expect(usado.params).toEqual(['ASESOR1', 9])

    const activa = conn.consultas.find(q => /UPDATE vehiculos/i.test(q.sql))
    expect(activa).toBeDefined()
    expect(activa.sql).toMatch(/activo = 1/)
    for (const campo of ['inactivo_origen', 'inactivo_motivo', 'inactivo_at', 'inactivo_por'])
      expect(activa.sql).toMatch(new RegExp(`${campo} = NULL`))
    expect(activa.params).toEqual(['7'])

    // Las dos escrituras van por la conexión de la transacción, no por el pool.
    expect(sqlDe(/UPDATE vehiculos/i)).toHaveLength(0)
    expect(conn.commits).toBe(1)
    expect(conn.rollbacks).toBe(0)
    expect(conn.liberada).toBe(true)
  })

  // Sin esto, mañana alguien reporta como bug que el vehículo volvió a caerse.
  test('la respuesta avisa que la desinfección sigue vencida', async () => {
    const res = resDoble()
    await ctrl.validar(reqDoble({ codigo: '123456' }), res, jest.fn())

    expect(res.cuerpo.ok).toBe(true)
    expect(res.cuerpo.autorizacion_id).toBe(9)
    expect(res.cuerpo.aviso).toMatch(/vencida/i)
    expect(res.cuerpo.aviso).toMatch(/no la registra|no registra/i)
    expect(res.cuerpo.aviso).toMatch(/inhabilitar/i)
  })

  // Activar por código es permiso para hoy, no un perdón: no se registra la
  // actividad ni se mueve la programación.
  test('no registra la desinfección ni toca la programación', async () => {
    await ctrl.validar(reqDoble({ codigo: '123456' }), resDoble(), jest.fn())
    const todas = [...consultas, ...conn.consultas].map(q => q.sql).join('\n')
    expect(todas).not.toMatch(/h360_desinf_registro/i)
    expect(todas).not.toMatch(/h360_desinf_programacion/i)
  })

  test('si el código ya fue consumido en paralelo no activa nada', async () => {
    conn = connDoble({ afectadas: 0 })
    db.getConnection = jest.fn(async () => conn)
    const res = resDoble()

    await ctrl.validar(reqDoble({ codigo: '123456' }), res, jest.fn())

    expect(res.codigo).toBe(400)
    expect(conn.consultas.find(q => /UPDATE vehiculos/i.test(q.sql))).toBeUndefined()
    expect(conn.commits).toBe(0)
    expect(conn.rollbacks).toBe(1)
    expect(conn.liberada).toBe(true)
  })
})

describe('validar: no deja el código quemado sin haber activado', () => {
  test('si el UPDATE del vehículo falla hay rollback, release y el código NO queda USADO', async () => {
    autorizaciones = [{ id: 9, vehiculo_id: 7, codigo: '123456', expira_at: FUTURO() }]
    const conn = connDoble({ fallaEn: 'UPDATE vehiculos' })
    db.getConnection = jest.fn(async () => conn)
    const next = jest.fn()

    await ctrl.validar(reqDoble({ codigo: '123456' }), resDoble(), next)

    expect(conn.rollbacks).toBe(1)
    // El USADO viajó por la transacción deshecha; sin commit no queda escrito.
    expect(conn.commits).toBe(0)
    expect(conn.liberada).toBe(true)
    expect(next).toHaveBeenCalled()
    // Y nada se escribió por fuera de la transacción, que es lo que el
    // rollback no podría deshacer.
    expect(sqlDe(/UPDATE h360_desinf_autorizacion/i).some(q => /'USADO'/.test(q.sql))).toBe(false)
  })

  test('la conexión siempre se libera', async () => {
    autorizaciones = [{ id: 9, vehiculo_id: 7, codigo: '123456', expira_at: FUTURO() }]
    const conn = connDoble({ fallaEn: 'UPDATE h360_desinf_autorizacion' })
    db.getConnection = jest.fn(async () => conn)
    await ctrl.validar(reqDoble({ codigo: '123456' }), resDoble(), jest.fn())
    expect(conn.liberada).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Tope de intentos: seis dígitos sin límite se agotan por fuerza bruta.
// ═══════════════════════════════════════════════════════════════════════════
describe('validar: tope de intentos fallidos por vehículo', () => {
  const MAX = () => ctrl.MAX_INTENTOS_VALIDAR

  test('el tope es un número razonable y está expuesto', () => {
    expect(Number.isInteger(MAX())).toBe(true)
    expect(MAX()).toBeGreaterThan(0)
    expect(MAX()).toBeLessThanOrEqual(10)
  })

  test(`a los N intentos se bloquea y el código queda anulado`, async () => {
    autorizaciones = [{ id: 9, vehiculo_id: 7, codigo: '999999', expira_at: FUTURO() }]

    for (let i = 1; i < MAX(); i++) {
      const res = resDoble()
      await ctrl.validar(reqDoble({ codigo: '123456' }), res, jest.fn())
      expect(res.codigo).toBe(400)
    }

    const ultimo = resDoble()
    await ctrl.validar(reqDoble({ codigo: '123456' }), ultimo, jest.fn())
    expect(ultimo.codigo).toBe(429)
    expect(ultimo.cuerpo.bloqueado).toBe(true)

    // El bloqueo queda en la base y no solo en memoria: así sobrevive a un
    // reinicio del proceso y «pide uno nuevo» es verdad.
    const cancela = sqlDe(/UPDATE h360_desinf_autorizacion/i).filter(q => /'CANCELADO'/.test(q.sql))
    expect(cancela).toHaveLength(1)
    expect(cancela[0].params).toEqual(['7'])

    // Ya bloqueado, ni se consulta la base.
    const consultasAntes = consultas.length
    const despues = resDoble()
    await ctrl.validar(reqDoble({ codigo: '999999' }), despues, jest.fn())
    expect(despues.codigo).toBe(429)
    expect(consultas).toHaveLength(consultasAntes)
    expect(db.getConnection).not.toHaveBeenCalled()
  })

  test('el bloqueo es por vehículo: no arrastra a los demás', async () => {
    for (let i = 0; i < MAX(); i++)
      await ctrl.validar(reqDoble({ codigo: '123456' }, { id: '7' }), resDoble(), jest.fn())

    const otro = resDoble()
    await ctrl.validar(reqDoble({ codigo: '123456' }, { id: '8' }), otro, jest.fn())
    expect(otro.codigo).toBe(400)
  })

  test('pedir un código nuevo levanta el bloqueo', async () => {
    for (let i = 0; i < MAX(); i++)
      await ctrl.validar(reqDoble({ codigo: '123456' }), resDoble(), jest.fn())

    await ctrl.solicitar(reqDoble({ motivo: MOTIVO }), resDoble(), jest.fn())

    const res = resDoble()
    await ctrl.validar(reqDoble({ codigo: '123456' }), res, jest.fn())
    expect(res.codigo).toBe(400)
  })

  // Un código correcto que llegó tarde no es un tanteo.
  test('un código vencido no gasta intentos', async () => {
    autorizaciones = [{ id: 9, vehiculo_id: 7, codigo: '123456', expira_at: PASADO() }]
    for (let i = 0; i < MAX() + 2; i++) {
      const res = resDoble()
      await ctrl.validar(reqDoble({ codigo: '123456' }), res, jest.fn())
      expect(res.codigo).toBe(400)
    }
  })

  test('un código válido limpia la cuenta', async () => {
    autorizaciones = [{ id: 9, vehiculo_id: 7, codigo: '123456', expira_at: FUTURO() }]
    for (let i = 1; i < MAX(); i++)
      await ctrl.validar(reqDoble({ codigo: '000000' }), resDoble(), jest.fn())

    const ok = resDoble()
    await ctrl.validar(reqDoble({ codigo: '123456' }), ok, jest.fn())
    expect(ok.codigo).toBe(200)

    const siguiente = resDoble()
    await ctrl.validar(reqDoble({ codigo: '000000' }), siguiente, jest.fn())
    expect(siguiente.codigo).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// listarAutorizaciones — el rastro de auditoría
// ═══════════════════════════════════════════════════════════════════════════
describe('listarAutorizaciones', () => {
  let sql, params
  beforeEach(() => {
    sql = null; params = null
    db.query = jest.fn(async (s, p) => { sql = s; params = p; return [[]] })
  })

  test('sin filtros: trae el historial con tope de 200', async () => {
    const res = resDoble()
    await ctrl.listarAutorizaciones(reqDoble({}, {}, {}), res, jest.fn())
    expect(sql).toMatch(/FROM h360_desinf_autorizacion/i)
    expect(sql).toMatch(/LIMIT 200/)
    expect(sql).not.toMatch(/WHERE/i)
    expect(params).toEqual([])
    expect(res.cuerpo.limite).toBe(200)
  })

  // Quién levantó qué vehículo, cuándo y con qué motivo.
  test('trae placa, motivo, estado y quién lo pidió y lo usó', async () => {
    await ctrl.listarAutorizaciones(reqDoble({}, {}, {}), resDoble(), jest.fn())
    for (const col of ['placa', 'a.motivo', 'a.estado', 'a.solicitado_por', 'a.usado_por'])
      expect(sql).toContain(col)
  })

  // Un código ENVIADO listado acá es un código regalado a quien abra el
  // historial, y lo abren perfiles que no piden autorizaciones.
  test('NO devuelve el código', async () => {
    await ctrl.listarAutorizaciones(reqDoble({}, {}, {}), resDoble(), jest.fn())
    expect(sql).not.toMatch(/a\.codigo/)
  })

  // El pool no tiene dateStrings: un Date se serializa en UTC y las de la
  // noche se mostrarían un día antes.
  test.each([['created_at'], ['expira_at'], ['usado_at']])('%s se formatea en SQL', async col => {
    await ctrl.listarAutorizaciones(reqDoble({}, {}, {}), resDoble(), jest.fn())
    expect(sql).toMatch(new RegExp(`DATE_FORMAT\\(a\\.${col},\\s*'[^']+'\\)\\s*AS ${col}`))
  })

  test('filtra por vehículo y por rango de fechas', async () => {
    await ctrl.listarAutorizaciones(
      reqDoble({}, {}, { vehiculo_id: '7', desde: '2026-11-01', hasta: '2026-11-09' }),
      resDoble(), jest.fn())

    expect(sql).toMatch(/a\.vehiculo_id = \?/)
    expect(sql).toMatch(/a\.created_at >= \?/)
    // El corte va con el día siguiente: `<= hasta` compara contra la
    // medianoche y dejaría fuera todo lo del propio día.
    expect(sql).toMatch(/a\.created_at < DATE_ADD\(\?, INTERVAL 1 DAY\)/)
    expect(params).toEqual([7, '2026-11-01 00:00:00', '2026-11-09'])
  })

  test.each([
    ['vehiculo_id', { vehiculo_id: 'abc' }],
    ['desde',       { desde: '01/11/2026' }],
    ['hasta',       { hasta: 'ayer' }],
  ])('%s con basura → 400 y no consulta', async (campo, query) => {
    const res = resDoble()
    await ctrl.listarAutorizaciones(reqDoble({}, {}, query), res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe(campo)
    expect(db.query).not.toHaveBeenCalled()
  })
})
