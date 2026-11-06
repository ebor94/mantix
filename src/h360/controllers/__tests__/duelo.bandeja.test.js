// La bandeja del R-56: es el corazón del módulo. Si pierde una orden, una
// familia se queda sin que nadie la llame; si el ERP falla y la bandeja
// responde una lista vacía, parece que «hoy no hay nadie a quien llamar» y
// nadie llama a nadie ese día.
//
// Todo se simula: no hay conexión al ERP ni a MySQL (las tablas h360_duelo_*
// ni siquiera existen todavía en ninguna base).

jest.mock('../../config/db')
jest.mock('../../services/karingsoft.service')
jest.mock('../../services/duelo.service')

const db  = require('../../config/db')
const ks  = require('../../services/karingsoft.service')
const svc = require('../../services/duelo.service')
const { malUso } = require('../../utils/errores')
const ctrl = require('../duelo.controller')
const { ESTADOS_GESTION } = require('../../utils/duelo.catalogos')

const resDoble = () => {
  const r = { codigo: 200, cuerpo: null }
  r.status = c => { r.codigo = c; return r }
  r.json = b => { r.cuerpo = b; return r }
  return r
}

const PSICOLOGA = { rol: 'psicologia' }

// Ejecuta un manejador con una petición mínima y devuelve lo que respondió.
async function llamar(manejador, query = {}) {
  const res = resDoble()
  const next = jest.fn()
  await manejador({ query, user: PSICOLOGA }, res, next)
  return { res, next }
}

// La fila de una orden, o un fallo que diga qué pasó si no está: sin esto, una
// orden perdida se vería como «Cannot read properties of undefined».
function fila(res, orden) {
  const f = res.cuerpo?.data?.find(x => x.orden_servicio === orden)
  if (!f) throw new Error(
    `la orden ${orden} no está en la respuesta (código ${res.codigo}): ${JSON.stringify(res.cuerpo)}`)
  return f
}

// Un rechazo de verdad: 400 con mensaje, sin lista en el cuerpo (una lista vacía
// es justo lo que se quiere evitar) y sin pasar por next, que sería un 500.
function expectRechazo({ res, next }, ...fragmentos) {
  expect(res.codigo).toBe(400)
  expect(res.cuerpo.data).toBeUndefined()
  expect(next).not.toHaveBeenCalled()
  for (const f of fragmentos) expect(res.cuerpo.mensaje).toContain(f)
}

const ORDENES = [
  { orden_servicio: 'A-1', nombre_ser_querido: 'JUAN PEREZ', sede: 'Sede Gran Colombia',
    convenio: 'Planes TRADICIONAL', fecha_fallecimiento: '2026-11-04' },
  { orden_servicio: 'MAS-9', nombre_ser_querido: 'MASCOTA MAX', sede: 'Mascotas',
    convenio: 'Otros Servicios', fecha_fallecimiento: '2026-11-04' },
  // Convenio corriente a propósito: la rama de otra ciudad sale de la SEDE, y un
  // convenio «Olivos <ciudad>» aquí haría pasar por buena una señal que no lo es.
  { orden_servicio: 'A-3', nombre_ser_querido: 'ANA RUIZ', sede: 'Sede Pamplona',
    convenio: 'Planes TRADICIONAL', fecha_fallecimiento: '2026-11-04' },
]

const ASISTENCIA_A1 = {
  id: 77, codigo: 'H360-2026-0315', contrato: 'A-1', estado: 'SALA',
  sala_codigo: 'SALGC06', sede_nombre: 'Gran Colombia',
  // El contacto que el asesor llenó en el F-01: 91 de 336 órdenes del ERP no
  // traen teléfono y H360 tiene uno guardado en el 54% de los casos.
  nombre_contacto: 'ANA PEREZ', telefono_contacto: '3001234567',
}

const ERROR_ERP = Object.assign(new Error('ECONNREFUSED'), { code: 'ESOCKET' })

// Lo que mssql devuelve cuando una conversión falla: el MENSAJE lleva adentro el
// término que se buscó, que en este módulo es el nombre de un ser querido. El
// log de pm2 lo guarda en claro y rotado, así que de un error del ERP solo se
// escribe lo que no es de la familia: el nombre, el código y el número de error.
const ERROR_ERP_CON_NOMBRE = Object.assign(
  new Error("Conversion failed when converting the varchar value 'MARTINEZ GUERRERO' to data type int"),
  { name: 'RequestError', code: 'EREQUEST', number: 245 })

// Todo lo que se escribió en el log, en una sola cadena.
const logEscrito = () => console.warn.mock.calls.map(c => c.join(' ')).join('\n')

beforeEach(() => {
  jest.clearAllMocks()
  // Los 503 dejan una línea de log con la causa; en las pruebas no hace falta
  // verla (la prueba del ERP caído sí comprueba que se escribe).
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  ks.configurado = jest.fn(() => true)
  ks.ordenesDelRango = jest.fn(async () => ORDENES)
  ks.buscarOrdenes = jest.fn(async () => ORDENES)
  svc.gestionesPorOrdenes = jest.fn(async () => new Map())
  db.query = jest.fn(async () => [[]])
})

afterAll(() => { console.warn.mockRestore() })

