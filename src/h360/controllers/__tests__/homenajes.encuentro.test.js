// La fecha y hora de encuentro al registrar un homenaje.
//
// Dos cosas se cuidan acá. Una, que el endpoint no acepte un homenaje sin la
// cita: la pantalla ya la exige, pero el endpoint lo llama cualquier cliente.
// Dos, que la fecha y el homenaje se guarden juntos o no se guarden: si el
// insert pasara y el update de la asistencia fallara, quedaría el homenaje
// registrado y la cita perdida en silencio, que es justo el caso que nadie
// nota hasta que una familia llega a la hora equivocada.

jest.mock('../../config/db')
jest.mock('../../services/sync_gestion.service', () => ({
  syncFromIngreso: jest.fn(), syncFromVisita: jest.fn(), syncFromSalida: jest.fn(),
}))
jest.mock('../../services/novedades.service', () => ({}))
jest.mock('../../../services/whatsappService', () => ({ sendOTP: jest.fn() }))
jest.mock('../asistencias.controller', () => ({
  avanzarPorEvento: jest.fn().mockResolvedValue({ ok: true }),
  rolDelConductor: jest.fn(),
}))

const db = require('../../config/db')
const sala = require('../homenajes_sala.controller')
const residencia = require('../homenajes_residencia.controller')

// ── Dobles de Express ──────────────────────────────────────────────────────
function resDoble() {
  const r = { codigo: null, cuerpo: null }
  r.status = c => { r.codigo = c; return r }
  r.json = b => { r.cuerpo = b; return r }
  return r
}
const reqDoble = body => ({ body, user: { usuario: 'TESTER', nombre: 'Tester', rol: 'supervisora' } })

// Conexión de transacción simulada: guarda las consultas para poder afirmar
// qué se escribió, y permite hacer fallar una a propósito.
function connDoble({ fallaEn = null } = {}) {
  const c = {
    consultas: [],
    commits: 0,
    rollbacks: 0,
    liberada: false,
    beginTransaction: jest.fn(),
    commit: jest.fn(() => { c.commits++ }),
    rollback: jest.fn(() => { c.rollbacks++; return Promise.resolve() }),
    release: jest.fn(() => { c.liberada = true }),
  }
  c.query = jest.fn(async (sql, params) => {
    c.consultas.push({ sql, params })
    if (fallaEn && sql.includes(fallaEn)) throw new Error('fallo simulado de base')
    if (/^INSERT/i.test(sql.trim())) return [{ insertId: 777 }]
    if (/^SELECT/i.test(sql.trim())) return [[{ id: 777, asistencia_id: 5 }]]
    return [{ affectedRows: 1 }]
  })
  return c
}

const VALIDA = '2026-11-04T14:30'

beforeEach(() => {
  jest.clearAllMocks()
  // Los chequeos previos de cada crear: la asistencia y la sala existen, y no
  // hay homenajes que estorben.
  db.query = jest.fn(async sql => {
    if (/FROM asistencias/i.test(sql))     return [[{ id: 5 }]]
    if (/FROM salas_velacion/i.test(sql))  return [[{ id: 3 }]]
    return [[]]
  })
})

