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

const ORDENES = [
  { orden_servicio: 'A-1', nombre_ser_querido: 'JUAN PEREZ', sede: 'Sede Gran Colombia',
    convenio: 'Planes TRADICIONAL', fecha_fallecimiento: '2026-11-04' },
  { orden_servicio: 'MAS-9', nombre_ser_querido: 'MASCOTA MAX', sede: 'Mascotas',
    convenio: 'Otros Servicios', fecha_fallecimiento: '2026-11-04' },
  { orden_servicio: 'A-3', nombre_ser_querido: 'ANA RUIZ', sede: 'Sede Pamplona',
    convenio: 'Olivos Bucaramanga', fecha_fallecimiento: '2026-11-04' },
]

const ASISTENCIA_A1 = {
  id: 77, codigo: 'H360-2026-0315', contrato: 'A-1', estado: 'SALA',
  viene_otra_ciudad: 0, sala_codigo: 'SALGC06', sede_nombre: 'Gran Colombia',
}

const ERROR_ERP = Object.assign(new Error('ECONNREFUSED'), { code: 'ESOCKET' })

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
    })
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
      viene_otra_ciudad: 0, sala_codigo: null, sede_nombre: null, residencia_id: 9,
    }]])
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-3').rama).toBe('RESIDENCIA')
    expect(fila(res, 'A-3').asistencia.ubicacion_tipo).toBe('RESIDENCIA')
    expect(fila(res, 'A-3').asistencia.ubicacion_detalle).toBeNull()
  })

  test('una asistencia sin homenaje todavía no decide la rama: la decide la sede', async () => {
    db.query = jest.fn(async () => [[{
      id: 81, codigo: 'H360-2026-0401', contrato: 'A-3', estado: 'ASISTENCIA',
      viene_otra_ciudad: 0, sala_codigo: null, sede_nombre: null, residencia_id: null,
    }]])
    const { res } = await llamar(ctrl.bandeja)
    expect(fila(res, 'A-3').asistencia.ubicacion_tipo).toBeNull()
    expect(fila(res, 'A-3').rama).toBe('OTRA_CIUDAD')
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
    // Se fija «hoy» (hora local, como lo lee el controlador): comparar solo que
    // las dos fechas difieran un día pasaría también con «anteayer y ayer».
    const fijarHoy = (anio, mes, dia) => jest.useFakeTimers({
      now: new Date(anio, mes - 1, dia, 10, 0, 0),
      doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate',
        'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    })
    afterEach(() => { jest.useRealTimers() })

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

    // Comportamiento que fija la tarea: una fecha con forma inválida no
    // detiene la bandeja, se usa el defecto. La respuesta dice qué rango se usó.
    test('una fecha con forma inválida cae al defecto y la respuesta dice el rango usado', async () => {
      fijarHoy(2026, 11, 5)
      const { res } = await llamar(ctrl.bandeja, { desde: 'ayer', hasta: '5/11/2026' })
      expect(ks.ordenesDelRango).toHaveBeenCalledWith('2026-11-04', '2026-11-05')
      expect([res.cuerpo.desde, res.cuerpo.hasta]).toEqual(['2026-11-04', '2026-11-05'])
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

    test('el 503 deja en el log la causa que el mensaje no da', async () => {
      ks.ordenesDelRango = jest.fn(async () => { throw ERROR_ERP })
      await llamar(ctrl.bandeja)
      expect(console.warn).toHaveBeenCalledWith(expect.any(String), 'ECONNREFUSED')
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

  test('una búsqueda sin coincidencias responde vacío, que es distinto de un fallo', async () => {
    ks.buscarOrdenes = jest.fn(async () => [])
    const { res } = await llamar(ctrl.buscar, { nombre: 'nadie' })
    expect(res.codigo).toBe(200)
    expect(res.cuerpo).toEqual({ total: 0, data: [] })
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
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), 'ECONNREFUSED')
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
})

// Las sedes que el ERP devuelve de verdad (30 días de producción), tal como
// llegan: con tilde en «San José» y con dos espacios en «Sede  Arauca».
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

  // La sede y el convenio son dos señales independientes: una sola basta.
  test('el convenio de otra sucursal de Olivos basta aunque la sede sea local', () => {
    expect(ctrl.esOtraCiudad({ sede: 'Sede Gran Colombia', convenio: 'Olivos Bucaramanga' })).toBe(true)
  })

  test('el convenio de Olivos Cucuta es local', () => {
    expect(ctrl.esOtraCiudad({ sede: 'Sede Gran Colombia', convenio: 'Olivos Cucuta' })).toBe(false)
  })

  test('sin sede ni convenio no se adivina otra ciudad', () => {
    expect(ctrl.esOtraCiudad({ sede: '', convenio: '' })).toBe(false)
    expect(ctrl.esOtraCiudad({ sede: null, convenio: null })).toBe(false)
    expect(ctrl.esOtraCiudad({})).toBe(false)
  })
})