describe('bandeja', () => {
  test('no pierde ninguna orden del ERP', async () => {
    const { res } = await llamar(ctrl.bandeja)
    expect(res.cuerpo.data.map(f => f.orden_servicio)).toEqual(['A-1', 'MAS-9', 'A-3'])
    expect(res.cuerpo.data).toHaveLength(3)
    expect(res.cuerpo.total).toBe(3)
  })

  // Las mascotas entran marcadas: es decisión del negocio que se trabajen.
  test('marca las mascotas en lugar de esconderlas', async () => {
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'MAS-9').es_mascota).toBe(true)
    expect(res.cuerpo.data.filter(f => !f.es_mascota)).toHaveLength(2)
  })

  // Lo que el ERP no sabe y H360 sí: dónde es el homenaje.
  test('enriquece con la asistencia de H360 cuando el contrato coincide', async () => {
    db.query = jest.fn(async () => [[ASISTENCIA_A1]])
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-1').asistencia.codigo).toBe('H360-2026-0315')
    expect(fila(res, 'A-1').rama).toBe('SALA')
  })

  test('la asistencia lleva solo lo que la bandeja necesita', async () => {
    db.query = jest.fn(async () => [[ASISTENCIA_A1]])
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-1').asistencia).toEqual({
      id: 77, codigo: 'H360-2026-0315', estado: 'SALA',
      ubicacion_tipo: 'SALA', ubicacion_detalle: 'Gran Colombia · SALGC06',
      nombre_contacto: 'ANA PEREZ', telefono_contacto: '3001234567',
    })
  })

  // §11 del diseño: 91 de 336 órdenes del ERP no traen teléfono, y H360 tiene uno
  // guardado en el 54% de los casos. Sin estas dos columnas, para esas 91 el
  // módulo no ofrecía NINGÚN número en ninguna pantalla y la familia quedaba
  // «NO_LOGRADA» teniendo nosotros el teléfono. Los nombres son los de la tabla
  // `asistencias`, sin renombrar: la pantalla los busca así.
  describe('el contacto de la familia que H360 ya tiene', () => {
    test('la consulta pide el nombre y el teléfono del contacto', async () => {
      await llamar(ctrl.bandeja)
      const sql = db.query.mock.calls[0][0]
      expect(sql).toMatch(/\ba\.nombre_contacto\b/)
      expect(sql).toMatch(/\ba\.telefono_contacto\b/)
    })

    test('viajan dentro de asistencia, con el nombre de la tabla', async () => {
      db.query = jest.fn(async () => [[ASISTENCIA_A1]])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-1').asistencia.nombre_contacto).toBe('ANA PEREZ')
      expect(fila(res, 'A-1').asistencia.telefono_contacto).toBe('3001234567')
    })

    // El 46% de las órdenes no tiene caso en H360: ahí no hay contacto que dar y
    // la fila sigue saliendo igual.
    test('una orden sin asistencia no inventa contacto', async () => {
      db.query = jest.fn(async () => [[ASISTENCIA_A1]])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-3').asistencia).toBeNull()
    })

    test('un caso de H360 sin contacto guardado lo entrega nulo', async () => {
      db.query = jest.fn(async () => [[
        { ...ASISTENCIA_A1, nombre_contacto: null, telefono_contacto: null },
      ]])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-1').asistencia.nombre_contacto).toBeNull()
      expect(fila(res, 'A-1').asistencia.telefono_contacto).toBeNull()
    })

    // El ORDER BY está medido contra datos reales de producción: agregar columnas
    // al SELECT no lo toca.
    test('el orden de preferencia de la consulta no cambia', async () => {
      await llamar(ctrl.bandeja)
      const sql = db.query.mock.calls[0][0].replace(/\s+/g, ' ').trim()
      expect(/ORDER BY (.+)$/i.exec(sql)?.[1]).toBe(
        "(a.estado IN ('CERRADO', 'DESISTIDO', 'RECHAZADO')), "
        + '(hs.id IS NULL AND hr.id IS NULL), a.id DESC, hs.id DESC, hr.id DESC')
    })
  })

  // Dos contratos de producción tienen DOS asistencias en H360. Con la consulta
  // sin orden y un Map que se queda con la última fila, `rama` y `asistencia`
  // dependían de qué fila devolvía el motor primero: la bandeja podía decir
  // «sala» cuando el homenaje fue en residencia y mandar a alguien al lugar
  // equivocado. La elección es una decisión visible, no el azar del motor: la
  // consulta ordena (primero la asistencia que no está en un estado terminal,
  // luego la que tiene un homenaje registrado y, entre las que empatan, la más
  // reciente) y el cruce se queda con la PRIMERA fila de cada contrato.
  describe('un contrato con más de una asistencia en H360', () => {
    // Un unit test no ejecuta el ORDER BY (db.query es un doble): lo que se puede
    // fijar es lo que se le pide al motor y qué se hace con las filas que vuelven.
    const CON_HOMENAJE = {
      id: 77, codigo: 'H360-2026-0315', contrato: 'A-1', estado: 'SALA',
      sala_codigo: 'SALGC06', sede_nombre: 'Gran Colombia', residencia_id: null,
    }
    const SIN_HOMENAJE_MAS_RECIENTE = {
      id: 91, codigo: 'H360-2026-0420', contrato: 'A-1', estado: 'ASISTENCIA',
      sala_codigo: null, sede_nombre: null, residencia_id: null,
    }
    const EN_RESIDENCIA = {
      id: 80, codigo: 'H360-2026-0400', contrato: 'A-1', estado: 'RESIDENCIA',
      sala_codigo: null, sede_nombre: null, residencia_id: 9,
    }

    test('la consulta ordena: no terminal primero, luego con homenaje registrado y, después, la más reciente', async () => {
      await llamar(ctrl.bandeja)
      const sql = db.query.mock.calls[0][0].replace(/\s+/g, ' ').trim()
      const orden = /ORDER BY (.+)$/i.exec(sql)?.[1]
      expect(orden).toBeDefined()
      // 1.º las asistencias que NO están en un estado terminal (CERRADO,
      //     DESISTIDO, RECHAZADO): una viva dice dónde está la familia hoy; una
      //     cerrada, dónde estuvo.
      // 2.º las que tienen homenaje (sala o residencia) antes que las que no
      //     tienen ninguno: sin homenaje no aportan lo único que H360 le agrega a
      //     la bandeja, que es dónde es el homenaje.
      // 3.º la más reciente (id más alto): la posterior reemplaza a la anterior.
      expect(orden).toMatch(
        /^\(a\.estado IN \('CERRADO', ?'DESISTIDO', ?'RECHAZADO'\)\), \(hs\.id IS NULL AND hr\.id IS NULL\), a\.id DESC\b/)
    })

    test('se queda con la primera fila del contrato, que es la preferida, y no con la última', async () => {
      // El orden en que el motor devuelve las filas es el que pidió el ORDER BY.
      db.query = jest.fn(async () => [[CON_HOMENAJE, SIN_HOMENAJE_MAS_RECIENTE]])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-1').asistencia.id).toBe(77)
      expect(fila(res, 'A-1').asistencia.ubicacion_tipo).toBe('SALA')
      expect(fila(res, 'A-1').rama).toBe('SALA')
    })

    test('entre dos con homenaje gana la que llegó primera (la más reciente según el orden pedido)', async () => {
      db.query = jest.fn(async () => [[EN_RESIDENCIA, CON_HOMENAJE]])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-1').asistencia.id).toBe(80)
      expect(fila(res, 'A-1').rama).toBe('RESIDENCIA')
    })

    test('una asistencia más reciente sin homenaje no tapa a la que sí lo tiene (rama por sede no pisa al homenaje)', async () => {
      // A-3 es de otra ciudad por su sede: si ganara la asistencia sin homenaje,
      // la rama saldría OTRA_CIUDAD en lugar de SALA.
      db.query = jest.fn(async () => [[
        { ...CON_HOMENAJE, contrato: 'A-3' }, { ...SIN_HOMENAJE_MAS_RECIENTE, contrato: 'A-3' },
      ]])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-3').rama).toBe('SALA')
    })

    test('los otros contratos no se ven afectados', async () => {
      db.query = jest.fn(async () => [[
        CON_HOMENAJE, SIN_HOMENAJE_MAS_RECIENTE,
        { ...EN_RESIDENCIA, id: 82, contrato: 'A-3' },
      ]])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-1').asistencia.id).toBe(77)
      expect(fila(res, 'A-3').asistencia.id).toBe(82)
      expect(fila(res, 'MAS-9').asistencia).toBeNull()
    })

    // Las pruebas de arriba le dan al cruce las filas YA ordenadas, así que
    // pasarían con cualquier ORDER BY. Estas no: el doble de la base ordena las
    // filas con el ORDER BY que la consulta pide de verdad, y el cruce se queda
    // con la primera. Si el orden pedido es el equivocado, gana la asistencia
    // equivocada.
    describe('el orden de preferencia, ejecutado de verdad', () => {
      // Lo mínimo de MySQL que usa la consulta: términos separados por comas de
      // primer nivel, cada uno `col [ASC|DESC]` o una condición con IS NULL, IN,
      // AND y OR. Lo que no entienda, lo rechaza: que un ORDER BY nuevo no se
      // evalúe en silencio como si no existiera.
      const COLUMNAS = {
        'a.id':     f => f.id,
        'a.estado': f => f.estado,
        'hs.id':    f => (f.sala_codigo ? 1 : null), // hs.id no se selecciona: la sala lo delata
        'hr.id':    f => f.residencia_id,
      }
      function terminos(orden) {
        const out = []
        let nivel = 0, comillas = false, desde = 0
        for (let i = 0; i < orden.length; i++) {
          const c = orden[i]
          if (c === "'") comillas = !comillas
          else if (!comillas && c === '(') nivel++
          else if (!comillas && c === ')') nivel--
          else if (!comillas && nivel === 0 && c === ',') { out.push(orden.slice(desde, i)); desde = i + 1 }
        }
        out.push(orden.slice(desde))
        return out.map(t => t.trim())
      }
      function evaluador(termino) {
        const [, expr, dir] = /^(.*?)(?:\s+(ASC|DESC))?$/i.exec(termino)
        const js = expr
          .replace(/\b(a|hs|hr)\.(\w+)\b/g, (m) => {
            if (!COLUMNAS[m]) throw new Error(`columna sin simular: ${m}`)
            return `col("${m}")`
          })
          .replace(/(col\("[^"]+"\)) IS NULL/g, '($1 == null)')
          .replace(/(col\("[^"]+"\)) IN \(([^)]*)\)/g, '[$2].includes($1)')
          .replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||')
        if (/[^\w\s().,'"=&|[\]]/.test(js)) throw new Error(`ORDER BY sin simular: ${termino}`)
        const fn = new Function('col', `return Number(${js})`)
        return { fn, desc: /^DESC$/i.test(dir || '') }
      }
      function ordenar(sql, filas) {
        const orden = /ORDER BY (.+)$/i.exec(sql.replace(/\s+/g, ' ').trim())?.[1]
        if (!orden) throw new Error('la consulta no pide ningún ORDER BY')
        const evals = terminos(orden).map(evaluador)
        return [...filas].sort((x, y) => {
          for (const { fn, desc } of evals) {
            const d = fn(c => COLUMNAS[c](x)) - fn(c => COLUMNAS[c](y))
            if (d) return desc ? -d : d
          }
          return 0
        })
      }
      // El motor devuelve las filas de la tabla en cualquier orden: aquí, de la
      // más vieja a la más nueva, que es el contrario de la preferencia por recencia.
      const motor = filas => { db.query = jest.fn(async sql => [ordenar(sql, filas)]) }

      const viva = (extra = {}) => ({
        id: 100, codigo: 'H360-2026-0325', contrato: 'A-1', estado: 'SALA',
        sala_codigo: 'SALGC04', sede_nombre: 'Gran Colombia', residencia_id: null, ...extra,
      })
      const terminal = (estado, extra = {}) => ({
        id: 200, codigo: 'H360-2026-0326', contrato: 'A-1', estado,
        sala_codigo: null, sede_nombre: null, residencia_id: 9, ...extra,
      })

      test('entre una activa en sala y una cerrada en residencia más reciente gana la activa (el caso del contrato 42492)', async () => {
        motor([viva(), terminal('CERRADO')])
        const { res } = await llamar(ctrl.bandeja)
        const a = fila(res, 'A-1')
        expect(a.asistencia.codigo).toBe('H360-2026-0325')
        expect(a.asistencia.ubicacion_tipo).toBe('SALA')
        expect(a.rama).toBe('SALA')
      })

      test('una activa SIN homenaje gana a una cerrada CON homenaje más reciente', async () => {
        // «Sin confirmar» es algo que la pantalla sabe decir; no sabe avisar que
        // la ubicación que muestra es de un caso cerrado.
        motor([viva({ id: 90, estado: 'ASISTENCIA', sala_codigo: null, sede_nombre: null }),
               terminal('CERRADO', { id: 95 })])
        const { res } = await llamar(ctrl.bandeja)
        const a = fila(res, 'A-1')
        expect(a.asistencia.id).toBe(90)
        expect(a.asistencia.estado).toBe('ASISTENCIA')
        expect(a.asistencia.ubicacion_tipo).toBeNull()
      })

      test.each(['CERRADO', 'DESISTIDO', 'RECHAZADO'])(
        'una asistencia %s más reciente y con homenaje no tapa a la activa', async estado => {
          motor([viva(), terminal(estado)])
          const { res } = await llamar(ctrl.bandeja)
          expect(fila(res, 'A-1').asistencia.id).toBe(100)
        })

      test.each(['NUEVO', 'ASISTENCIA', 'PRESERVACION', 'ENCOFRADO', 'ENCUENTRO', 'SALA', 'APROBACION'])(
        '%s cuenta como activa: gana a una cerrada más reciente con homenaje', async estado => {
          motor([viva({ estado }), terminal('CERRADO')])
          const { res } = await llamar(ctrl.bandeja)
          expect(fila(res, 'A-1').asistencia.id).toBe(100)
        })

      // GUARDA: pasa también sin el criterio nuevo (la que tiene homenaje ya
      // ganaba antes). Se pone en rojo si se quita o se pospone el criterio de
      // «con homenaje» (p. ej. dejando solo «no terminal» y «más reciente»).
      // Es el caso del contrato 03237, con la descartada MÁS RECIENTE que la
      // ganadora: en producción es al revés y entonces la prueba no discriminaría.
      test('entre dos terminales sigue ganando la que tiene homenaje, aunque la otra sea más reciente', async () => {
        motor([terminal('CERRADO', { id: 150, residencia_id: null, sala_codigo: 'SALSJ02', sede_nombre: 'San José' }),
               terminal('DESISTIDO', { id: 160, residencia_id: null })])
        const { res } = await llamar(ctrl.bandeja)
        const a = fila(res, 'A-1')
        expect(a.asistencia.id).toBe(150)
        expect(a.asistencia.estado).toBe('CERRADO')
        expect(a.rama).toBe('SALA')
      })

      // GUARDA: entre dos activas rige lo de siempre. Pasa también sin el criterio
      // nuevo; se pone en rojo si la recencia se antepone al homenaje o si este
      // se quita.
      test('entre dos activas rige lo de siempre: con homenaje primero y, si empatan, la más reciente', async () => {
        motor([viva({ id: 50 }),
               viva({ id: 60, codigo: 'H360-2026-0330', estado: 'ASISTENCIA', sala_codigo: null, sede_nombre: null }),
               viva({ id: 55, codigo: 'H360-2026-0328', sala_codigo: 'SALGC06' })])
        const { res } = await llamar(ctrl.bandeja)
        expect(fila(res, 'A-1').asistencia.id).toBe(55)
      })

      // GUARDA: pasa también sin el criterio nuevo. Un estado terminal baja a una
      // asistencia en la preferencia, no la excluye: si «terminal» se resolviera
      // filtrando en el WHERE, un contrato cuya única asistencia está cerrada se
      // quedaría sin ubicación. El doble de la base no ejecuta el WHERE, por eso
      // además de las filas se mira que el WHERE no hable del estado.
      test.each(['CERRADO', 'DESISTIDO', 'RECHAZADO', 'SALA'])(
        'con una sola asistencia (%s) el resultado no cambia', async estado => {
          motor([estado === 'SALA' ? viva() : terminal(estado)])
          const { res } = await llamar(ctrl.bandeja)
          const a = fila(res, 'A-1')
          expect(a.asistencia.estado).toBe(estado)
          expect(a.asistencia.ubicacion_tipo).toBe(estado === 'SALA' ? 'SALA' : 'RESIDENCIA')
          const sql = db.query.mock.calls[0][0].replace(/\s+/g, ' ')
          expect(/WHERE (.+?) ORDER BY/i.exec(sql)?.[1]).not.toMatch(/estado/i)
        })
    })
  })

  // El IN de MySQL no distingue mayúsculas pero Map.get sí: un contrato guardado
  // con otra capitalización llegaba en las filas y no se cruzaba. (Hoy no es
  // alcanzable en producción: 0 contratos difieren solo en mayúsculas. Se cierra
  // porque cuesta una línea y el día que ocurra nadie lo vería.)
  test('el cruce no distingue mayúsculas, igual que el IN de MySQL', async () => {
    db.query = jest.fn(async () => [[{ ...ASISTENCIA_A1, contrato: 'a-1' }]])
    svc.gestionesPorOrdenes = jest.fn(async () => new Map([
      ['mas-9', { id: 6, estado: 'EN_GESTION', tipificacion: null }],
    ]))
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-1').asistencia.id).toBe(77)
    expect(fila(res, 'A-1').rama).toBe('SALA')
    expect(fila(res, 'MAS-9').gestion.id).toBe(6)
  })

  // Era una columna que se traía y no se usaba en ningún lado.
  test('la consulta de asistencias no trae columnas que nadie usa (viene_otra_ciudad)', async () => {
    await llamar(ctrl.bandeja)
    expect(db.query.mock.calls[0][0]).not.toMatch(/viene_otra_ciudad/)
  })

  // El cruce es por número de contrato y cubre todas las órdenes del ERP: si se
  // pidieran solo algunas, el resto saldría «sin asistencia» aunque la tenga.
  test('cruza con H360 por el contrato de todas las órdenes, con un solo marcador por contrato', async () => {
    await llamar(ctrl.bandeja)
    expect(db.query).toHaveBeenCalledTimes(1)
    const [sql, params] = db.query.mock.calls[0]
    expect(params).toEqual(['A-1', 'MAS-9', 'A-3'])
    expect((sql.match(/\?/g) || []).length).toBe(params.length)
    expect(svc.gestionesPorOrdenes).toHaveBeenCalledWith(['A-1', 'MAS-9', 'A-3'])
  })

  // El 46% de las órdenes no tiene caso en 360 y aun así hay que gestionarlas.
  // El cruce está vivo (A-1 sí trae asistencia): sin eso, esta prueba pasaría
  // también con una bandeja que no cruzara nada.
  test('una orden sin asistencia en H360 sigue en la bandeja', async () => {
    db.query = jest.fn(async () => [[ASISTENCIA_A1]])
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-1').asistencia).not.toBeNull()
    expect(fila(res, 'A-3').asistencia).toBeNull()
    expect(fila(res, 'A-3')).toHaveProperty('rama')
    expect(res.cuerpo.data).toHaveLength(3)
  })

  test('la sede de otra ciudad cae en la rama telefónica', async () => {
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-3').rama).toBe('OTRA_CIUDAD')
  })

  test('la sede local sin homenaje registrado cae en la rama de residencia', async () => {
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-1').rama).toBe('RESIDENCIA')
  })

  test('el homenaje registrado en H360 manda sobre lo que diga la sede', async () => {
    // La orden es de una sede de otra ciudad, pero el homenaje es en una sala.
    db.query = jest.fn(async () => [[{ ...ASISTENCIA_A1, contrato: 'A-3' }]])
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-3').rama).toBe('SALA')
  })

  test('un homenaje en residencia registrado en H360 da la rama de residencia', async () => {
    db.query = jest.fn(async () => [[{
      id: 80, codigo: 'H360-2026-0400', contrato: 'A-3', estado: 'RESIDENCIA',
      sala_codigo: null, sede_nombre: null, residencia_id: 9,
    }]])
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-3').rama).toBe('RESIDENCIA')
    expect(fila(res, 'A-3').asistencia.ubicacion_tipo).toBe('RESIDENCIA')
    expect(fila(res, 'A-3').asistencia.ubicacion_detalle).toBeNull()
  })

  test('una asistencia sin homenaje todavía no decide la rama: la decide la sede', async () => {
    db.query = jest.fn(async () => [[{
      id: 81, codigo: 'H360-2026-0401', contrato: 'A-3', estado: 'ASISTENCIA',
      sala_codigo: null, sede_nombre: null, residencia_id: null,
    }]])
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-3').asistencia.ubicacion_tipo).toBeNull()
    expect(fila(res, 'A-3').rama).toBe('OTRA_CIUDAD')
  })

  // `rama` por sí sola no distingue lo que se sabe de lo que se supone: sin esta
  // marca la pantalla pinta «Residencia» igual para un homenaje registrado que
  // para una orden de ayer de la que nadie sabe aún dónde será la velación.
  // Es un campo aparte y aditivo: `rama` y el filtro no cambian.
  describe('rama_confirmada: lo que se sabe frente a lo que se supone', () => {
    test('confirmada cuando sale de la ubicación de la asistencia en H360 (sala)', async () => {
      db.query = jest.fn(async () => [[ASISTENCIA_A1]])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-1').rama).toBe('SALA')
      expect(fila(res, 'A-1').rama_confirmada).toBe(true)
    })

    test('confirmada cuando sale del homenaje en residencia registrado en H360', async () => {
      db.query = jest.fn(async () => [[{
        id: 80, codigo: 'H360-2026-0400', contrato: 'A-1', estado: 'RESIDENCIA',
        sala_codigo: null, sede_nombre: null, residencia_id: 9,
      }]])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-1').rama).toBe('RESIDENCIA')
      expect(fila(res, 'A-1').rama_confirmada).toBe(true)
    })

    test('confirmada cuando la sede del ERP dice que es otra ciudad', async () => {
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-3').rama).toBe('OTRA_CIUDAD')
      expect(fila(res, 'A-3').rama_confirmada).toBe(true)
    })

    test('NO confirmada cuando la rama es el valor por defecto (sede local, sin asistencia)', async () => {
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-1').rama).toBe('RESIDENCIA')
      expect(fila(res, 'A-1').rama_confirmada).toBe(false)
    })

    test('NO confirmada si hay asistencia pero aún sin homenaje: no sabe dónde será', async () => {
      db.query = jest.fn(async () => [[{
        id: 81, codigo: 'H360-2026-0401', contrato: 'A-1', estado: 'ASISTENCIA',
        sala_codigo: null, sede_nombre: null, residencia_id: null,
      }]])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'A-1').asistencia).not.toBeNull()
      expect(fila(res, 'A-1').rama).toBe('RESIDENCIA')
      expect(fila(res, 'A-1').rama_confirmada).toBe(false)
    })

    test('NO confirmada en una orden sin sede ni convenio', async () => {
      ks.ordenesDelRango = jest.fn(async () => [{ orden_servicio: 'X-2', nombre_ser_querido: 'SIN CAMPOS' }])
      const { res } = await llamar(ctrl.bandeja)
      expect(fila(res, 'X-2').rama).toBe('RESIDENCIA')
      expect(fila(res, 'X-2').rama_confirmada).toBe(false)
    })

    test('es siempre un booleano, en todas las filas', async () => {
      db.query = jest.fn(async () => [[ASISTENCIA_A1]])
      const { res } = await llamar(ctrl.bandeja)
      expect(res.cuerpo.data.length).toBeGreaterThan(0)
      for (const f of res.cuerpo.data) expect(typeof f.rama_confirmada).toBe('boolean')
    })

    test('no cambia el filtro por rama: una rama supuesta sigue entrando en su filtro', async () => {
      const { res } = await llamar(ctrl.bandeja, { rama: 'RESIDENCIA' })
      expect(res.codigo).toBe(200)
      expect(fila(res, 'A-1').rama_confirmada).toBe(false)
    })

    test('ramaDe sigue devolviendo solo el texto de la rama', () => {
      expect(ctrl.ramaDe(ORDENES[0], null)).toBe('RESIDENCIA')
      expect(ctrl.ramaDe(ORDENES[2], null)).toBe('OTRA_CIUDAD')
      expect(ctrl.ramaDe(ORDENES[0], { ubicacion_tipo: 'SALA' })).toBe('SALA')
    })

    // Era el único lugar del módulo donde lo DESCONOCIDO se presentaba como un
    // dato. «No es ninguna de las cinco sedes locales» no es lo mismo que «es de
    // otra ciudad»: si el ERP gana un centro de costo, esa familia sale en la
    // rama de otra ciudad y nadie sabe si es verdad. Lo que se afirma es lo que
    // el ERP ya mostró: las cuatro sedes foráneas medidas (462 de 3975 órdenes
    // en 365 días, 2026-11-06). Todo lo demás se gestiona igual, sin confirmar.
    describe('una sede desconocida es una suposición, no un dato', () => {
      const CONVENIO_LOCAL = 'Planes TRADICIONAL'
      // Un centro de costo que el ERP nunca ha devuelto: ni local ni de la lista.
      // Se inventa acá, en una prueba, y jamás en el código de producción.
      const SEDE_NUEVA = 'Sede Los Patios'
      const soloOrden = o => { ks.ordenesDelRango = jest.fn(async () => [o]) }
      const ramaYMarca = (res, orden) => [fila(res, orden).rama, fila(res, orden).rama_confirmada]

      test('la sede que no es local ni foránea conocida: OTRA_CIUDAD SIN confirmar', async () => {
        soloOrden({ orden_servicio: 'P-1', sede: SEDE_NUEVA, convenio: CONVENIO_LOCAL })
        const { res } = await llamar(ctrl.bandeja)
        expect(ramaYMarca(res, 'P-1')).toEqual(['OTRA_CIUDAD', false])
      })

      // Las cuatro sedes foráneas que el ERP devuelve de verdad, con el texto
      // EXACTO con que llegan —capitalización y los dos espacios de «Sede  Arauca»—:
      // el ERP dice el municipio por su propio centro de costo, así que es un dato.
      test.each(['Sede Pamplona', 'Sede Saravena', 'Sede  Arauca', 'Sede Tame'])(
        '%j: la rama es OTRA_CIUDAD y se afirma', async sede => {
          soloOrden({ orden_servicio: 'P-9', sede, convenio: CONVENIO_LOCAL })
          const { res } = await llamar(ctrl.bandeja)
          expect(ramaYMarca(res, 'P-9')).toEqual(['OTRA_CIUDAD', true])
        })

      // El convenio «OLIVOS <ciudad>» no es señal (0 de 3975 órdenes en un año lo
      // traen, y la sucursal que aparece en `entidad` es quien vendió el plan, no
      // dónde es el homenaje). Con cualquier sede, el resultado es el mismo que con
      // un convenio corriente.
      test.each([
        ['local',     'Sede Gran Colombia', 'RESIDENCIA',  false],
        ['foránea',   'Sede Tame',          'OTRA_CIUDAD', true],
        ['desconocida', SEDE_NUEVA,         'OTRA_CIUDAD', false],
      ])('el convenio de otra sucursal de Olivos no cambia la rama de una sede %s', async (_, sede, rama, marca) => {
        soloOrden({ orden_servicio: 'P-2', sede, convenio: 'Olivos Bucaramanga' })
        const { res } = await llamar(ctrl.bandeja)
        expect(ramaYMarca(res, 'P-2')).toEqual([rama, marca])
      })

      test('una sede local sin homenaje registrado sigue en RESIDENCIA sin confirmar', async () => {
        soloOrden({ orden_servicio: 'P-3', sede: 'Sede Gran Colombia', convenio: CONVENIO_LOCAL })
        const { res } = await llamar(ctrl.bandeja)
        expect(ramaYMarca(res, 'P-3')).toEqual(['RESIDENCIA', false])
      })

      // La lista es una decisión que se ve en el código: son exactamente las
      // cuatro sedes medidas, ya normalizadas, y congelada para que no se le
      // agregue una en tiempo de ejecución, lejos de la vista.
      describe('SEDES_FORANEAS_CONOCIDAS', () => {
        test('son las cuatro sedes medidas y es inmutable', () => {
          expect(ctrl.SEDES_FORANEAS_CONOCIDAS)
            .toEqual(['SEDE PAMPLONA', 'SEDE SARAVENA', 'SEDE ARAUCA', 'SEDE TAME'])
          expect(Object.isFrozen(ctrl.SEDES_FORANEAS_CONOCIDAS)).toBe(true)
        })

        // Se compara contra el texto ya normalizado: una entrada escrita con
        // minúsculas o con dos espacios no coincidiría nunca y nadie lo notaría.
        test('cada entrada está escrita como normalizarSede la deja', () => {
          for (const sede of ctrl.SEDES_FORANEAS_CONOCIDAS)
            expect(ctrl.normalizarSede(sede)).toBe(sede)
        })

        // SEDES_LOCALES gana: una entrada que contuviera una sede local nunca
        // se vería como foránea (y es justo lo que esta prueba no deja pasar).
        test('ninguna entrada es una sede local', () => {
          for (const sede of ctrl.SEDES_FORANEAS_CONOCIDAS)
            expect(ctrl.esOtraCiudad({ sede })).toBe(true)
        })
      })

      test('toda fila trae las dos cosas: rama y si es un dato', async () => {
        ks.ordenesDelRango = jest.fn(async () => [
          { orden_servicio: 'P-1', sede: SEDE_NUEVA, convenio: CONVENIO_LOCAL },
          { orden_servicio: 'P-2', sede: 'Sede Pamplona', convenio: CONVENIO_LOCAL },
          { orden_servicio: 'P-3', sede: 'Sede Gran Colombia', convenio: CONVENIO_LOCAL },
        ])
        const { res } = await llamar(ctrl.bandeja)
        expect(res.cuerpo.data.map(f => [f.rama, f.rama_confirmada])).toEqual([
          ['OTRA_CIUDAD', false], ['OTRA_CIUDAD', true], ['RESIDENCIA', false],
        ])
      })

      // Una rama supuesta no se cae del filtro: la psicóloga que pide «otra
      // ciudad» tiene que ver también las que están sin confirmar.
      test('la rama supuesta y la confirmada entran las dos en el filtro por rama', async () => {
        ks.ordenesDelRango = jest.fn(async () => [
          { orden_servicio: 'P-1', sede: SEDE_NUEVA, convenio: CONVENIO_LOCAL },
          { orden_servicio: 'P-2', sede: 'Sede Tame', convenio: CONVENIO_LOCAL },
        ])
        const { res } = await llamar(ctrl.bandeja, { rama: 'OTRA_CIUDAD' })
        expect(res.codigo).toBe(200)
        expect(ramaYMarca(res, 'P-1')).toEqual(['OTRA_CIUDAD', false])
        expect(ramaYMarca(res, 'P-2')).toEqual(['OTRA_CIUDAD', true])
      })

      // El homenaje registrado en H360 sigue mandando sobre cualquier sede,
      // conocida o no, y es un dato.
      test.each([['desconocida', SEDE_NUEVA], ['foránea conocida', 'Sede Pamplona']])(
        'el homenaje de H360 manda sobre una sede %s, y es un dato', async (_, sede) => {
          soloOrden({ orden_servicio: 'P-1', sede, convenio: CONVENIO_LOCAL })
          db.query = jest.fn(async () => [[{ ...ASISTENCIA_A1, contrato: 'P-1' }]])
          const { res } = await llamar(ctrl.bandeja)
          expect(ramaYMarca(res, 'P-1')).toEqual(['SALA', true])
        })
    })
  })

  test('dice qué ya se gestionó', async () => {
    svc.gestionesPorOrdenes = jest.fn(async () => new Map([
      ['A-1', { id: 5, estado: 'GESTIONADA', tipificacion: 'OFRECIDO_EN_HOMENAJE' }],
    ]))
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-1').gestion.estado).toBe('GESTIONADA')
    expect(fila(res, 'A-3').gestion).toBeNull()
  })

  // Las claves del cruce se comparan recortadas: un espacio sobrante en el ERP
  // o en H360 no puede dejar una orden como «sin gestión» y hacer que se llame
  // dos veces a la misma familia.
  test('el cruce no se rompe por espacios sobrantes en el número de orden', async () => {
    ks.ordenesDelRango = jest.fn(async () => [{ ...ORDENES[0], orden_servicio: 'A-1 ' }])
    db.query = jest.fn(async () => [[{ ...ASISTENCIA_A1, contrato: ' A-1' }]])
    svc.gestionesPorOrdenes = jest.fn(async () => new Map([
      ['A-1', { id: 5, estado: 'EN_GESTION', tipificacion: null }],
    ]))
    const { res } = await llamar(ctrl.bandeja)
    expect(res.cuerpo.data).toHaveLength(1)
    expect(res.cuerpo.data[0].asistencia.id).toBe(77)
    expect(res.cuerpo.data[0].gestion.id).toBe(5)
    expect(db.query.mock.calls[0][1]).toEqual(['A-1'])
  })

  // Ninguna respuesta del módulo fuera de las atenciones lleva notas. La fila
  // de gestión que devuelve el servicio trae más columnas de las que la bandeja
  // necesita (es un SELECT *): la prueba las pone todas, porque con una gestión
  // vacía el control no tendría nada que dejar pasar.
  test('la bandeja nunca trae el campo notas', async () => {
    svc.gestionesPorOrdenes = jest.fn(async () => new Map([
      ['A-1', {
        id: 5, orden_servicio: 'A-1', estado: 'GESTIONADA', tipificacion: 'OFRECIDO_EN_HOMENAJE',
        notas: 'LA FAMILIA PIDIO QUE NO LA LLAMEN', telefonos: '3001112233',
        titular_nombre: 'MARIA PEREZ', psicologa: 'ana.psi',
      }],
    ]))
    const { res } = await llamar(ctrl.bandeja)
    const texto = JSON.stringify(res.cuerpo)
    expect(texto).not.toContain('notas')
    expect(texto).not.toContain('NO LA LLAMEN')
    expect(fila(res, 'A-1').gestion).toEqual({
      id: 5, estado: 'GESTIONADA', tipificacion: 'OFRECIDO_EN_HOMENAJE',
    })
  })

  // Hay órdenes sin nombre ni teléfono (SAR-1883, de Saravena): son familias
  // reales que hay que poder ver en la bandeja, no un caso que la rompa.
  test('una orden sin nombre ni teléfono no rompe la bandeja', async () => {
    ks.ordenesDelRango = jest.fn(async () => [
      { orden_servicio: 'SAR-1883', nombre_ser_querido: '', telefono: '', direccion: '',
        sede: 'Sede Saravena', convenio: '', fecha_fallecimiento: '2026-11-04' },
      ORDENES[0],
    ])
    const { res, next } = await llamar(ctrl.bandeja)
    expect(next).not.toHaveBeenCalled()
    expect(res.codigo).toBe(200)
    expect(fila(res, 'SAR-1883').nombre_ser_querido).toBe('')
    expect(fila(res, 'SAR-1883').rama).toBe('OTRA_CIUDAD')
    expect(res.cuerpo.data).toHaveLength(2)
  })

  test('una orden sin sede ni convenio no rompe la bandeja', async () => {
    ks.ordenesDelRango = jest.fn(async () => [
      { orden_servicio: 'X-1', nombre_ser_querido: 'SIN SEDE', sede: null, convenio: null },
      { orden_servicio: 'X-2', nombre_ser_querido: 'SIN CAMPOS' },
    ])
    const { res, next } = await llamar(ctrl.bandeja)
    expect(next).not.toHaveBeenCalled()
    expect(res.cuerpo.data.map(f => f.rama)).toEqual(['RESIDENCIA', 'RESIDENCIA'])
  })

  test('un rango sin órdenes responde vacío sin consultar H360', async () => {
    ks.ordenesDelRango = jest.fn(async () => [])
    const { res } = await llamar(ctrl.bandeja)
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.data).toEqual([])
    expect(res.cuerpo.total).toBe(0)
    expect(db.query).not.toHaveBeenCalled()
  })

  describe('rango de fechas', () => {
    // Se fija el INSTANTE y no una hora local de la máquina que corre las pruebas:
    // «las 10:00 del 5 de noviembre» armado con new Date(a, m, d, 10) significaría
    // cosas distintas en Bogotá y en un contenedor en UTC, y la prueba no diría
    // nada del día de Bogotá. Aquí son las 10:00 de Bogotá (UTC-5, sin horario de
    // verano), o sea las 15:00 UTC, en cualquier máquina. Comparar solo que las
    // dos fechas difieran un día pasaría también con «anteayer y ayer».
    const fijarInstante = instante => jest.useFakeTimers({
      now: instante,
      doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate',
        'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    })
    const fijarHoy = (anio, mes, dia) => fijarInstante(new Date(Date.UTC(anio, mes - 1, dia, 15, 0, 0)))
    afterEach(() => { jest.useRealTimers() })

    // «Hoy» es el día de Bogotá, que es donde trabajan las psicólogas, no el de la
    // zona en que corra el proceso. Si el backend se muda a un contenedor en UTC,
    // entre las 19:00 y la medianoche de Cúcuta el reloj del proceso ya marca el
    // día siguiente: con la hora local, la bandeja abriría un día corrido sin
    // avisar y las psicólogas perderían una jornada de casos.
    //
    // OJO con lo que NO demuestra una prueba: que pase en varias zonas horarias
    // solo muestra que el código es coherente consigo mismo en cada zona, no que
    // el día sea el de Bogotá. Por eso se fijan INSTANTES concretos y se compara
    // con el día de Bogotá escrito a mano.
    describe('«hoy» es el día de Bogotá y no el de la zona del proceso', () => {
      test.each([
        // En UTC ya es 6 de noviembre; en Bogotá todavía es el 5.
        ['las 22:00 del 5 de noviembre en Bogotá (03:00 UTC del 6)', '2026-11-06T03:00:00Z',
          ['2026-11-04', '2026-11-05']],
        ['un segundo antes de la medianoche de Bogotá', '2026-11-06T04:59:59Z',
          ['2026-11-04', '2026-11-05']],
        // El borde exacto: fija el desfase en -5 horas (con -4 o -6 se corre).
        ['la medianoche de Bogotá: empieza el día nuevo', '2026-11-06T05:00:00Z',
          ['2026-11-05', '2026-11-06']],
        ['las 19:00 de Bogotá, cuando en UTC ya es el día siguiente', '2026-11-05T00:00:00Z',
          ['2026-11-03', '2026-11-04']],
        // El corte de mes y de año cae en el día de Bogotá, no en el de UTC.
        ['el último día del año a las 22:00 en Bogotá (en UTC ya es año nuevo)', '2027-01-01T03:00:00Z',
          ['2026-12-30', '2026-12-31']],
        ['el 1 de marzo a las 22:00 en Bogotá', '2026-03-02T03:00:00Z', ['2026-02-28', '2026-03-01']],
        // Bogotá no tiene horario de verano: en julio sigue siendo UTC-5. Una zona
        // con verano (Nueva York, UTC-4 en julio) ya estaría en el día siguiente.
        ['las 23:30 de un 5 de julio en Bogotá', '2026-07-06T04:30:00Z', ['2026-07-04', '2026-07-05']],
      ])('%s', async (_, instante, esperado) => {
        fijarInstante(new Date(instante))
        const { res } = await llamar(ctrl.bandeja)
        expect(ks.ordenesDelRango).toHaveBeenCalledWith(...esperado)
        expect([res.cuerpo.desde, res.cuerpo.hasta]).toEqual(esperado)
      })

      // Lo anterior solo distingue la hora local cuando la máquina que corre las
      // pruebas NO está en Bogotá (con TZ=America/Bogota el reloj local y el de
      // Bogotá coinciden y todo pasaría igual). Esta prueba no depende de dónde
      // se corra: lanza procesos de Node en otras zonas y comprueba en cada uno que
      // el rango es el de Bogotá. Si se vuelve a la hora local, falla en cualquier
      // máquina.
      test('el rango es el mismo en procesos que corren en otras zonas horarias', () => {
        const { execFileSync } = require('child_process')
        const ZONAS = ['UTC', 'Asia/Tokyo', 'Pacific/Auckland', 'America/Los_Angeles', 'America/Bogota']
        const script = `
          const c = require(${JSON.stringify(require.resolve('../duelo.controller'))})
          const instante = new Date('2026-11-06T03:00:00Z')
          const salida = {}
          for (const tz of ${JSON.stringify(ZONAS)}) {
            process.env.TZ = tz
            salida[tz] = { rango: c.rangoPorDefecto(instante), diaLocal: instante.getDate() }
          }
          console.log(JSON.stringify(salida))`
        // El proceso hijo arranca sin TZ y la fija él mismo en cada vuelta.
        const entorno = { ...process.env }
        delete entorno.TZ
        const salida = JSON.parse(execFileSync(process.execPath, ['-e', script],
          { env: entorno, encoding: 'utf8', timeout: 20000 }))

        // Que la prueba tenga con qué fallar: en UTC, en Tokio y en Auckland el
        // reloj local ya marca el 6, y una implementación con hora local daría
        // [5, 6] en vez de [4, 5].
        for (const tz of ['UTC', 'Asia/Tokyo', 'Pacific/Auckland']) expect(salida[tz].diaLocal).toBe(6)
        for (const tz of ZONAS)
          expect([tz, salida[tz].rango]).toEqual([tz, { desde: '2026-11-04', hasta: '2026-11-05' }])
      })
    })

    test('el defecto es ayer y hoy', async () => {
      fijarHoy(2026, 11, 5)
      await llamar(ctrl.bandeja)
      expect(ks.ordenesDelRango).toHaveBeenCalledTimes(1)
      const [desde, hasta] = ks.ordenesDelRango.mock.calls[0]
      expect(desde).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(hasta) - new Date(desde)).toBe(86400000)
      expect([desde, hasta]).toEqual(['2026-11-04', '2026-11-05'])
    })

    test('el defecto cruza el cambio de mes y de año', async () => {
      fijarHoy(2026, 3, 1)
      await llamar(ctrl.bandeja)
      expect(ks.ordenesDelRango.mock.calls[0]).toEqual(['2026-02-28', '2026-03-01'])

      fijarHoy(2027, 1, 1)
      await llamar(ctrl.bandeja)
      expect(ks.ordenesDelRango.mock.calls[1]).toEqual(['2026-12-31', '2027-01-01'])
    })

    test('respeta el rango que pide la psicóloga y lo devuelve', async () => {
      const { res } = await llamar(ctrl.bandeja, { desde: '2026-10-01', hasta: '2026-10-31' })
      expect(ks.ordenesDelRango).toHaveBeenCalledWith('2026-10-01', '2026-10-31')
      expect(res.cuerpo.desde).toBe('2026-10-01')
      expect(res.cuerpo.hasta).toBe('2026-10-31')
    })

    // Invertida. Esta prueba afirmaba que una fecha con forma inválida cae al
    // defecto, y eso nunca se decidió: era un efecto de usar la expresión regular
    // como filtro y no como validación. «No pediste un rango» (ausente: el
    // defecto) no es lo mismo que «pediste un rango que no entiendo» («ayer»,
    // «5/11/2026»): en el segundo caso, usar el defecto le da a la psicóloga la
    // lista de otro día sin avisarle. Es 400, como el resto de la clase.
    test('una fecha con forma inválida es 400 y no cae al defecto', async () => {
      fijarHoy(2026, 11, 5)
      const r = await llamar(ctrl.bandeja, { desde: 'ayer', hasta: '5/11/2026' })
      expectRechazo(r, '«desde»', 'AAAA-MM-DD')
      expect(ks.ordenesDelRango).not.toHaveBeenCalled()
    })

    describe('una fecha con forma inválida no se reemplaza por el defecto', () => {
      const FORMAS = ['ayer', 'hoy', '5/11/2026', '2026/11/04', '04-11-2026', '2026-11-4',
        '20261104', '2026-11-04T10:00']
      const OTRO = { desde: 'hasta', hasta: 'desde' }

      // La otra punta ausente: sin la validación, la mala se reemplazaría por el
      // defecto y la bandeja respondería 200 con otro día.
      test.each(FORMAS.flatMap(forma => [['desde', forma], ['hasta', forma]]))(
        '%s=%j es 400, nombra ese campo y dice la forma esperada', async (campo, valor) => {
          fijarHoy(2026, 11, 5)
          const r = await llamar(ctrl.bandeja, { [campo]: valor })
          expectRechazo(r, `«${campo}»`, 'AAAA-MM-DD', JSON.stringify(valor))
          // Solo el campo malo: «cuál de los dos está mal» es lo que hay que poder leer.
          expect(r.res.cuerpo.mensaje).not.toContain(`«${OTRO[campo]}»`)
          // Ni «no existe» (la fecha no tiene forma de fecha, no es un 31 de febrero)
          // ni «al revés» (no hay rango que comparar todavía).
          expect(r.res.cuerpo.mensaje).not.toContain('que exista')
          expect(r.res.cuerpo.mensaje).not.toContain('al revés')
          expect(ks.ordenesDelRango).not.toHaveBeenCalled()
        })

      // La otra punta bien escrita no la salva: el rango no se completa con el defecto.
      test('con la otra punta válida también es 400, y nombra solo la mala', async () => {
        fijarHoy(2026, 11, 5)
        const malDesde = await llamar(ctrl.bandeja, { desde: 'ayer', hasta: '2026-11-05' })
        expectRechazo(malDesde, '«desde»', 'AAAA-MM-DD')
        expect(malDesde.res.cuerpo.mensaje).not.toContain('«hasta»')

        const malHasta = await llamar(ctrl.bandeja, { desde: '2026-11-01', hasta: 'mañana' })
        expectRechazo(malHasta, '«hasta»', 'AAAA-MM-DD')
        expect(malHasta.res.cuerpo.mensaje).not.toContain('«desde»')
        expect(ks.ordenesDelRango).not.toHaveBeenCalled()
      })

      // Reemplazar la mala por el defecto podía dejar el rango al revés, y entonces
      // el 400 era de «rango al revés» con un «por defecto» que la psicóloga no
      // escribió. La forma se rechaza primero: el motivo real es la forma.
      test('si el defecto invertiría el rango, el 400 sigue siendo de forma y no de rango al revés', async () => {
        fijarHoy(2026, 11, 5)
        const malDesde = await llamar(ctrl.bandeja, { desde: 'ayer', hasta: '2026-10-01' })
        expectRechazo(malDesde, '«desde»', 'AAAA-MM-DD')
        const malHasta = await llamar(ctrl.bandeja, { desde: '2026-12-01', hasta: 'mañana' })
        expectRechazo(malHasta, '«hasta»', 'AAAA-MM-DD')
        for (const { res } of [malDesde, malHasta]) {
          expect(res.cuerpo.mensaje).not.toContain('al revés')
          expect(res.cuerpo.mensaje).not.toContain('por defecto')
        }
        expect(ks.ordenesDelRango).not.toHaveBeenCalled()
      })
    })

    // La forma YYYY-MM-DD la acepta el servicio del ERP, que además compara las
    // fechas como TEXTO: «2026-13-45» no es menor ni mayor que ninguna fecha real
    // de 2026, el BETWEEN no encuentra nada y la bandeja diría «hoy no hay nadie».
    test.each([
      ['desde', '2026-13-45'], ['hasta', '2026-13-45'], // mes y día imposibles
      ['desde', '2026-02-31'], ['hasta', '2026-04-31'], // día que ese mes no tiene
      ['desde', '2025-02-29'],                          // año no bisiesto
      ['hasta', '2026-00-10'], ['desde', '2026-11-00'], // mes cero y día cero
    ])('%s=%s: tiene la forma pero no existe, es 400', async (campo, valor) => {
      fijarHoy(2026, 11, 5)
      const r = await llamar(ctrl.bandeja, { [campo]: valor })
      expectRechazo(r, `«${campo}»`, valor, 'AAAA-MM-DD')
      expect(ks.ordenesDelRango).not.toHaveBeenCalled()
    })

    test('el 29 de febrero de un año bisiesto sí existe', async () => {
      fijarHoy(2028, 3, 1)
      const { res } = await llamar(ctrl.bandeja, { desde: '2028-02-29', hasta: '2028-03-01' })
      expect(res.codigo).toBe(200)
      expect(ks.ordenesDelRango).toHaveBeenCalledWith('2028-02-29', '2028-03-01')
    })

    test('desde posterior a hasta no es un rango: 400 que dice cuál es cuál', async () => {
      const r = await llamar(ctrl.bandeja, { desde: '2026-11-10', hasta: '2026-11-04' })
      expectRechazo(r)
      expect(r.res.cuerpo.mensaje).toMatch(/«desde» \(2026-11-10\).*«hasta» \(2026-11-04\)/)
      expect(ks.ordenesDelRango).not.toHaveBeenCalled()
    })

    // El borde: un solo día (desde == hasta) es un rango válido.
    test('desde igual a hasta es un solo día, no un rango al revés', async () => {
      const { res } = await llamar(ctrl.bandeja, { desde: '2026-11-04', hasta: '2026-11-04' })
      expect(res.codigo).toBe(200)
      expect(ks.ordenesDelRango).toHaveBeenCalledWith('2026-11-04', '2026-11-04')
    })

    // Nada impedía pedir un año: ~3008 órdenes, y con ellas un IN de 3008
    // marcadores en dos consultas de H360. El timeout de axios del frontend lo
    // convierte en «el servidor tardó demasiado», que no dice qué pedir distinto.
    // El tope se dice en palabras y en el mismo 400 que el resto de la clase.
    describe('tope de 90 días', () => {
      test('un año es 400 y lo dice en palabras', async () => {
        const r = await llamar(ctrl.bandeja, { desde: '2026-01-01', hasta: '2026-12-31' })
        expectRechazo(r, 'rango no puede ser mayor a 90 días')
        // Y dice cuántos días se pidieron, que es lo que hay que acortar.
        expect(r.res.cuerpo.mensaje).toContain('365')
        expect(ks.ordenesDelRango).not.toHaveBeenCalled()
      })

      test('el mensaje dice qué rango llegó, para saber qué acortar', async () => {
        const r = await llamar(ctrl.bandeja, { desde: '2026-01-01', hasta: '2026-12-31' })
        expect(r.res.cuerpo.mensaje).toContain('2026-01-01')
        expect(r.res.cuerpo.mensaje).toContain('2026-12-31')
      })

      // El borde exacto: 90 días contando las dos puntas pasan; 91 no.
      test('90 días exactos se aceptan y 91 no', async () => {
        const noventa = await llamar(ctrl.bandeja, { desde: '2026-01-01', hasta: '2026-03-31' })
        expect(noventa.res.codigo).toBe(200)
        expect(ks.ordenesDelRango).toHaveBeenCalledWith('2026-01-01', '2026-03-31')
        const unoMas = await llamar(ctrl.bandeja, { desde: '2026-01-01', hasta: '2026-04-01' })
        expectRechazo(unoMas, '90 días')
      })

      // El tope no se mide en milisegundos contra la zona del proceso: un rango
      // que cruza un cambio de hora de otra zona sigue contando los mismos días.
      test('el conteo de días no depende de la zona del proceso', async () => {
        const { res } = await llamar(ctrl.bandeja, { desde: '2026-10-05', hasta: '2027-01-02' })
        expect(res.codigo).toBe(200) // 90 días exactos, cruzando el cambio de año
        expectRechazo(await llamar(ctrl.bandeja, { desde: '2026-10-05', hasta: '2027-01-03' }), '90 días')
      })

      // Lo que la pantalla pide de verdad no cambia: ayer y hoy son dos días.
      test('el rango por defecto y un rango corto siguen pasando', async () => {
        fijarHoy(2026, 11, 5)
        expect((await llamar(ctrl.bandeja)).res.codigo).toBe(200)
        expect((await llamar(ctrl.bandeja, { desde: '2026-10-01', hasta: '2026-10-31' })).res.codigo).toBe(200)
      })

      // Una sola punta: la otra es la del defecto, y el mensaje dice cuál no la
      // escribió nadie (igual que el 400 del rango al revés).
      test('con una sola punta el mensaje dice que la otra es el defecto', async () => {
        fijarHoy(2026, 11, 5)
        const r = await llamar(ctrl.bandeja, { desde: '2026-01-01' })
        expectRechazo(r, '90 días', 'por defecto')
        expect(ks.ordenesDelRango).not.toHaveBeenCalled()
      })

      // El orden de los rechazos: un rango al revés se nombra por lo que es.
      test('un rango al revés y largo se sigue rechazando por estar al revés', async () => {
        const r = await llamar(ctrl.bandeja, { desde: '2026-12-31', hasta: '2026-01-01' })
        expectRechazo(r, 'al revés')
        expect(r.res.cuerpo.mensaje).not.toContain('90 días')
      })
    })

    // Si llega solo una punta, la otra es la del defecto: el rango puede quedar
    // al revés sin que quien escribió lo haya querido. Se rechaza y el mensaje
    // dice cuál de las dos fechas no la puso nadie.
    test('una sola punta que invierte el rango contra el defecto es 400 y dice que la otra es el defecto', async () => {
      fijarHoy(2026, 11, 5)
      const soloHasta = await llamar(ctrl.bandeja, { hasta: '2026-10-01' })
      expectRechazo(soloHasta)
      expect(soloHasta.res.cuerpo.mensaje).toMatch(/«desde» \(2026-11-04, por defecto\).*«hasta» \(2026-10-01\)/)

      const soloDesde = await llamar(ctrl.bandeja, { desde: '2026-12-01' })
      expectRechazo(soloDesde)
      expect(soloDesde.res.cuerpo.mensaje).toMatch(/«desde» \(2026-12-01\).*«hasta» \(2026-11-05, por defecto\)/)

      // (Una fecha mal escrita ya no cae al defecto: es 400 de forma, ver arriba.)
      expect(ks.ordenesDelRango).not.toHaveBeenCalled()
    })

    // Lo ausente no es inválido: la bandeja sigue abriendo con ayer y hoy, sin filtros.
    describe('los parámetros ausentes no son inválidos', () => {
      test('sin ningún parámetro: ayer y hoy, y nada filtrado', async () => {
        fijarHoy(2026, 11, 5)
        const { res } = await llamar(ctrl.bandeja, {})
        expect(res.codigo).toBe(200)
        expect(ks.ordenesDelRango).toHaveBeenCalledWith('2026-11-04', '2026-11-05')
        expect(res.cuerpo.data.map(f => f.orden_servicio)).toEqual(['A-1', 'MAS-9', 'A-3'])
      })

      // La psicóloga no pidió rango: la respuesta le dice cuál se usó, para que sepa
      // de qué días es la lista que está viendo.
      test('sin rango la respuesta dice el rango por defecto que usó', async () => {
        fijarHoy(2026, 11, 5)
        const { res } = await llamar(ctrl.bandeja, {})
        expect([res.cuerpo.desde, res.cuerpo.hasta]).toEqual(['2026-11-04', '2026-11-05'])
        const { res: enBlanco } = await llamar(ctrl.bandeja, { desde: '', hasta: ' ' })
        expect([enBlanco.cuerpo.desde, enBlanco.cuerpo.hasta]).toEqual(['2026-11-04', '2026-11-05'])
      })

      // Un selector en «todas» manda `rama=`, no omite el parámetro.
      test('un parámetro en blanco cuenta como ausente', async () => {
        fijarHoy(2026, 11, 5)
        const { res } = await llamar(ctrl.bandeja, {
          desde: '', hasta: '  ', rama: '', estado: ' ', incluir_mascotas: '',
        })
        expect(res.codigo).toBe(200)
        expect(ks.ordenesDelRango).toHaveBeenCalledWith('2026-11-04', '2026-11-05')
        expect(res.cuerpo.data).toHaveLength(3)
      })

      test('solo desde: hasta es hoy', async () => {
        fijarHoy(2026, 11, 5)
        const { res } = await llamar(ctrl.bandeja, { desde: '2026-11-01' })
        expect(res.codigo).toBe(200)
        expect(ks.ordenesDelRango).toHaveBeenCalledWith('2026-11-01', '2026-11-05')
      })

      test('solo hasta: desde es ayer', async () => {
        fijarHoy(2026, 11, 5)
        const { res } = await llamar(ctrl.bandeja, { hasta: '2026-11-05' })
        expect(res.codigo).toBe(200)
        expect(ks.ordenesDelRango).toHaveBeenCalledWith('2026-11-04', '2026-11-05')
      })
    })
  })

  describe('filtros', () => {
    beforeEach(() => {
      svc.gestionesPorOrdenes = jest.fn(async () => new Map([
        ['A-1', { id: 5, estado: 'GESTIONADA', tipificacion: 'OFRECIDO_EN_HOMENAJE' }],
      ]))
    })
    const ordenes = res => res.cuerpo.data.map(f => f.orden_servicio)

    test('por rama', async () => {
      const { res } = await llamar(ctrl.bandeja, { rama: 'OTRA_CIUDAD' })
      expect(ordenes(res)).toEqual(['A-3'])
      expect(res.cuerpo.total).toBe(1)
    })

    test('por estado: lo que no tiene gestión cuenta como pendiente', async () => {
      const pendientes = await llamar(ctrl.bandeja, { estado: 'PENDIENTE' })
      expect(ordenes(pendientes.res)).toEqual(['MAS-9', 'A-3'])
      const gestionadas = await llamar(ctrl.bandeja, { estado: 'GESTIONADA' })
      expect(ordenes(gestionadas.res)).toEqual(['A-1'])
    })

    test('sin mascotas solo si se pide expresamente', async () => {
      const sin = await llamar(ctrl.bandeja, { incluir_mascotas: 'false' })
      expect(ordenes(sin.res)).toEqual(['A-1', 'A-3'])
      const con = await llamar(ctrl.bandeja, { incluir_mascotas: 'true' })
      expect(ordenes(con.res)).toEqual(['A-1', 'MAS-9', 'A-3'])
      const defecto = await llamar(ctrl.bandeja)
      expect(ordenes(defecto.res)).toEqual(['A-1', 'MAS-9', 'A-3'])
    })
  })

  // Una lista vacía en esta pantalla se lee como «hoy no hay nadie a quien
  // llamar». Un filtro por un valor que no existe nunca va a coincidir con nada:
  // si respondiera 200 con la lista vacía, ese día nadie llamaría a ninguna
  // familia. Toda entrada que no puede dar un resultado correcto es un 400 que
  // dice qué se esperaba.
  describe('filtros con valores inválidos', () => {
    const sinConsultar = () => expect(ks.ordenesDelRango).not.toHaveBeenCalled()

    test('una rama que no existe es 400 y dice cuáles hay', async () => {
      const r = await llamar(ctrl.bandeja, { rama: 'XYZ' })
      expectRechazo(r, '«rama»', '"XYZ"', 'SALA', 'RESIDENCIA', 'OTRA_CIUDAD')
      sinConsultar()
    })

    // «sala» en minúscula y EXTERNA (que el catálogo de ubicaciones tiene pero la
    // bandeja nunca produce como rama) tampoco coinciden con nada.
    test.each([['SALAS'], ['sala'], ['EXTERNA'], ['otra ciudad'], ['SALA,RESIDENCIA']])(
      'rama=%j no existe, es 400', async rama => {
        expectRechazo(await llamar(ctrl.bandeja, { rama }), '«rama»')
        sinConsultar()
      })

    test('un estado que no existe es 400 y dice cuáles hay', async () => {
      const r = await llamar(ctrl.bandeja, { estado: 'XYZ' })
      expectRechazo(r, '«estado»', '"XYZ"')
      for (const e of ESTADOS_GESTION) expect(r.res.cuerpo.mensaje).toContain(e)
      sinConsultar()
    })

    test.each([['gestionada'], ['PENDIENTES'], ['EN GESTION'], ['SIN_GESTION']])(
      'estado=%j no existe, es 400', async estado => {
        expectRechazo(await llamar(ctrl.bandeja, { estado }), '«estado»')
        sinConsultar()
      })

    // «No» o «0» parecen decir «sin mascotas» y hoy dejarían las mascotas dentro
    // sin avisar: la lista saldría distinta de la que se pidió.
    test.each([['no'], ['0'], ['False'], ['si']])(
      'incluir_mascotas=%j no es true ni false, es 400', async valor => {
        expectRechazo(await llamar(ctrl.bandeja, { incluir_mascotas: valor }),
          '«incluir_mascotas»', 'true', 'false')
        sinConsultar()
      })

    // Un parámetro repetido llega como arreglo y nunca es igual a una rama ni a
    // un estado; en las fechas caía al defecto sin decirlo.
    test.each([
      ['rama', ['SALA', 'RESIDENCIA']], ['estado', ['PENDIENTE', 'GESTIONADA']],
      ['incluir_mascotas', ['true', 'false']],
      ['desde', ['2026-11-01', '2026-11-02']], ['hasta', ['2026-11-01', '2026-11-02']],
    ])('%s repetido (llega como arreglo) es 400', async (campo, valor) => {
      expectRechazo(await llamar(ctrl.bandeja, { [campo]: valor }), `«${campo}»`)
      sinConsultar()
    })

    // Un filtro válido no tapa a otro inválido, en ningún orden.
    test('un filtro válido junto a uno inválido sigue siendo 400', async () => {
      expectRechazo(await llamar(ctrl.bandeja, { rama: 'SALA', estado: 'XYZ' }), '«estado»')
      expectRechazo(await llamar(ctrl.bandeja, { estado: 'PENDIENTE', rama: 'XYZ' }), '«rama»')
      expectRechazo(await llamar(ctrl.bandeja, { rama: 'SALA', incluir_mascotas: 'no' }), '«incluir_mascotas»')
      sinConsultar()
    })

    test('los valores válidos se aceptan: cada rama y cada estado, con PENDIENTE', async () => {
      for (const rama of ['SALA', 'RESIDENCIA', 'OTRA_CIUDAD']) {
        const { res } = await llamar(ctrl.bandeja, { rama })
        expect(res.codigo).toBe(200)
      }
      for (const estado of ESTADOS_GESTION) {
        const { res } = await llamar(ctrl.bandeja, { estado })
        expect(res.codigo).toBe(200)
      }
    })

    // La bandeja llama PENDIENTE a toda orden sin gestión y deja pedirla como
    // filtro porque el catálogo de estados ya trae PENDIENTE: el filtro usa el
    // catálogo tal cual, sin sumarle nada. Lo que hace que eso funcione es esto, y
    // es lo que se fija: si el catálogo dejara de traerlo, «lo que falta por
    // llamar» pasaría a ser un 400 en el filtro más usado de la pantalla.
    test('el estado de una orden sin gestión (PENDIENTE) sigue siendo un estado del catálogo y un filtro válido', async () => {
      expect(ESTADOS_GESTION).toContain('PENDIENTE')
      expect(ctrl.FILTROS_BANDEJA.estado.valores).toContain('PENDIENTE')
      // Y se comporta como tal: la orden sin gestión sale al pedirlo.
      const { res } = await llamar(ctrl.bandeja, { estado: 'PENDIENTE' })
      expect(res.codigo).toBe(200)
      expect(res.cuerpo.data.map(f => f.orden_servicio)).toEqual(['A-1', 'MAS-9', 'A-3'])
    })

    // El conjunto de ramas válidas no es una lista aparte que pueda desfasarse de
    // lo que ramaDe calcula: toda rama que sale en una fila se puede pedir.
    test('toda rama que la bandeja produce se puede pedir como filtro', async () => {
      db.query = jest.fn(async () => [[ASISTENCIA_A1]])
      const todas = await llamar(ctrl.bandeja)
      const producidas = [...new Set(todas.res.cuerpo.data.map(f => f.rama))]
      // Que el escenario produzca las tres: sin esto la prueba no cubriría nada.
      expect(producidas.sort()).toEqual(['OTRA_CIUDAD', 'RESIDENCIA', 'SALA'])
      for (const rama of producidas) {
        const { res } = await llamar(ctrl.bandeja, { rama })
        expect(res.codigo).toBe(200)
        expect(res.cuerpo.data.length).toBeGreaterThan(0)
        expect(res.cuerpo.data.every(f => f.rama === rama)).toBe(true)
      }
    })

    // La clase entera: no se lista cada filtro a mano. Todo filtro que exista en
    // FILTROS_BANDEJA rechaza un valor que no existe y acepta los que declara; si
    // mañana se agrega uno, esta prueba lo cubre sin que nadie la toque.
    test('todo filtro declarado rechaza un valor inexistente y acepta los suyos', async () => {
      expect(ctrl.FILTROS_BANDEJA).toBeDefined()
      expect(Object.keys(ctrl.FILTROS_BANDEJA))
        .toEqual(expect.arrayContaining(['rama', 'estado', 'incluir_mascotas']))
      for (const [campo, def] of Object.entries(ctrl.FILTROS_BANDEJA)) {
        expectRechazo(await llamar(ctrl.bandeja, { [campo]: '__no_existe__' }), `«${campo}»`)
        for (const valor of def.valores) {
          const { res } = await llamar(ctrl.bandeja, { [campo]: valor })
          expect([campo, valor, res.codigo]).toEqual([campo, valor, 200])
        }
      }
    })

    // Declarar un filtro sin sus valores válidos es la forma de volver a la lista
    // vacía muda; el módulo no carga si alguien lo hace.
    test('un filtro sin valores declarados, o sin cómo aplicarse, impide cargar el módulo', () => {
      const aplica = () => true
      expect(() => ctrl.verificarFiltros(ctrl.FILTROS_BANDEJA)).not.toThrow()
      expect(() => ctrl.verificarFiltros({ nuevo: { aplica } })).toThrow(/nuevo.*valores/)
      expect(() => ctrl.verificarFiltros({ nuevo: { valores: [], aplica } })).toThrow(/nuevo.*valores/)
      expect(() => ctrl.verificarFiltros({ nuevo: { valores: 'SALA', aplica } })).toThrow(/nuevo.*valores/)
      expect(() => ctrl.verificarFiltros({ nuevo: { valores: ['A'] } })).toThrow(/nuevo.*aplica/)
    })

    // La validación va antes del ERP: con el ERP caído, una entrada mal escrita
    // sigue siendo del que escribió, no una caída que no es.
    test('la entrada inválida se rechaza antes de consultar el ERP', async () => {
      ks.ordenesDelRango = jest.fn(async () => { throw ERROR_ERP })
      const r = await llamar(ctrl.bandeja, { rama: 'XYZ' })
      expectRechazo(r, '«rama»')
      expect(ks.ordenesDelRango).not.toHaveBeenCalled()
    })
  })

  describe('cuando algo falla', () => {
    test('si el ERP no está configurado responde 503 y lo dice', async () => {
      ks.configurado = jest.fn(() => false)
      const { res } = await llamar(ctrl.bandeja)
      expect(res.codigo).toBe(503)
      expect(res.cuerpo.mensaje).toMatch(/ERP|Karing/i)
      expect(ks.ordenesDelRango).not.toHaveBeenCalled()
    })

    // Lo peor que puede hacer la bandeja es devolver una lista vacía cuando el
    // ERP no responde: parece que no hay nadie a quien llamar.
    test('si el ERP falla responde 503 en vez de reventar', async () => {
      ks.ordenesDelRango = jest.fn(async () => { throw ERROR_ERP })
      const { res, next } = await llamar(ctrl.bandeja)
      expect(res.codigo).toBe(503)
      expect(res.cuerpo.mensaje).toMatch(/ERP|Karing/i)
      expect(res.cuerpo.data).toBeUndefined()
      expect(next).not.toHaveBeenCalled()
    })

    // El log tiene que seguir siendo diagnosticable: de un error del ERP se
    // escribe su nombre y su código (y el número de SQL Server cuando lo trae),
    // que es lo que dice si fue red, login o consulta.
    test('el 503 deja en el log la causa que el mensaje no da', async () => {
      ks.ordenesDelRango = jest.fn(async () => { throw ERROR_ERP })
      await llamar(ctrl.bandeja)
      expect(console.warn).toHaveBeenCalledTimes(1)
      expect(logEscrito()).toContain('ESOCKET')
    })

    // El mensaje de mssql puede llevar el apellido de la familia: es PII y no
    // entra al log de pm2, ni acá ni en la búsqueda ni en la ficha.
    test('el log no lleva el mensaje del ERP, que puede traer el nombre de la familia', async () => {
      ks.ordenesDelRango = jest.fn(async () => { throw ERROR_ERP_CON_NOMBRE })
      const { res } = await llamar(ctrl.bandeja)
      expect(res.codigo).toBe(503)
      const log = logEscrito()
      expect(log).not.toContain('MARTINEZ')
      expect(log).not.toContain('GUERRERO')
      expect(log).not.toContain('Conversion failed')
      // Y aun así se puede diagnosticar.
      expect(log).toContain('EREQUEST')
      expect(log).toContain('245')
    })

    // La psicóloga escribió algo mal: no es una caída del ERP y no debe decírselo.
    test('una entrada inválida que rechaza el ERP se responde 400, no 503', async () => {
      ks.ordenesDelRango = jest.fn(async () => { throw malUso('"desde" debe ser una fecha') })
      const { res, next } = await llamar(ctrl.bandeja, { desde: '2026-11-04' })
      expect(res.codigo).toBe(400)
      expect(res.cuerpo.mensaje).toBe('"desde" debe ser una fecha')
      expect(next).not.toHaveBeenCalled()
    })

    // Un fallo de MySQL no es una caída del ERP: no se le dice a nadie que el
    // ERP falló cuando el problema está en otro lado.
    test('si falla H360 el error sigue su camino y no se disfraza de caída del ERP', async () => {
      db.query = jest.fn(async () => { throw new Error('ER_NO_SUCH_TABLE') })
      const { res, next } = await llamar(ctrl.bandeja)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ER_NO_SUCH_TABLE' }))
      expect(res.cuerpo).toBeNull()
    })

    test('si falla la lectura de gestiones el error sigue su camino', async () => {
      svc.gestionesPorOrdenes = jest.fn(async () => { throw new Error('ER_NO_SUCH_TABLE') })
      const { res, next } = await llamar(ctrl.bandeja)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ER_NO_SUCH_TABLE' }))
      expect(res.cuerpo).toBeNull()
    })
  })
})

describe('buscar', () => {
  test('exige al menos un criterio', async () => {
    const { res } = await llamar(ctrl.buscar)
    expect(res.codigo).toBe(400)
    expect(ks.buscarOrdenes).not.toHaveBeenCalled()
  })

  // El servicio devuelve vacío cuando los criterios son solo espacios: sin
  // este 400, la pantalla diría «sin resultados» donde debería decir «escribe algo».
  test('un criterio de solo espacios no cuenta como criterio', async () => {
    for (const query of [{ nombre: '   ' }, { contrato: ' ' }, { fecha_fallecimiento: ' ', nombre: '' }]) {
      const { res } = await llamar(ctrl.buscar, query)
      expect(res.codigo).toBe(400)
    }
    expect(ks.buscarOrdenes).not.toHaveBeenCalled()
  })

  test('pasa los tres criterios al ERP', async () => {
    await llamar(ctrl.buscar, {
      contrato: 'A-1', nombre: 'perez', fecha_fallecimiento: '2026-11-04', fecha_hasta: '2026-11-06',
    })
    expect(ks.buscarOrdenes).toHaveBeenCalledWith(expect.objectContaining({
      contrato: 'A-1', nombre: 'perez', fechaDesde: '2026-11-04', fechaHasta: '2026-11-06',
    }))
  })

  test('basta un solo criterio', async () => {
    for (const query of [{ contrato: 'A-1' }, { nombre: 'perez' }, { fecha_fallecimiento: '2026-11-04' }]) {
      const { res } = await llamar(ctrl.buscar, query)
      expect(res.codigo).toBe(200)
    }
    expect(ks.buscarOrdenes).toHaveBeenCalledTimes(3)
  })

  test('devuelve las filas con el mismo enriquecimiento que la bandeja', async () => {
    db.query = jest.fn(async () => [[ASISTENCIA_A1]])
    svc.gestionesPorOrdenes = jest.fn(async () => new Map([
      ['A-1', { id: 5, estado: 'GESTIONADA', tipificacion: 'OFRECIDO_EN_HOMENAJE', notas: 'PRIVADO' }],
    ]))
    const { res } = await llamar(ctrl.buscar, { nombre: 'perez' })
    expect(res.cuerpo.total).toBe(3)
    expect(fila(res, 'A-1').asistencia.codigo).toBe('H360-2026-0315')
    expect(fila(res, 'A-1').gestion).toEqual({
      id: 5, estado: 'GESTIONADA', tipificacion: 'OFRECIDO_EN_HOMENAJE',
    })
    expect(fila(res, 'MAS-9').es_mascota).toBe(true)
    expect(fila(res, 'A-3').asistencia).toBeNull()
    expect(JSON.stringify(res.cuerpo)).not.toContain('PRIVADO')
  })

  // La búsqueda arma las filas con la misma función que la bandeja (armarFilas):
  // el campo viaja en las dos respuestas y no puede quedar solo en una.
  test('cada fila trae rama_confirmada, igual que en la bandeja', async () => {
    db.query = jest.fn(async () => [[ASISTENCIA_A1]])
    const { res } = await llamar(ctrl.buscar, { nombre: 'perez' })
    expect(fila(res, 'A-1').rama_confirmada).toBe(true)   // homenaje en H360
    expect(fila(res, 'A-3').rama_confirmada).toBe(true)   // sede de otra ciudad
    expect(fila(res, 'MAS-9').rama).toBe('RESIDENCIA')
    expect(fila(res, 'MAS-9').rama_confirmada).toBe(false) // valor por defecto
  })

  test('una búsqueda sin coincidencias responde vacío, que es distinto de un fallo', async () => {
    ks.buscarOrdenes = jest.fn(async () => [])
    const { res } = await llamar(ctrl.buscar, { nombre: 'nadie' })
    expect(res.codigo).toBe(200)
    expect(res.cuerpo).toEqual({ total: 0, truncado: false, tope: 200, data: [] })
  })

  test('si el ERP no está configurado responde 503 y lo dice', async () => {
    ks.configurado = jest.fn(() => false)
    const { res } = await llamar(ctrl.buscar, { contrato: 'A-1' })
    expect(res.codigo).toBe(503)
    expect(res.cuerpo.mensaje).toMatch(/ERP|Karing/i)
    expect(ks.buscarOrdenes).not.toHaveBeenCalled()
  })

  test('si el ERP falla responde 503 y no una lista vacía', async () => {
    ks.buscarOrdenes = jest.fn(async () => { throw ERROR_ERP })
    const { res, next } = await llamar(ctrl.buscar, { contrato: 'A-1' })
    expect(res.codigo).toBe(503)
    expect(res.cuerpo.data).toBeUndefined()
    expect(next).not.toHaveBeenCalled()
    expect(logEscrito()).toContain('ESOCKET')
  })

  // La búsqueda es el peor sitio para esto: lo que se busca por nombre ES el
  // nombre de un ser querido, y el mensaje de mssql lo repite.
  test('el log de una búsqueda fallida no lleva el nombre que se buscó', async () => {
    ks.buscarOrdenes = jest.fn(async () => { throw ERROR_ERP_CON_NOMBRE })
    const { res } = await llamar(ctrl.buscar, { nombre: 'martinez guerrero' })
    expect(res.codigo).toBe(503)
    const log = logEscrito()
    expect(log.toUpperCase()).not.toContain('MARTINEZ')
    expect(log).not.toContain('Conversion failed')
    expect(log).toContain('EREQUEST')
  })

  test('una entrada inválida que rechaza el ERP se responde 400, no 503', async () => {
    ks.buscarOrdenes = jest.fn(async () => { throw malUso('el nombre es demasiado largo') })
    const { res, next } = await llamar(ctrl.buscar, { nombre: 'x'.repeat(500) })
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.mensaje).toBe('el nombre es demasiado largo')
    expect(next).not.toHaveBeenCalled()
  })

  test('si falla H360 el error sigue su camino y no se disfraza de caída del ERP', async () => {
    db.query = jest.fn(async () => { throw new Error('ER_NO_SUCH_TABLE') })
    const { res, next } = await llamar(ctrl.buscar, { contrato: 'A-1' })
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ER_NO_SUCH_TABLE' }))
    expect(res.cuerpo).toBeNull()
  })
  // Lo mismo que en la bandeja: «sin resultados» no puede ser el efecto de haber
  // escrito algo que no existe. Una fecha imposible se compara como texto en el
  // ERP y no coincide con nada; la psicóloga concluiría que la familia no está.
  describe('entradas que no pueden dar resultado', () => {
    test.each([
      ['fecha_fallecimiento', '2026-02-31'], ['fecha_fallecimiento', '2026-13-45'],
      ['fecha_hasta', '2026-13-45'], ['fecha_hasta', '2025-02-29'],
    ])('%s=%s: tiene la forma pero no existe, es 400', async (campo, valor) => {
      // El nombre cuenta como criterio: sin la validación esto sería un 200.
      const r = await llamar(ctrl.buscar, { nombre: 'perez', [campo]: valor })
      expectRechazo(r, `«${campo}»`, valor, 'no es una fecha que exista')
      expect(ks.buscarOrdenes).not.toHaveBeenCalled()
    })

    // El servicio ya rechaza la forma, pero nombra su parámetro interno
    // (fechaDesde); el controlador habla con el nombre que usa la API. Y dice lo
    // que pasa de verdad: «5/11/2026» no es una fecha mal puesta que «no exista».
    test('una fecha con forma inválida es 400 con el nombre del campo de la API y habla del formato', async () => {
      const r = await llamar(ctrl.buscar, { fecha_fallecimiento: '5/11/2026' })
      expectRechazo(r, '«fecha_fallecimiento»', 'debe ser una fecha en formato AAAA-MM-DD')
      expect(r.res.cuerpo.mensaje).not.toContain('que exista')
      expect(ks.buscarOrdenes).not.toHaveBeenCalled()
    })

    test('fecha_fallecimiento posterior a fecha_hasta es 400 y dice cuál es cuál', async () => {
      const r = await llamar(ctrl.buscar, { fecha_fallecimiento: '2026-11-10', fecha_hasta: '2026-11-04' })
      expectRechazo(r)
      expect(r.res.cuerpo.mensaje)
        .toMatch(/«fecha_fallecimiento» \(2026-11-10\).*«fecha_hasta» \(2026-11-04\)/)
      expect(ks.buscarOrdenes).not.toHaveBeenCalled()
    })

    test('las dos fechas iguales son un solo día, no un rango al revés', async () => {
      const { res } = await llamar(ctrl.buscar, { fecha_fallecimiento: '2026-11-04', fecha_hasta: '2026-11-04' })
      expect(res.codigo).toBe(200)
      expect(ks.buscarOrdenes).toHaveBeenCalledTimes(1)
    })

    // Un criterio repetido llega como arreglo y el servicio lo vuelve «a,b»: se
    // buscaría un nombre que no existe.
    test.each([
      ['nombre', ['ana', 'juan']], ['contrato', ['A-1', 'A-2']],
      ['fecha_fallecimiento', ['2026-11-01', '2026-11-02']],
    ])('%s repetido (llega como arreglo) es 400', async (campo, valor) => {
      // El nombre sale primero: así, sin la validación, solo el repetido da un 200.
      expectRechazo(await llamar(ctrl.buscar, { nombre: 'perez', [campo]: valor }), `«${campo}»`)
      expect(ks.buscarOrdenes).not.toHaveBeenCalled()
    })
  })

  // El ERP corta la búsqueda en 200 filas sin avisar: sin este aviso, una búsqueda
  // amplia parece completa y se concluye que una familia no está en el sistema.
  describe('aviso de truncado', () => {
    const ordenesN = n => Array.from({ length: n }, (_, i) => (
      { orden_servicio: `T-${i}`, nombre_ser_querido: 'PEREZ', sede: 'Sede Gran Colombia', convenio: '' }))

    test('con menos filas que el tope no hubo corte, y la respuesta dice cuál es el tope', async () => {
      ks.buscarOrdenes = jest.fn(async () => ordenesN(199))
      const { res } = await llamar(ctrl.buscar, { nombre: 'perez' })
      expect(res.cuerpo.truncado).toBe(false)
      expect(res.cuerpo.tope).toBe(200)
      expect(res.cuerpo.total).toBe(199)
    })

    // 200 filas pueden ser exactamente 200 o las primeras 200 de más: no se
    // distingue, así que se avisa. Un aviso de más cuesta una frase; uno de menos
    // cuesta una familia que nadie llama.
    test('con el tope exacto avisa que pudo haber más', async () => {
      ks.buscarOrdenes = jest.fn(async () => ordenesN(200))
      const { res } = await llamar(ctrl.buscar, { nombre: 'perez' })
      expect(res.cuerpo.truncado).toBe(true)
      expect(res.cuerpo.tope).toBe(200)
      expect(res.cuerpo.total).toBe(200)
      expect(res.cuerpo.data).toHaveLength(200)
    })

    test('si el servicio devolviera más del tope, también avisa', async () => {
      ks.buscarOrdenes = jest.fn(async () => ordenesN(201))
      const { res } = await llamar(ctrl.buscar, { nombre: 'perez' })
      expect(res.cuerpo.truncado).toBe(true)
      expect(res.cuerpo.total).toBe(201)
    })

    // El tope vive en el servicio del ERP (TOPE_BUSQUEDA, con el que buscarOrdenes
    // arma su TOP) y el controlador lo repite para deducir el corte. Si alguien lo
    // cambia allá y no acá, el aviso dejaría de saltar sin que nada se queje: esta
    // prueba lo ata. Compara el valor exportado; no lee el código de otro archivo.
    // (jest.requireActual: el servicio está simulado en este archivo.)
    test('el tope del controlador es el que exporta el servicio del ERP', () => {
      const { TOPE_BUSQUEDA: topeDelErp } = jest.requireActual('../../services/karingsoft.service')
      expect(typeof topeDelErp).toBe('number')
      expect(ctrl.TOPE_BUSQUEDA).toBe(topeDelErp)
    })
  })
})

// Las sedes que el ERP devuelve de verdad (3975 órdenes de servicio de 365 días,
// medidas el 2026-11-06), tal como llegan: con tilde en «San José» y con dos
// espacios en «Sede  Arauca».
describe('esOtraCiudad con las sedes reales del ERP', () => {
  const CONVENIO_LOCAL = 'Planes TRADICIONAL'

  test.each([
    ['Sede Gran Colombia', false],
    ['Mascotas', false],
    ['Cristo Rey Cucuta', false],
    ['Sede San José', false],
    ['Sede San Jose', false],
    ['Sede Pamplona', true],
    ['Sede Saravena', true],
    ['Sede  Arauca', true],
    ['Sede Tame', true],
  ])('%j -> otra ciudad: %s', (sede, esperado) => {
    expect(ctrl.esOtraCiudad({ sede, convenio: CONVENIO_LOCAL })).toBe(esperado)
  })

  test('no distingue mayúsculas ni espacios de más', () => {
    expect(ctrl.esOtraCiudad({ sede: '  sede   gran   colombia ', convenio: CONVENIO_LOCAL })).toBe(false)
    expect(ctrl.esOtraCiudad({ sede: 'SEDE  PAMPLONA', convenio: CONVENIO_LOCAL })).toBe(true)
  })

  // Antes el convenio «OLIVOS <otra ciudad>» bastaba. Se midió: 0 de 3975 órdenes
  // en un año lo traen en `descripcion_convenio`; el patrón existe en `entidad`
  // (328 órdenes), que es la sucursal que vendió el plan y no dónde es el
  // homenaje. La señal es la sede, nada más.
  test.each(['Olivos Bucaramanga', 'OLIVOS BOGOTA', 'Olivos Barrancabermeja', 'Olivos Cucuta'])(
    'el convenio %j no manda a nadie a otra ciudad: una sede local sigue siendo local', convenio => {
      expect(ctrl.esOtraCiudad({ sede: 'Sede Gran Colombia', convenio })).toBe(false)
    })

  test('sin sede no se adivina otra ciudad, ni siquiera con un convenio de otra sucursal', () => {
    expect(ctrl.esOtraCiudad({ sede: '', convenio: '' })).toBe(false)
    expect(ctrl.esOtraCiudad({ sede: null, convenio: null })).toBe(false)
    expect(ctrl.esOtraCiudad({ sede: '', convenio: 'Olivos Bucaramanga' })).toBe(false)
    expect(ctrl.esOtraCiudad({ convenio: 'Olivos Bucaramanga' })).toBe(false)
    expect(ctrl.esOtraCiudad({})).toBe(false)
  })
})

// `esOtraCiudad` responde «esta orden va a la rama telefónica»; esto responde
// otra cosa: «y eso lo SABEMOS». Son dos preguntas y antes se contestaban con
// una sola, así que una sede que nadie reconoce se afirmaba como dato.
describe('otraCiudadReconocida: cuándo «otra ciudad» es un dato y no una suposición', () => {
  const CONVENIO_LOCAL = 'Planes TRADICIONAL'

  // Las cuatro sedes foráneas del ERP (462 de 3975 órdenes en 365 días), con el
  // texto exacto con que llegan: se reconocen, y siguen yendo a otra ciudad.
  test.each(['Sede Pamplona', 'Sede Saravena', 'Sede  Arauca', 'Sede Tame'])(
    '%j es una sede foránea reconocida', sede => {
      expect(ctrl.otraCiudadReconocida({ sede, convenio: CONVENIO_LOCAL })).toBe(true)
      expect(ctrl.esOtraCiudad({ sede, convenio: CONVENIO_LOCAL })).toBe(true)
    })

  // Sin esta prueba, un editor que colapsara los dos espacios de la prueba de
  // arriba la dejaría pasando sin ejercitar lo que tiene que ejercitar.
  test('«Sede  Arauca» se prueba con sus dos espacios, y coincide también limpia', () => {
    expect('Sede  Arauca').toMatch(/ {2}/)
    expect(ctrl.otraCiudadReconocida({ sede: 'Sede  Arauca' })).toBe(true)
    expect(ctrl.otraCiudadReconocida({ sede: 'Sede Arauca' })).toBe(true)
  })

  test('no distingue capitalización ni espacios de más', () => {
    for (const sede of ['SEDE PAMPLONA', 'sede   saravena', '  Sede Arauca  ', 'sEdE  tAmE'])
      expect(ctrl.otraCiudadReconocida({ sede })).toBe(true)
  })

  // Una sede que el ERP gane mañana: va a la rama telefónica, sin confirmar,
  // hasta que alguien la agregue a la lista a conciencia.
  test.each(['Sede Los Patios', 'Sede Villa del Rosario'])(
    '%j no está medida: no se reconoce, pero sigue yendo a otra ciudad', sede => {
      expect(ctrl.otraCiudadReconocida({ sede, convenio: CONVENIO_LOCAL })).toBe(false)
      expect(ctrl.esOtraCiudad({ sede, convenio: CONVENIO_LOCAL })).toBe(true)
    })

  // Reconocer de más es lo que se está evitando: la sede se compara completa.
  test('se compara la sede completa y no por contenido', () => {
    expect(ctrl.otraCiudadReconocida({ sede: 'Sede Pamplona Norte' })).toBe(false)
    expect(ctrl.esOtraCiudad({ sede: 'Sede Pamplona Norte' })).toBe(true)
  })

  test.each(['Olivos Bucaramanga', 'OLIVOS BOGOTA', 'Olivos Cucuta'])(
    'el convenio %j NO es señal reconocida', convenio => {
      expect(ctrl.otraCiudadReconocida({ sede: 'Sede Gran Colombia', convenio })).toBe(false)
      expect(ctrl.otraCiudadReconocida({ sede: '', convenio })).toBe(false)
      expect(ctrl.otraCiudadReconocida({ convenio })).toBe(false)
    })

  // SEDES_LOCALES gana: ninguna de las cuatro foráneas vuelve foránea a una local.
  test.each(['Sede Gran Colombia', 'Mascotas', 'Cristo Rey Cucuta', 'Sede San José', 'Sede San Jose', 'MASCOTAS  CUCUTA'])(
    'la sede local %j no es foránea ni reconocida', sede => {
      expect(ctrl.otraCiudadReconocida({ sede, convenio: CONVENIO_LOCAL })).toBe(false)
      expect(ctrl.esOtraCiudad({ sede, convenio: CONVENIO_LOCAL })).toBe(false)
    })

  test('sin sede no se reconoce nada', () => {
    expect(ctrl.otraCiudadReconocida({ sede: '', convenio: '' })).toBe(false)
    expect(ctrl.otraCiudadReconocida({ sede: null })).toBe(false)
    expect(ctrl.otraCiudadReconocida({})).toBe(false)
  })

  // El detalle que venía con esto: la rama comparaba la sede por contenido y
  // esMascota con ===, así que una sede «MASCOTAS CUCUTA» era local para la rama
  // y no era mascota. Las dos normalizan con la MISMA función.
  test('la sede se normaliza con la misma función que esMascota', () => {
    const { normalizarSede, esMascota } = require('../../utils/duelo.catalogos')
    expect(ctrl.normalizarSede).toBe(normalizarSede)
    const sede = 'MASCOTAS  CUCUTA'
    expect(esMascota({ orden_servicio: '03233', sede })).toBe(true)
    expect(ctrl.esOtraCiudad({ sede, convenio: 'Planes TRADICIONAL' })).toBe(false)
  })
})