// ── Lo que rechaza ─────────────────────────────────────────────────────────
describe('el encuentro es obligatorio para registrar un homenaje', () => {
  const casos = [
    ['ausente',    undefined],
    ['vacío',      ''],
    ['solo fecha', '2026-11-04'],
    ['imposible',  '2026-02-31T14:30'],
  ]

  test.each(casos)('sala lo rechaza si viene %s', async (_, valor) => {
    const res = resDoble()
    await sala.crear(reqDoble({ asistencia_id: 5, sala_id: 3, fecha_hora_encuentro: valor }), res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('fecha_hora_encuentro')
  })

  test.each(casos)('residencia lo rechaza si viene %s', async (_, valor) => {
    const res = resDoble()
    await residencia.crear(reqDoble({ asistencia_id: 5, fecha_hora_encuentro: valor }), res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.campo).toBe('fecha_hora_encuentro')
  })

  // Rechazar es barato; rechazar después de haber escrito, no. Nada debe
  // haberse insertado cuando falta la cita.
  test('al rechazar no se abre ninguna transacción', async () => {
    await sala.crear(reqDoble({ asistencia_id: 5, sala_id: 3 }), resDoble(), jest.fn())
    expect(db.getConnection).not.toHaveBeenCalled()
  })
})

// ── Lo que guarda ──────────────────────────────────────────────────────────
describe('la cita se guarda en la asistencia, junto con el homenaje', () => {
  test('sala: inserta el homenaje y escribe la fecha normalizada', async () => {
    const conn = connDoble()
    db.getConnection = jest.fn().mockResolvedValue(conn)
    const res = resDoble()

    await sala.crear(reqDoble({
      asistencia_id: 5, sala_id: 3, fecha_hora_encuentro: VALIDA,
    }), res, jest.fn())

    expect(res.codigo).toBe(201)
    const update = conn.consultas.find(q => /UPDATE asistencias/i.test(q.sql))
    expect(update).toBeDefined()
    // La hora escrita es la que se tecleó: ni corrida a UTC ni con la T del input.
    expect(update.params[0]).toBe('2026-11-04 14:30:00')
    expect(update.params[1]).toBe(5)
    expect(conn.commits).toBe(1)
    expect(conn.rollbacks).toBe(0)
    expect(conn.liberada).toBe(true)
  })

  test('residencia: inserta el homenaje y escribe la fecha normalizada', async () => {
    const conn = connDoble()
    db.getConnection = jest.fn().mockResolvedValue(conn)
    const res = resDoble()

    await residencia.crear(reqDoble({
      asistencia_id: 5, fecha_hora_encuentro: VALIDA,
    }), res, jest.fn())

    expect(res.codigo).toBe(201)
    const update = conn.consultas.find(q => /UPDATE asistencias/i.test(q.sql))
    expect(update.params[0]).toBe('2026-11-04 14:30:00')
    expect(conn.commits).toBe(1)
  })

  test('acepta el formato con espacio, no solo el del input', async () => {
    const conn = connDoble()
    db.getConnection = jest.fn().mockResolvedValue(conn)
    await sala.crear(reqDoble({
      asistencia_id: 5, sala_id: 3, fecha_hora_encuentro: '2026-11-04 08:05:00',
    }), resDoble(), jest.fn())
    const update = conn.consultas.find(q => /UPDATE asistencias/i.test(q.sql))
    expect(update.params[0]).toBe('2026-11-04 08:05:00')
  })
})

// ── Lo que no deja a medias ────────────────────────────────────────────────
describe('si algo falla no queda un homenaje sin su cita', () => {
  test('sala: si el update de la asistencia falla, se deshace el insert', async () => {
    const conn = connDoble({ fallaEn: 'UPDATE asistencias' })
    db.getConnection = jest.fn().mockResolvedValue(conn)
    const next = jest.fn()

    await sala.crear(reqDoble({
      asistencia_id: 5, sala_id: 3, fecha_hora_encuentro: VALIDA,
    }), resDoble(), next)

    expect(conn.rollbacks).toBe(1)
    expect(conn.commits).toBe(0)
    expect(conn.liberada).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  test('residencia: si el update de la asistencia falla, se deshace el insert', async () => {
    const conn = connDoble({ fallaEn: 'UPDATE asistencias' })
    db.getConnection = jest.fn().mockResolvedValue(conn)
    const next = jest.fn()

    await residencia.crear(reqDoble({
      asistencia_id: 5, fecha_hora_encuentro: VALIDA,
    }), resDoble(), next)

    expect(conn.rollbacks).toBe(1)
    expect(conn.commits).toBe(0)
    expect(next).toHaveBeenCalled()
  })

  // La conexión se devuelve al pool incluso cuando todo falla: sin esto el
  // pool se agota y el backend deja de responder a las demás peticiones.
  test('la conexión siempre se libera', async () => {
    const conn = connDoble({ fallaEn: 'INSERT' })
    db.getConnection = jest.fn().mockResolvedValue(conn)
    await sala.crear(reqDoble({
      asistencia_id: 5, sala_id: 3, fecha_hora_encuentro: VALIDA,
    }), resDoble(), jest.fn())
    expect(conn.liberada).toBe(true)
  })
})
