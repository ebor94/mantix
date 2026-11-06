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

  // Una fecha que excede el VarChar(10) declarado revienta en el driver con un
  // error de TDS que nadie sabe leer en un log. Una fecha malformada es un error
  // de programación: se lanza, no se devuelve vacío, porque vacío lo esconde.
  describe('con una fecha malformada', () => {
    const casos = [
      { caso: 'ambas texto libre',          desde: 'no-es-fecha',         hasta: 'tampoco',    malo: 'desde' },
      { caso: 'solo desde mal',             desde: 'no-es-fecha',         hasta: '2026-11-05', malo: 'desde' },
      { caso: 'solo hasta mal',             desde: '2026-11-04',          hasta: 'tampoco',    malo: 'hasta' },
      { caso: 'formato dd/mm/aaaa',         desde: '4/11/2026',           hasta: '2026-11-05', malo: 'desde' },
      { caso: 'mes y día sin cero',         desde: '2026-11-04',          hasta: '2026-1-5',   malo: 'hasta' },
      { caso: 'con hora',                   desde: '2026-11-04T00:00:00', hasta: '2026-11-05', malo: 'desde' },
      { caso: 'con espacio al inicio',      desde: ' 2026-11-04',         hasta: '2026-11-05', malo: 'desde' },
      { caso: 'con salto de línea al final', desde: '2026-11-04',         hasta: '2026-11-05\n', malo: 'hasta' },
      { caso: 'vacía',                      desde: '',                    hasta: '2026-11-05', malo: 'desde' },
      { caso: 'undefined',                  desde: undefined,             hasta: '2026-11-05', malo: 'desde' },
      { caso: 'null',                       desde: '2026-11-04',          hasta: null,         malo: 'hasta' },
      { caso: 'número',                     desde: 20261104,              hasta: '2026-11-05', malo: 'desde' },
    ]

    test.each(casos)('$caso: lanza un Error en español que dice qué se esperaba y no consulta', async ({ desde, hasta, malo }) => {
      const promesa = ks.ordenesDelRango(desde, hasta)
      await expect(promesa).rejects.toBeInstanceOf(Error)
      await expect(promesa).rejects.toThrow(/YYYY-MM-DD/)
      await expect(promesa).rejects.toThrow(/debe ser una fecha/)
      // nombra el parámetro culpable, para no tener que adivinar cuál de los dos
      await expect(promesa).rejects.toThrow(new RegExp(`"${malo}"`))
      expect(consultas).toHaveLength(0)
    })

    // Si la validación viniera después de pedir la conexión, sin ERP configurado
    // el error sería el de la conexión y el verdadero problema quedaría tapado.
    test('se valida antes de pedir la conexión', async () => {
      delete process.env.KS_HOST
      await expect(ks.ordenesDelRango('no-es-fecha', 'tampoco')).rejects.toThrow(/YYYY-MM-DD/)
    })
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

  // Defecto 1. La columna y el servidor usan SQL_Latin1_General_CP1_CI_AS:
  // ignora mayúsculas pero distingue tildes, y los datos están guardados sin
  // tildes pero con Ñ. Resultado medido en producción: 'rodríguez' daba 0 y
  // 'rodriguez' daba 2130. El COLLATE va en los dos lados para no depender de
  // las reglas de precedencia de colaciones.
  test('por nombre compara sin distinguir tildes: COLLATE SQL_Latin1_General_CP1_CI_AI en los dos lados', async () => {
    await ks.buscarOrdenes({ nombre: 'rodríguez' })
    const { sql } = consultas[0]
    const colacion = 'SQL_Latin1_General_CP1_CI_AI'
    // lado izquierdo: la expresión concatenada completa (cierra con paréntesis)
    expect(sql).toMatch(new RegExp(`\\)\\s*COLLATE\\s+${colacion}\\s+LIKE\\s+@p_nombre`))
    // lado derecho: el parámetro
    expect(sql).toMatch(new RegExp(`@p_nombre\\s+COLLATE\\s+${colacion}\\s+ESCAPE`))
    // ni de más ni de menos: exactamente esos dos
    expect(sql.match(/COLLATE/g)).toHaveLength(2)
    // la sensible a tildes es la que no queremos; la española trata la Ñ como
    // letra aparte de la N y rompe 'munoz'
    expect(sql).not.toMatch(/Modern_Spanish|CI_AS\b/)
  })

  // Guarda contra el «arreglo» equivocado. Quitar diacríticos en JavaScript
  // (normalize('NFD')) convierte la Ñ en N: 'muñoz' dejaría de encontrar los
  // 262 MUÑOZ que hoy sí encuentra. Esta prueba pasa también sin el defecto 1
  // arreglado, a propósito: protege lo que ya funciona, no mide el defecto.
  test('no normaliza el término en JavaScript: la Ñ y las tildes llegan tal cual a la base', async () => {
    await ks.buscarOrdenes({ nombre: 'muñoz' })
    await ks.buscarOrdenes({ nombre: 'rodríguez' })
    expect(consultas[0].params.p_nombre).toBe('%MUÑOZ%')
    expect(consultas[1].params.p_nombre).toBe('%RODRÍGUEZ%')
  })

  // Defecto 2. Los parámetros van atados, así que no es inyección, pero un %,
  // un _ o un [ que escriba la psicóloga actuaba como comodín de LIKE: '%'
  // devolvía el tope de 200 en vez de nada.
  test.each([
    ['%',        '%\\%%'],
    ['_a',       '%\\_A%'],
    ['[ab]',     '%\\[AB]%'],
    ['100%',     '%100\\%%'],
    ['a_b%c[d',  '%A\\_B\\%C\\[D%'],
    // el propio carácter de escape también se escapa: si no, un término que
    // termine en \ escaparía el % de cierre y buscaría un % literal
    ['a\\b',     '%A\\\\B%'],
    ['ab\\',     '%AB\\\\%'],
  ])('escapa los comodines de LIKE en el término %j', async (nombre, esperado) => {
    await ks.buscarOrdenes({ nombre })
    expect(consultas[0].params.p_nombre).toBe(esperado)
  })

  test('el SQL declara el carácter de escape con ESCAPE', async () => {
    await ks.buscarOrdenes({ nombre: '50%' })
    expect(consultas[0].sql).toMatch(/@p_nombre(\s+COLLATE\s+\S+)?\s+ESCAPE\s+'\\'/)
  })
})
