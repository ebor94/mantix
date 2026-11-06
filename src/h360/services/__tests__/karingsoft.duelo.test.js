// src/h360/services/__tests__/karingsoft.duelo.test.js
// Las consultas al ERP se prueban por lo que arman y por lo que atan, no
// conectando: la base es de producción y es de otro sistema.

const consultas = []
let filas = []
const requestDoble = () => {
  const r = { params: {} }
  r.input = (nombre, _tipo, valor) => { r.params[nombre] = valor; return r }
  r.query = sql => { consultas.push({ sql, params: r.params }); return { recordset: filas } }
  return r
}

jest.mock('mssql', () => ({
  connect: jest.fn(async () => ({ request: requestDoble })),
  VarChar: () => 'VarChar', Date: 'Date', NVarChar: () => 'NVarChar',
}))

const ks = require('../karingsoft.service')

beforeEach(() => {
  consultas.length = 0
  filas = []
  process.env.KS_HOST = 'x'; process.env.KS_DATABASE = 'y'; process.env.KS_USER = 'z'
})

// Un @parámetro que el SQL nombra y nadie ató (o al revés) no se nota con el
// driver simulado, pero en producción es un error de SQL Server y la bandeja
// de ese día queda vacía.
const nombresEnSql = sql => [...new Set(sql.match(/@p_\w+/g) ?? [])].map(p => p.slice(1)).sort()
const nombresAtados = params => Object.keys(params).sort()

describe('ordenesDelRango', () => {
  test('filtra por tipo_documento 50 y por el rango de fechas', async () => {
    await ks.ordenesDelRango('2026-11-04', '2026-11-05')
    const { sql, params } = consultas[0]
    expect(sql).toMatch(/tipo_documento\s*=\s*50/)
    expect(sql).toContain('salas_ordenes_view')
    expect(params.p_desde).toBe('2026-11-04')
    expect(params.p_hasta).toBe('2026-11-05')
    expect(nombresEnSql(sql)).toEqual(nombresAtados(params))
  })

  // La fecha y la hora salen formateadas desde SQL: mysql2 y mssql devolverían
  // un Date que Express serializa en UTC, y una fecha pelada se reparsea como
  // medianoche UTC, que en Bogotá es el día anterior.
  test('devuelve las fechas ya formateadas como texto', async () => {
    await ks.ordenesDelRango('2026-11-04', '2026-11-05')
    const { sql } = consultas[0]
    expect(sql).toMatch(/CONVERT\(varchar\(10\),\s*o\.fecha,\s*23\)\s+AS\s+fecha_orden/)
    expect(sql).toMatch(/CONVERT\(varchar\(10\),\s*o\.fecha_fallecimiento,\s*23\)\s+AS\s+fecha_fallecimiento/)
  })

  test('devuelve las filas tal como las entrega el ERP', async () => {
    filas = [{ orden_servicio: 'A-20538' }]
    expect(await ks.ordenesDelRango('2026-11-04', '2026-11-05')).toEqual(filas)
  })

  test('nunca escribe en el ERP', async () => {
    await ks.ordenesDelRango('2026-11-04', '2026-11-05')
    expect(consultas[0].sql).not.toMatch(/INSERT|UPDATE|DELETE|MERGE/i)
    expect(consultas[0].sql).toMatch(/^\s*SELECT\b/i)
  })
})

describe('buscarOrdenes', () => {
  test('por contrato, exacto', async () => {
    await ks.buscarOrdenes({ contrato: 'A-20538' })
    expect(consultas[0].params.p_contrato).toBe('A-20538')
    expect(consultas[0].sql).toMatch(/orden_servicio\s*=\s*@p_contrato/)
  })

  test('por nombre, parcial y sobre los tres campos del fallecido', async () => {
    await ks.buscarOrdenes({ nombre: 'prada gomez' })
    expect(consultas[0].sql).toContain('primer_apellido_fallecido')
    expect(consultas[0].sql).toContain('nombres_fallecido')
    expect(consultas[0].params.p_nombre).toBe('%PRADA GOMEZ%')
  })

  test('por fecha de fallecimiento, con rango opcional', async () => {
    await ks.buscarOrdenes({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-05' })
    expect(consultas[0].params.p_f_desde).toBe('2026-11-01')
    expect(consultas[0].params.p_f_hasta).toBe('2026-11-05')
  })

  test('con una sola fecha ata solo esa', async () => {
    await ks.buscarOrdenes({ fechaDesde: '2026-11-01' })
    const { sql, params } = consultas[0]
    expect(params).toEqual({ p_f_desde: '2026-11-01' })
    expect(nombresEnSql(sql)).toEqual(['p_f_desde'])
  })

  test('combina todos los criterios con AND, ata exactamente lo que el SQL nombra y limita a 200', async () => {
    await ks.buscarOrdenes({ contrato: 'A-20538', nombre: 'prada', fechaDesde: '2026-11-01', fechaHasta: '2026-11-05' })
    const { sql, params } = consultas[0]
    expect(nombresAtados(params)).toEqual(['p_contrato', 'p_f_desde', 'p_f_hasta', 'p_nombre'])
    expect(nombresEnSql(sql)).toEqual(nombresAtados(params))
    expect(sql).toMatch(/tipo_documento\s*=\s*50/)
    expect(sql).not.toMatch(/\bOR\b/i)
    expect(sql).toMatch(/SELECT\s+TOP\s+200\b/)
  })

  test('devuelve las filas tal como las entrega el ERP', async () => {
    filas = [{ orden_servicio: 'A-20538' }]
    expect(await ks.buscarOrdenes({ contrato: 'A-20538' })).toEqual(filas)
  })

  test('nunca escribe en el ERP', async () => {
    await ks.buscarOrdenes({ contrato: 'A-20538', nombre: 'prada', fechaDesde: '2026-11-01', fechaHasta: '2026-11-05' })
    expect(consultas[0].sql).not.toMatch(/INSERT|UPDATE|DELETE|MERGE/i)
    expect(consultas[0].sql).toMatch(/^\s*SELECT\b/i)
  })

  test('sin ningún criterio no consulta nada', async () => {
    const r = await ks.buscarOrdenes({})
    expect(r).toEqual([])
    expect(consultas).toHaveLength(0)
  })

  // El caso real no es {}: es un formulario que manda los campos vacíos.
  test('con criterios vacíos o en blanco tampoco consulta', async () => {
    expect(await ks.buscarOrdenes()).toEqual([])
    expect(await ks.buscarOrdenes({ contrato: '  ', nombre: '', fechaDesde: null, fechaHasta: undefined })).toEqual([])
    expect(consultas).toHaveLength(0)
  })
})
