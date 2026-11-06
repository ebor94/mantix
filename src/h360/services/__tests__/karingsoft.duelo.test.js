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

// Devuelve el error con que se rechazó la promesa. Si la promesa se resuelve,
// falla con un mensaje propio: así una prueba de «lanza» que no lanza se ve como
// lo que es y no se confunde con un fallo de la aserción siguiente.
const rechazo = async promesa => {
  try { await promesa } catch (e) { return e }
  throw new Error('se esperaba que la promesa se rechazara y se resolvió')
}

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

    // El controlador responde 400 con el mensaje cuando ve err.status === 400
    // (mismo patrón que malUso en duelo.service); sin eso, una fecha mal escrita
    // por un usuario sale como un error 500 del servidor.
    test.each(casos)('$caso: el error lleva status 400', async ({ desde, hasta }) => {
      const err = await rechazo(ks.ordenesDelRango(desde, hasta))
      expect(err.status).toBe(400)
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

  // Una fecha que excede el VarChar(10) declarado revienta en el driver con el
  // mismo error de TDS que en ordenesDelRango, y aquí es alcanzable desde la API:
  // el controlador pasa ?fecha_fallecimiento= y ?fecha_hasta= tal cual. Debe ser
  // un error con status 400 que diga qué campo y qué llegó, no un 500.
  describe('con una fecha de fallecimiento malformada', () => {
    const casos = [
      { caso: 'texto libre en fechaDesde',    criterios: { fechaDesde: 'cualquier-cosa' },        malo: 'fechaDesde' },
      { caso: 'texto libre en fechaHasta',    criterios: { fechaHasta: 'cualquier-cosa' },        malo: 'fechaHasta' },
      { caso: 'formato dd/mm/aaaa',           criterios: { fechaDesde: '4/11/2026' },             malo: 'fechaDesde' },
      { caso: 'mes y día sin cero',           criterios: { fechaHasta: '2026-1-5' },              malo: 'fechaHasta' },
      { caso: 'con hora',                     criterios: { fechaDesde: '2026-11-04T00:00:00' },   malo: 'fechaDesde' },
      { caso: 'más de 10 caracteres',         criterios: { fechaHasta: '2026-11-05 y algo más' }, malo: 'fechaHasta' },
      { caso: 'número',                       criterios: { fechaDesde: 20261104 },                malo: 'fechaDesde' },
      { caso: 'mala solo la segunda, con los demás criterios bien',
        criterios: { contrato: 'A-20538', nombre: 'prada', fechaDesde: '2026-11-01', fechaHasta: 'tampoco' }, malo: 'fechaHasta' },
      { caso: 'las dos mal: nombra la primera', criterios: { fechaDesde: 'x', fechaHasta: 'y' },  malo: 'fechaDesde' },
    ]

    test.each(casos)('$caso: lanza un Error 400 en español que nombra el campo y no consulta', async ({ criterios, malo }) => {
      const err = await rechazo(ks.buscarOrdenes(criterios))
      expect(err).toBeInstanceOf(Error)
      expect(err.status).toBe(400)
      expect(err.message).toMatch(/YYYY-MM-DD/)
      expect(err.message).toMatch(/debe ser una fecha/)
      expect(err.message).toContain(`"${malo}"`)
      // dice cuál función falló, no el nombre de la otra
      expect(err.message).toMatch(/^buscarOrdenes:/)
      expect(consultas).toHaveLength(0)
    })

    test('el mensaje muestra lo que llegó', async () => {
      const err = await rechazo(ks.buscarOrdenes({ fechaDesde: 'cualquier-cosa' }))
      expect(err.message).toContain('"cualquier-cosa"')
    })

    test('se valida antes de pedir la conexión', async () => {
      delete process.env.KS_HOST
      const err = await rechazo(ks.buscarOrdenes({ fechaDesde: 'cualquier-cosa' }))
      expect(err.message).toMatch(/YYYY-MM-DD/)
    })

    // Guarda de lo que ya funcionaba (pasa también sin la validación, a
    // propósito): el formulario puede mandar la fecha con espacios alrededor y
    // hasta hoy se recortaba y se aceptaba.
    test('una fecha válida con espacios alrededor se sigue aceptando, recortada', async () => {
      await ks.buscarOrdenes({ fechaDesde: ' 2026-11-01 ', fechaHasta: '2026-11-05\n' })
      expect(consultas[0].params).toEqual({ p_f_desde: '2026-11-01', p_f_hasta: '2026-11-05' })
    })
  })

  // p_nombre es VarChar(200): un patrón más largo revienta en el driver con el
  // mismo error de TDS. Lo que se ata es «%» + término escapado + «%», ya en
  // mayúsculas y con los espacios colapsados, y es ESO lo que no puede pasar de
  // 200: medir el texto crudo no garantiza nada, porque escapar lo alarga.
  describe('con un nombre cuyo patrón no cabe en VarChar(200)', () => {
    const LIMITE = 200

    test('un nombre de 300 caracteres lanza un Error 400 que dice que es demasiado largo y cuál es el máximo, y no consulta', async () => {
      const err = await rechazo(ks.buscarOrdenes({ nombre: 'a'.repeat(300) }))
      expect(err).toBeInstanceOf(Error)
      expect(err.status).toBe(400)
      expect(err.message).toMatch(/^buscarOrdenes:/)
      expect(err.message).toMatch(/demasiado largo/)
      expect(err.message).toContain(String(LIMITE))
      expect(consultas).toHaveLength(0)
    })

    // 198 letras + los dos % de cierre = 200 justos; con 199 ya no cabe.
    test('el límite exacto: 198 letras caben (el patrón queda en 200) y 199 no', async () => {
      await ks.buscarOrdenes({ nombre: 'a'.repeat(198) })
      expect(consultas[0].params.p_nombre).toHaveLength(LIMITE)
      const err = await rechazo(ks.buscarOrdenes({ nombre: 'a'.repeat(199) }))
      expect(err.status).toBe(400)
      expect(consultas).toHaveLength(1)
    })

    // El caso que motivó medir el patrón: 150 caracteres caben crudos (150 <= 200)
    // pero cada % se vuelve \% y el patrón llega a 302.
    test('150 símbolos % caben crudos pero no al escaparse: lanza 400 y no consulta', async () => {
      const err = await rechazo(ks.buscarOrdenes({ nombre: '%'.repeat(150) }))
      expect(err.status).toBe(400)
      expect(err.message).toMatch(/demasiado largo/)
      expect(consultas).toHaveLength(0)
    })

    // 99 % escapados = 198, más los dos de cierre = 200 justos; con 100 ya no.
    test('el límite con escape: 99 símbolos % caben (el patrón queda en 200) y 100 no', async () => {
      await ks.buscarOrdenes({ nombre: '%'.repeat(99) })
      expect(consultas[0].params.p_nombre).toHaveLength(LIMITE)
      const err = await rechazo(ks.buscarOrdenes({ nombre: '%'.repeat(100) }))
      expect(err.status).toBe(400)
      expect(consultas).toHaveLength(1)
    })

    // toUpperCase también alarga: 'ß' pasa a 'SS'. Se mide después de pasar a
    // mayúsculas, que es lo que se ata.
    test('se mide después de pasar a mayúsculas: 99 ß caben (198 + 2) y 100 ß no (200 + 2)', async () => {
      await ks.buscarOrdenes({ nombre: 'ß'.repeat(99) })
      expect(consultas[0].params.p_nombre).toHaveLength(LIMITE)
      const err = await rechazo(ks.buscarOrdenes({ nombre: 'ß'.repeat(100) }))
      expect(err.status).toBe(400)
      expect(consultas).toHaveLength(1)
    })

    // Y al revés: lo que cuenta es lo que se ata, no lo que se escribió. Los
    // espacios repetidos se colapsan antes de atar.
    test('se mide lo que se ata, no lo que se escribió: 300 espacios entre dos letras caben', async () => {
      await ks.buscarOrdenes({ nombre: 'a' + ' '.repeat(300) + 'b' })
      expect(consultas[0].params.p_nombre).toBe('%A B%')
    })

    // Barrido del invariante, con una mezcla de letra, tilde, Ñ y los cuatro
    // caracteres que se escapan: nunca se ata un patrón de más de 200, y se
    // rechaza exactamente cuando el patrón no cabe.
    test('barrido: nunca se ata un patrón de más de 200 y se rechaza justo cuando no cabe', async () => {
      const mezcla = 'a%ñ_é[b\\'
      for (let n = 1; n <= 260; n++) {
        const nombre = mezcla.repeat(Math.ceil(n / mezcla.length)).slice(0, n)
        const patron = 2 + [...nombre.toUpperCase()].reduce((t, c) => t + ('\\%_['.includes(c) ? 2 : 1), 0)
        consultas.length = 0
        if (patron <= LIMITE) {
          await ks.buscarOrdenes({ nombre })
          expect(consultas).toHaveLength(1)
          expect(consultas[0].params.p_nombre.length).toBe(patron)
          expect(consultas[0].params.p_nombre.length).toBeLessThanOrEqual(LIMITE)
        } else {
          const err = await rechazo(ks.buscarOrdenes({ nombre }))
          expect(err.status).toBe(400)
          expect(consultas).toHaveLength(0)
        }
      }
    })
  })
})
