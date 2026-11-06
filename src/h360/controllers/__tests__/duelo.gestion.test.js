// La ficha de una gestión del R-56 y lo que se hace desde ella: abrirla,
// editarla, anotar los intentos de contacto y guardar los seis servicios.
//
// Dos psicólogas trabajan la misma lista del día. Lo que se vigila acá:
//  - que la ficha de una gestión ya abierta siga sirviendo con el ERP caído;
//  - que dos psicólogas que abren la misma orden a la vez reciban un 409 y no
//    un 500;
//  - que quién atendió salga del login y no de lo que mande el navegador;
//  - que las notas clínicas no se cuelen en la ficha.
//
// Todo se simula: no hay conexión al ERP ni a MySQL.

jest.mock('../../config/db')
jest.mock('../../services/karingsoft.service')
jest.mock('../../services/duelo.service')

const ks   = require('../../services/karingsoft.service')
const svc  = require('../../services/duelo.service')
const db   = require('../../config/db')
const { malUso } = require('../../utils/errores')
const ctrl = require('../duelo.controller')

const resDoble = () => {
  const r = { codigo: 200, cuerpo: null }
  r.status = c => { r.codigo = c; return r }
  r.json = b => { r.cuerpo = b; return r }
  return r
}
const usuario = { usuario: 'JAZMIN', nombre: 'Jazmín', rol: 'psicologia' }

// Ejecuta un manejador con el usuario del login puesto y devuelve la respuesta
// y el `next` (si algo llegó a next, en producción habría sido un 500).
async function llamar(manejador, req) {
  const res = resDoble()
  const next = jest.fn()
  await manejador({ user: usuario, ...req }, res, next)
  return { res, next }
}

// Un 400 de verdad: con mensaje y sin pasar por next (que sería un 500).
function expectRechazo({ res, next }, ...fragmentos) {
  expect(res.codigo).toBe(400)
  expect(next).not.toHaveBeenCalled()
  for (const f of fragmentos) expect(res.cuerpo.mensaje).toMatch(f)
}

// ¿Hay una propiedad con ese nombre en cualquier nivel de la respuesta? Se mira
// la clave y no el texto: una observación que diga «tomé notas» no es una fuga.
const tieneClave = (valor, clave) =>
  valor !== null && typeof valor === 'object'
  && (Object.keys(valor).includes(clave)
      || Object.values(valor).some(v => tieneClave(v, clave)))

// ¿Queda un objeto Date en cualquier nivel de la respuesta? Express lo
// serializaría en UTC (toISOString): una gestión cerrada a las 16:05 en Cúcuta
// saldría como 21:05Z. Se busca el tipo y no el texto, para que valga igual en
// cualquier zona en que corra la prueba.
const contieneDate = valor =>
  valor instanceof Date
  || (valor !== null && typeof valor === 'object' && Object.values(valor).some(contieneDate))

const CONTRATO = {
  orden_servicio: 'A-1', sede: 'Sede Gran Colombia',
  nombre_ser_querido: 'JUAN PEREZ', fecha_fallecimiento: '2026-11-04',
  telefono: '3001234567', direccion: 'CLL 7 46 30',
}
const GESTION = { id: 5, orden_servicio: 'A-1', estado: 'EN_GESTION', observaciones: 'llamar en la tarde' }
const INTENTOS = [
  { id: 1, gestion_id: 5, momento: '2026-11-05 14:30', canal: 'LLAMADA', resultado: 'NO_CONTESTO',
    observacion: null, usuario: 'JAZMIN' },
  { id: 2, gestion_id: 5, momento: '2026-11-05 16:05', canal: 'WHATSAPP', resultado: 'CONTACTADO',
    observacion: 'pide que la llamen mañana', usuario: 'MARIA' },
]
const SERVICIOS = [
  { id: 1, gestion_id: 5, servicio: 'MISA_DE_MES', estado: 'ACEPTA', modalidad: 'PRESENCIAL',
    detalle: 'CATOLICA', observacion: null },
]
// La fila que asistenciasPorContrato lee de MySQL para el contrato A-1.
const FILA_ASISTENCIA = {
  id: 77, codigo: 'H360-2026-0315', contrato: 'A-1', estado: 'SALA',
  sala_codigo: 'SALGC06', sede_nombre: 'Gran Colombia', residencia_id: null,
}
// Lo que un error de MySQL trae cuando el índice único rechaza la inserción.
const errorDuplicado = () => Object.assign(
  new Error("Duplicate entry 'A-9' for key 'h360_duelo_gestion.uk_orden'"),
  { code: 'ER_DUP_ENTRY', errno: 1062 })

let advertencias
beforeEach(() => {
  jest.clearAllMocks()
  // Un ERP caído deja una línea de log con la causa; acá no hace falta verla
  // (la prueba del ERP caído sí comprueba que se escribe).
  advertencias = jest.spyOn(console, 'warn').mockImplementation(() => {})

  ks.configurado = jest.fn(() => true)
  ks.buscarOrdenes = jest.fn(async () => [CONTRATO])
  ks.ordenServicio = jest.fn(async () => { throw new Error('la ficha no usa ordenServicio') })

  // Todos los métodos del servicio se reponen aquí. Si una prueba reemplazara uno
  // y no se repusiera, su comportamiento se filtraría a las pruebas siguientes.
  svc.gestionPorOrden    = jest.fn(async () => GESTION)
  svc.crearGestion       = jest.fn(async () => 11)
  svc.actualizarGestion  = jest.fn(async () => true)
  svc.agregarIntento     = jest.fn(async () => 3)
  svc.intentosDeGestion  = jest.fn(async () => [])
  svc.guardarServicios   = jest.fn(async () => {})
  svc.serviciosDeGestion = jest.fn(async () => [])

  db.query = jest.fn(async () => [[]])
})

describe('exportaciones', () => {
  // El archivo ya exportaba la bandeja, la búsqueda y lo que sus pruebas usan;
  // agregar los manejadores nuevos no puede quitar nada de eso.
  test('suma los manejadores de la ficha sin quitar los de la bandeja', () => {
    for (const nombre of ['ficha', 'crear', 'actualizar', 'agregarIntento', 'guardarServicios',
                          'bandeja', 'buscar', 'esOtraCiudad', 'ramaDe', 'verificarFiltros'])
      expect(typeof ctrl[nombre]).toBe('function')
    expect(ctrl.FILTROS_BANDEJA).toBeDefined()
    expect(ctrl.TOPE_BUSQUEDA).toBe(200)
  })
})

describe('ficha', () => {
  test('junta el contrato del ERP con la gestión, los intentos y los servicios', async () => {
    svc.intentosDeGestion = jest.fn(async () => INTENTOS)
    svc.serviciosDeGestion = jest.fn(async () => SERVICIOS)
    const res = resDoble()
    await ctrl.ficha({ params: { orden: 'A-1' }, user: usuario }, res, jest.fn())
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.orden_servicio).toBe('A-1')
    expect(res.cuerpo.contrato.orden_servicio).toBe('A-1')
    expect(res.cuerpo.contrato.nombre_ser_querido).toBe('JUAN PEREZ')
    expect(res.cuerpo.erp_error).toBeNull()
    expect(res.cuerpo.gestion.id).toBe(5)
    // Lo que el servicio devuelve sale tal cual: en particular `momento` sigue
    // siendo el texto de hora de pared y no un Date que Express pasaría a UTC.
    expect(res.cuerpo.intentos).toEqual(INTENTOS)
    expect(typeof res.cuerpo.intentos[0].momento).toBe('string')
    expect(res.cuerpo.servicios).toEqual(SERVICIOS)
    // Y se piden por el id de la gestión de ESA orden, no por el de otra.
    expect(svc.intentosDeGestion).toHaveBeenCalledWith(5)
    expect(svc.serviciosDeGestion).toHaveBeenCalledWith(5)
    // La pantalla la usa para precargar la ubicación al abrir la gestión.
    expect(res.cuerpo).toHaveProperty('asistencia')
  })

  test('lee el contrato en vivo con buscarOrdenes, que es el que trae los datos de la ficha', async () => {
    await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
    expect(ks.buscarOrdenes).toHaveBeenCalledTimes(1)
    expect(ks.buscarOrdenes).toHaveBeenCalledWith({ contrato: 'A-1' })
    // ordenServicio no devuelve nombre, fallecimiento, teléfono ni dirección.
    expect(ks.ordenServicio).not.toHaveBeenCalled()
  })

  test('trae la asistencia de H360 de esa orden, con su sala', async () => {
    db.query = jest.fn(async () => [[FILA_ASISTENCIA]])
    const { res } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
    expect(db.query).toHaveBeenCalledTimes(1)
    expect(db.query.mock.calls[0][1]).toEqual(['A-1'])
    expect(res.cuerpo.asistencia).toEqual({
      id: 77, codigo: 'H360-2026-0315', estado: 'SALA',
      ubicacion_tipo: 'SALA', ubicacion_detalle: 'Gran Colombia · SALGC06',
    })
  })

  // El IN de MySQL no distingue mayúsculas y Map.get sí: con el número escrito a
  // mano en la URL en minúsculas, la consulta encontraba la asistencia y la
  // ficha decía que no había.
  test('encuentra la asistencia aunque el número de orden llegue en otra capitalización', async () => {
    db.query = jest.fn(async () => [[FILA_ASISTENCIA]])
    const { res } = await llamar(ctrl.ficha, { params: { orden: 'a-1' } })
    expect(db.query.mock.calls[0][1]).toEqual(['a-1'])
    expect(res.cuerpo.asistencia.id).toBe(77)
  })

  test('recorta el número de orden antes de buscar', async () => {
    const { res } = await llamar(ctrl.ficha, { params: { orden: '  A-1 ' } })
    expect(ks.buscarOrdenes).toHaveBeenCalledWith({ contrato: 'A-1' })
    expect(svc.gestionPorOrden).toHaveBeenCalledWith('A-1')
    expect(res.cuerpo.orden_servicio).toBe('A-1')
  })

  // El ERP caído no debe tumbar una gestión ya abierta: el trabajo del día
  // sigue, solo falta el bloque del contrato.
  test('con el ERP caído devuelve la gestión y avisa del contrato', async () => {
    ks.buscarOrdenes = jest.fn(async () => { throw new Error('ECONNREFUSED') })
    svc.intentosDeGestion = jest.fn(async () => INTENTOS)
    svc.serviciosDeGestion = jest.fn(async () => SERVICIOS)
    db.query = jest.fn(async () => [[FILA_ASISTENCIA]])
    const res = resDoble()
    const next = jest.fn()
    await ctrl.ficha({ params: { orden: 'A-1' }, user: usuario }, res, next)
    expect(res.codigo).toBe(200)
    expect(next).not.toHaveBeenCalled()
    expect(res.cuerpo.gestion.id).toBe(5)
    expect(res.cuerpo.contrato).toBeNull()
    expect(res.cuerpo.erp_error).toMatch(/ERP|Karing/i)
    // Todo lo nuestro sigue ahí: la bitácora, los servicios y la ubicación.
    expect(res.cuerpo.intentos).toEqual(INTENTOS)
    expect(res.cuerpo.servicios).toEqual(SERVICIOS)
    expect(res.cuerpo.asistencia.id).toBe(77)
    // Y la causa queda en el log para quien la busque.
    expect(advertencias).toHaveBeenCalledTimes(1)
    expect(String(advertencias.mock.calls[0])).toContain('ECONNREFUSED')
  })

  test('un ERP caído no se confunde con un contrato que no existe', async () => {
    ks.buscarOrdenes = jest.fn(async () => [])
    const { res } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.contrato).toBeNull()
    expect(res.cuerpo.erp_error).toBeNull()
  })

  // Un 400 del ERP es de quien escribió la orden (por ejemplo, más larga que el
  // campo), no una caída: decir «no se pudo leer el contrato» mandaría a la
  // psicóloga a esperar un ERP que está bien.
  test('una orden que el ERP rechaza por inválida es 400 y no un ERP caído', async () => {
    ks.buscarOrdenes = jest.fn(async () => {
      throw malUso('buscarOrdenes: "contrato" es demasiado largo: admite como máximo 20 caracteres y llegó con 45')
    })
    const r = await llamar(ctrl.ficha, { params: { orden: 'X'.repeat(45) } })
    expectRechazo(r, /contrato/)
    expect(r.res.cuerpo.erp_error).toBeUndefined()
    expect(advertencias).not.toHaveBeenCalled()
  })

  test('una orden sin nombre ni teléfono no rompe la ficha', async () => {
    // SAR-1883, de Saravena: el ERP trae cadena vacía en los dos, y no tiene caso
    // en H360 (el 46% de las órdenes), así que la gestión no apunta a ninguna asistencia.
    ks.buscarOrdenes = jest.fn(async () => [{
      orden_servicio: 'SAR-1883', sede: 'Saravena', nombre_ser_querido: '', telefono: '',
      direccion: '', fecha_fallecimiento: '2026-11-03',
    }])
    svc.gestionPorOrden = jest.fn(async () =>
      ({ id: 8, orden_servicio: 'SAR-1883', asistencia_id: null, telefonos: null, estado: 'EN_GESTION' }))
    const { res, next } = await llamar(ctrl.ficha, { params: { orden: 'SAR-1883' } })
    expect(next).not.toHaveBeenCalled()
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.contrato.orden_servicio).toBe('SAR-1883')
    expect(res.cuerpo.contrato.nombre_ser_querido).toBe('')
    expect(res.cuerpo.contrato.telefono).toBe('')
    expect(res.cuerpo.asistencia).toBeNull()
    expect(res.cuerpo.gestion.asistencia_id).toBeNull()
  })

  test('una orden sin gestión abierta devuelve el contrato y listas vacías', async () => {
    svc.gestionPorOrden = jest.fn(async () => null)
    const { res, next } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
    expect(next).not.toHaveBeenCalled()
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.contrato.nombre_ser_querido).toBe('JUAN PEREZ')
    expect(res.cuerpo.gestion).toBeNull()
    expect(res.cuerpo.intentos).toEqual([])
    expect(res.cuerpo.servicios).toEqual([])
    // Sin gestión no hay id por el que preguntar.
    expect(svc.intentosDeGestion).not.toHaveBeenCalled()
    expect(svc.serviciosDeGestion).not.toHaveBeenCalled()
  })

  test.each([
    ['en blanco', '   '],
    ['vacío', ''],
    ['ausente', undefined],
  ])('exige el número de orden (%s)', async (_, orden) => {
    const r = await llamar(ctrl.ficha, { params: { orden } })
    expectRechazo(r, /orden/i)
    expect(ks.buscarOrdenes).not.toHaveBeenCalled()
    expect(svc.gestionPorOrden).not.toHaveBeenCalled()
  })

  test('un fallo de MySQL no se disfraza de respuesta: va a next', async () => {
    const falla = new Error('ER_ACCESS_DENIED')
    svc.gestionPorOrden = jest.fn(async () => { throw falla })
    const { res, next } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
    expect(next).toHaveBeenCalledWith(falla)
    expect(res.cuerpo).toBeNull()
  })

  // La gestión llega del servicio con un SELECT *: lo que la tabla gane mañana
  // saldría en la ficha sin que nadie lo decidiera, y como el servicio está
  // simulado ninguna prueba lo vería. Por eso la ficha PROYECTA: devuelve las
  // columnas de esta lista y no otras, y agregar una es una decisión explícita
  // (se toca el controlador y esta lista, a la vista de quien revisa).
  describe('la gestión de la ficha sale proyectada y con las fechas como texto', () => {
    // Escrita a mano a propósito: no se deriva del controlador, para que la
    // prueba diga qué columnas se decidió servir.
    const COLUMNAS_DE_LA_FICHA = [
      'id', 'orden_servicio', 'asistencia_id', 'ubicacion_tipo', 'ubicacion_detalle',
      'es_mascota', 'titular_nombre', 'titular_parentesco', 'telefonos', 'tipificacion',
      'estado', 'observaciones', 'psicologa', 'psicologa_acompanante', 'cerrada_at',
      'created_by', 'created_at', 'updated_at',
    ]
    // Las columnas DATETIME llegan como Date: mysql2 los arma con los dígitos de la
    // base interpretados en la zona del proceso, que es lo que hace new Date(a, m, d, h, mi).
    const FILA_GESTION = {
      id: 5, orden_servicio: 'A-1', asistencia_id: 77, ubicacion_tipo: 'SALA',
      ubicacion_detalle: 'Gran Colombia · SALGC06', es_mascota: 0,
      titular_nombre: 'ANA PEREZ', titular_parentesco: 'HIJA', telefonos: '3001234567',
      tipificacion: 'ATENCION_POR_LLAMADA', estado: 'GESTIONADA', observaciones: 'llamar en la tarde',
      psicologa: 'MARIA', psicologa_acompanante: 'JAZMIN',
      cerrada_at: new Date(2026, 10, 5, 16, 5, 30), created_by: 'JAZMIN',
      created_at: new Date(2026, 10, 5, 9, 0, 0), updated_at: new Date(2026, 10, 5, 16, 5, 31),
    }

    test('devuelve solo las columnas declaradas: una columna nueva de la tabla no se sirve sola', async () => {
      svc.gestionPorOrden = jest.fn(async () => (
        { ...FILA_GESTION, columna_nueva: 'LO QUE SEA', notas: 'CONTENIDO CLINICO' }))
      const { res, next } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
      expect(next).not.toHaveBeenCalled()
      expect(Object.keys(res.cuerpo.gestion).sort()).toEqual([...COLUMNAS_DE_LA_FICHA].sort())
      expect(tieneClave(res.cuerpo, 'columna_nueva')).toBe(false)
      expect(tieneClave(res.cuerpo, 'notas')).toBe(false)
      expect(JSON.stringify(res.cuerpo)).not.toContain('CONTENIDO CLINICO')
    })

    test('los valores de las columnas servidas salen tal cual, salvo las fechas', async () => {
      svc.gestionPorOrden = jest.fn(async () => FILA_GESTION)
      const { res } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
      expect(res.cuerpo.gestion).toEqual({
        ...FILA_GESTION,
        cerrada_at: '2026-11-05 16:05', created_at: '2026-11-05 09:00', updated_at: '2026-11-05 16:05',
      })
    })

    // Una cerrada_at de las 16:05 sale 16:05, como `momento` de los intentos, y no
    // como 21:05Z. Es la hora de pared que escribió la base, sin aritmética de zonas.
    test('las fechas DATETIME salen como texto de hora de pared, igual que `momento`', async () => {
      svc.gestionPorOrden = jest.fn(async () => FILA_GESTION)
      svc.intentosDeGestion = jest.fn(async () => INTENTOS)
      const { res } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
      expect(res.cuerpo.gestion.cerrada_at).toBe('2026-11-05 16:05')
      expect(res.cuerpo.gestion.created_at).toBe('2026-11-05 09:00')
      expect(res.cuerpo.gestion.updated_at).toBe('2026-11-05 16:05')
      // El mismo formato que ya traen los intentos en la misma respuesta.
      expect(res.cuerpo.intentos[0].momento).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
      expect(res.cuerpo.gestion.cerrada_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    })

    // Lo anterior solo distingue «hora de pared» de «hora UTC» cuando la máquina
    // que corre las pruebas NO está en UTC (en un proceso en UTC los dos getters
    // coinciden y todo pasaría igual). Esta prueba no depende de dónde se corra: lee
    // la fecha en procesos de Node con otras zonas, armándola como la arma mysql2
    // (con los dígitos de la base en la zona del proceso).
    test('la hora de pared sale igual en procesos que corren en cualquier zona horaria', () => {
      const { execFileSync } = require('child_process')
      const ZONAS = ['UTC', 'America/Bogota', 'Asia/Tokyo', 'Pacific/Auckland', 'America/Los_Angeles']
      const script = `
        const c = require(${JSON.stringify(require.resolve('../duelo.controller'))})
        const salida = {}
        for (const tz of ${JSON.stringify(ZONAS)}) {
          process.env.TZ = tz
          salida[tz] = [
            c.horaDePared(new Date(2026, 10, 5, 16, 5, 30)),
            c.horaDePared(new Date(2026, 0, 1, 0, 0, 0)),
            c.horaDePared(new Date(2026, 11, 31, 23, 59, 59)),
          ]
        }
        console.log(JSON.stringify(salida))`
      // El proceso hijo arranca sin TZ y la fija él mismo en cada vuelta.
      const entorno = { ...process.env }
      delete entorno.TZ
      const salida = JSON.parse(execFileSync(process.execPath, ['-e', script],
        { env: entorno, encoding: 'utf8', timeout: 20000 }))
      for (const tz of ZONAS)
        expect([tz, salida[tz]]).toEqual([tz, ['2026-11-05 16:05', '2026-01-01 00:00', '2026-12-31 23:59']])
    })

    test('una gestión abierta (cerrada_at nulo) conserva el nulo', async () => {
      svc.gestionPorOrden = jest.fn(async () => ({ ...FILA_GESTION, estado: 'EN_GESTION', cerrada_at: null }))
      const { res } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
      expect(res.cuerpo.gestion.cerrada_at).toBeNull()
    })

    test('una orden sin gestión sigue dando gestion nulo', async () => {
      svc.gestionPorOrden = jest.fn(async () => null)
      const { res } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
      expect(res.cuerpo.gestion).toBeNull()
    })

    // La misma trampa estaba en los servicios (SELECT * con created_at y
    // updated_at): la regla es de la respuesta entera, no de un campo.
    test('ninguna fecha de la respuesta sale como Date: ni en la gestión, ni en los intentos, ni en los servicios', async () => {
      svc.gestionPorOrden = jest.fn(async () => FILA_GESTION)
      svc.intentosDeGestion = jest.fn(async () => (
        INTENTOS.map(i => ({ ...i, created_at: new Date(2026, 10, 5, 14, 31, 0) }))))
      svc.serviciosDeGestion = jest.fn(async () => (
        SERVICIOS.map(s => ({ ...s, created_at: new Date(2026, 10, 5, 9, 1, 0), updated_at: new Date(2026, 10, 5, 9, 2, 0) }))))
      const { res } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
      expect(contieneDate(res.cuerpo)).toBe(false)
      expect(res.cuerpo.servicios[0].created_at).toBe('2026-11-05 09:01')
      expect(res.cuerpo.servicios[0].updated_at).toBe('2026-11-05 09:02')
      expect(res.cuerpo.intentos[0].created_at).toBe('2026-11-05 14:31')
      // Y serializada no queda ningún instante en UTC.
      expect(JSON.stringify(res.cuerpo)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
    })
  })

  // Ley 1581 de 2012: las notas de una atención son dato de salud de un tercero
  // y solo salen por su propia ruta. La ficha no debe tocar esa tabla ni traer
  // la propiedad, ni siquiera para quien sí puede leerla.
  test('nunca trae notas', async () => {
    db.query = jest.fn(async sql => (/h360_duelo_atenciones/.test(sql)
      ? [[{ id: 1, gestion_id: 5, notas: 'CONTENIDO CLINICO' }]]
      : [[FILA_ASISTENCIA]]))
    svc.intentosDeGestion = jest.fn(async () => INTENTOS)
    svc.serviciosDeGestion = jest.fn(async () => SERVICIOS)
    const { res, next } = await llamar(ctrl.ficha, { params: { orden: 'A-1' } })
    // El doble de respuesta arranca en 200 y con cuerpo nulo: sin estas dos
    // líneas, un manejador que terminara en `next` también pasaría (sin
    // respuesta no hay nada que filtrar, pero tampoco se comprobó nada).
    expect(next).not.toHaveBeenCalled()
    expect(res.cuerpo).not.toBeNull()
    expect(res.codigo).toBe(200)
    expect(tieneClave(res.cuerpo, 'notas')).toBe(false)
    expect(JSON.stringify(res.cuerpo)).not.toContain('CONTENIDO CLINICO')
    expect(db.query.mock.calls.some(([sql]) => /atenciones/i.test(sql))).toBe(false)
  })
})

describe('crear', () => {
  test('abre la gestión con la psicóloga del login, no de la petición', async () => {
    svc.gestionPorOrden = jest.fn(async () => null)
    svc.crearGestion = jest.fn(async () => 11)
    const res = resDoble()
    await ctrl.crear({
      body: { orden_servicio: 'A-9', ubicacion_tipo: 'SALA', psicologa: 'OTRA_PERSONA' },
      user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(201)
    expect(res.cuerpo).toEqual({ id: 11, orden_servicio: 'A-9' })
    expect(svc.crearGestion.mock.calls[0][0].psicologa).toBe('JAZMIN')
  })

  test('quién la abrió y en qué estado nace no los decide el navegador', async () => {
    svc.gestionPorOrden = jest.fn(async () => null)
    await llamar(ctrl.crear, {
      body: { orden_servicio: 'A-9', ubicacion_tipo: 'SALA', estado: 'GESTIONADA',
              created_by: 'OTRA_PERSONA', psicologa: 'OTRA_PERSONA' },
    })
    const datos = svc.crearGestion.mock.calls[0][0]
    expect(datos.estado).toBe('EN_GESTION')
    expect(datos.created_by).toBe('JAZMIN')
    expect(datos.psicologa).toBe('JAZMIN')
  })

  test('pasa al servicio los datos de la ficha tal como llegaron', async () => {
    svc.gestionPorOrden = jest.fn(async () => null)
    await llamar(ctrl.crear, {
      body: {
        orden_servicio: 'A-9', asistencia_id: 77, ubicacion_tipo: 'SALA',
        ubicacion_detalle: 'Gran Colombia · SALGC06', es_mascota: true,
        titular_nombre: 'ANA PEREZ', titular_parentesco: 'HIJA', telefonos: '3001234567-3109876543',
      },
    })
    expect(svc.crearGestion).toHaveBeenCalledTimes(1)
    expect(svc.crearGestion.mock.calls[0][0]).toEqual({
      orden_servicio: 'A-9', asistencia_id: 77, ubicacion_tipo: 'SALA',
      ubicacion_detalle: 'Gran Colombia · SALGC06', es_mascota: true,
      titular_nombre: 'ANA PEREZ', titular_parentesco: 'HIJA', telefonos: '3001234567-3109876543',
      estado: 'EN_GESTION', psicologa: 'JAZMIN', created_by: 'JAZMIN',
    })
  })

  test('lo que no llegó queda nulo y la ubicación cae en OTRO', async () => {
    svc.gestionPorOrden = jest.fn(async () => null)
    await llamar(ctrl.crear, { body: { orden_servicio: 'A-9' } })
    expect(svc.crearGestion.mock.calls[0][0]).toEqual({
      orden_servicio: 'A-9', asistencia_id: null, ubicacion_tipo: 'OTRO', ubicacion_detalle: null,
      es_mascota: false, titular_nombre: null, titular_parentesco: null, telefonos: null,
      estado: 'EN_GESTION', psicologa: 'JAZMIN', created_by: 'JAZMIN',
    })
  })

  test('recorta el número de orden', async () => {
    svc.gestionPorOrden = jest.fn(async () => null)
    const { res } = await llamar(ctrl.crear, { body: { orden_servicio: '  A-9 ', ubicacion_tipo: 'SALA' } })
    expect(svc.gestionPorOrden).toHaveBeenCalledWith('A-9')
    expect(svc.crearGestion.mock.calls[0][0].orden_servicio).toBe('A-9')
    expect(res.cuerpo.orden_servicio).toBe('A-9')
  })

  test('una orden ya gestionada responde 409 y dice cuál', async () => {
    const res = resDoble()
    await ctrl.crear({
      body: { orden_servicio: 'A-1', ubicacion_tipo: 'SALA' }, user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(409)
    expect(res.cuerpo.gestion_id).toBe(5)
    expect(svc.crearGestion).not.toHaveBeenCalled()
  })

  test('exige el número de orden', async () => {
    const res = resDoble()
    await ctrl.crear({ body: { ubicacion_tipo: 'SALA' }, user: usuario }, res, jest.fn())
    expect(res.codigo).toBe(400)
  })

  test.each([
    ['en blanco', { orden_servicio: '   ', ubicacion_tipo: 'SALA' }],
    ['sin cuerpo', undefined],
  ])('no abre nada sin número de orden (%s)', async (_, body) => {
    const r = await llamar(ctrl.crear, { body })
    expectRechazo(r, /orden/i)
    expect(svc.gestionPorOrden).not.toHaveBeenCalled()
    expect(svc.crearGestion).not.toHaveBeenCalled()
  })

  // Las dos psicólogas ven la misma lista y pueden abrir la misma orden en el
  // mismo segundo: el chequeo previo pasa en las dos y el índice único rechaza a
  // la segunda. A ella le toca el 409 que le dice que su compañera ya la abrió.
  test('si otra psicóloga la abrió a la vez, el índice único da 409 y no 500', async () => {
    svc.gestionPorOrden = jest.fn()
      .mockResolvedValueOnce(null)                      // el chequeo previo no la ve
      .mockResolvedValueOnce({ id: 7, orden_servicio: 'A-9' }) // ya la abrió la otra
    svc.crearGestion = jest.fn(async () => { throw errorDuplicado() })
    const { res, next } = await llamar(ctrl.crear, { body: { orden_servicio: 'A-9', ubicacion_tipo: 'SALA' } })
    expect(next).not.toHaveBeenCalled()
    expect(res.codigo).toBe(409)
    expect(res.cuerpo.gestion_id).toBe(7)
    expect(res.cuerpo.mensaje).toMatch(/ya tiene una gestión/i)
    expect(svc.gestionPorOrden).toHaveBeenCalledTimes(2)
    expect(svc.gestionPorOrden).toHaveBeenLastCalledWith('A-9')
  })

  test('si el duplicado no se deja leer después, igual es 409', async () => {
    svc.gestionPorOrden = jest.fn(async () => null)
    svc.crearGestion = jest.fn(async () => { throw errorDuplicado() })
    const { res, next } = await llamar(ctrl.crear, { body: { orden_servicio: 'A-9', ubicacion_tipo: 'SALA' } })
    expect(next).not.toHaveBeenCalled()
    expect(res.codigo).toBe(409)
    expect(res.cuerpo.gestion_id).toBeNull()
  })

  test('solo el duplicado se vuelve 409: cualquier otro fallo de MySQL sigue siendo un fallo', async () => {
    svc.gestionPorOrden = jest.fn(async () => null)
    const falla = Object.assign(new Error('Deadlock found'), { code: 'ER_LOCK_DEADLOCK', errno: 1213 })
    svc.crearGestion = jest.fn(async () => { throw falla })
    const { res, next } = await llamar(ctrl.crear, { body: { orden_servicio: 'A-9', ubicacion_tipo: 'SALA' } })
    expect(next).toHaveBeenCalledWith(falla)
    expect(res.cuerpo).toBeNull()
    expect(svc.gestionPorOrden).toHaveBeenCalledTimes(1)
  })

  test('un dato inválido que el servicio rechaza sale como 400', async () => {
    svc.gestionPorOrden = jest.fn(async () => null)
    svc.crearGestion = jest.fn(async () => { throw malUso('La ubicación del homenaje no es válida') })
    const r = await llamar(ctrl.crear, { body: { orden_servicio: 'A-9', ubicacion_tipo: 'PALOMAR' } })
    expectRechazo(r, /ubicación/)
  })
})

describe('actualizar', () => {
  test('guarda los cambios sobre la gestión indicada', async () => {
    const { res, next } = await llamar(ctrl.actualizar, {
      params: { id: '5' }, body: { estado: 'GESTIONADA', tipificacion: 'ATENCION_POR_LLAMADA' },
    })
    expect(next).not.toHaveBeenCalled()
    expect(res.codigo).toBe(200)
    expect(res.cuerpo).toEqual({ ok: true })
    expect(svc.actualizarGestion).toHaveBeenCalledWith('5',
      { estado: 'GESTIONADA', tipificacion: 'ATENCION_POR_LLAMADA' })
  })

  test('si no cambió nada responde 400 y lo dice', async () => {
    svc.actualizarGestion = jest.fn(async () => false)
    const r = await llamar(ctrl.actualizar, { params: { id: '5' }, body: {} })
    expectRechazo(r, /No hay cambios/)
  })

  test('sin cuerpo no revienta: el servicio recibe un objeto vacío', async () => {
    svc.actualizarGestion = jest.fn(async () => false)
    const r = await llamar(ctrl.actualizar, { params: { id: '5' }, body: undefined })
    expectRechazo(r, /No hay cambios/)
    expect(svc.actualizarGestion).toHaveBeenCalledWith('5', {})
  })

  // Decisión del dueño del sistema: la psicóloga SÍ se puede reasignar. Una
  // psicóloga sale de turno, se incapacita o entra a vacaciones y la otra
  // continúa el caso. La auditoría no se pierde por eso, porque la fila dice dos
  // cosas distintas: `created_by` (quién la ABRIÓ: sale del login al crearla y
  // ningún PATCH lo toca) y `psicologa` (quién la TIENE ahora: es la que cambia).
  // Esta prueba fija las dos mitades.
  describe('reasignar la gestión a otra psicóloga', () => {
    test('psicologa se puede cambiar: llega al servicio tal como la mandaron', async () => {
      const { res, next } = await llamar(ctrl.actualizar, {
        params: { id: '5' }, body: { psicologa: 'MARIA', estado: 'EN_GESTION' },
      })
      expect(next).not.toHaveBeenCalled()
      expect(res.codigo).toBe(200)
      expect(svc.actualizarGestion).toHaveBeenCalledWith('5', { psicologa: 'MARIA', estado: 'EN_GESTION' })
    })

    test('mandar solo la psicóloga es un cambio como cualquier otro', async () => {
      const { res } = await llamar(ctrl.actualizar, { params: { id: '5' }, body: { psicologa: 'MARIA' } })
      expect(res.codigo).toBe(200)
      expect(res.cuerpo).toEqual({ ok: true })
      expect(svc.actualizarGestion).toHaveBeenCalledWith('5', { psicologa: 'MARIA' })
    })

    // Las dos mitades juntas y de punta a punta: aquí el servicio NO está
    // simulado (sí la base), así que lo que se mira es lo que de verdad se
    // escribiría en la fila. Un `created_by` que llegara en el cuerpo y entrara
    // al UPDATE borraría la huella de quién abrió la gestión.
    test('se cambia quién la tiene (psicologa) y no quién la abrió (created_by)', async () => {
      svc.actualizarGestion = jest.requireActual('../../services/duelo.service').actualizarGestion
      db.query = jest.fn(async () => [{ affectedRows: 1 }])
      const { res } = await llamar(ctrl.actualizar, {
        params: { id: '5' }, body: { psicologa: 'MARIA', created_by: 'OTRA_PERSONA' },
      })
      expect(res.codigo).toBe(200)
      expect(db.query).toHaveBeenCalledTimes(1)
      const [sql, params] = db.query.mock.calls[0]
      expect(params[0]).toEqual({ psicologa: 'MARIA' })
      expect(params[1]).toBe('5')
      expect(sql).not.toMatch(/created_by/)
    })

    test('quien abrió la gestión sale del login al crearla', async () => {
      svc.gestionPorOrden = jest.fn(async () => null)
      await llamar(ctrl.crear, { body: { orden_servicio: 'A-9', ubicacion_tipo: 'SALA', created_by: 'OTRA_PERSONA' } })
      expect(svc.crearGestion.mock.calls[0][0].created_by).toBe('JAZMIN')
    })

    test('no toca el cuerpo de la petición', async () => {
      const body = { psicologa: ' MARIA ', estado: 'GESTIONADA' }
      await llamar(ctrl.actualizar, { params: { id: '5' }, body })
      expect(body).toEqual({ psicologa: ' MARIA ', estado: 'GESTIONADA' })
    })

    // Ahora que el campo es escribible, un valor que no es una psicóloga no puede
    // dejar el caso sin responsable (un texto en blanco cumple el NOT NULL de la
    // tabla y aun así no es nadie) ni reventar la base con un 500.
    test.each([
      ['en blanco', '   '], ['vacía', ''], ['nula', null], ['un número', 7],
      ['una lista', ['ANA', 'MARIA']], ['más larga que la columna (50)', 'x'.repeat(51)],
    ])('una psicóloga %s es 400 y no se guarda nada', async (_, psicologa) => {
      const r = await llamar(ctrl.actualizar, {
        params: { id: '5' }, body: { psicologa, estado: 'GESTIONADA' },
      })
      expectRechazo(r, /psicóloga/)
      expect(svc.actualizarGestion).not.toHaveBeenCalled()
    })

    test('la psicóloga llega recortada, y de 50 caracteres exactos cabe', async () => {
      await llamar(ctrl.actualizar, { params: { id: '5' }, body: { psicologa: '  MARIA ' } })
      expect(svc.actualizarGestion).toHaveBeenLastCalledWith('5', { psicologa: 'MARIA' })
      await llamar(ctrl.actualizar, { params: { id: '5' }, body: { psicologa: 'x'.repeat(50) } })
      expect(svc.actualizarGestion).toHaveBeenLastCalledWith('5', { psicologa: 'x'.repeat(50) })
    })
  })

  test('el resto de los campos de la ficha pasan, incluida la acompañante', async () => {
    const cambios = {
      ubicacion_tipo: 'RESIDENCIA', ubicacion_detalle: 'CLL 7 46 30', titular_nombre: 'ANA PEREZ',
      titular_parentesco: 'HIJA', telefonos: '3001234567', observaciones: 'prefiere la tarde',
      psicologa_acompanante: 'MARIA', asistencia_id: 77,
    }
    await llamar(ctrl.actualizar, { params: { id: '5' }, body: cambios })
    expect(svc.actualizarGestion).toHaveBeenCalledWith('5', cambios)
  })

  test('un dato inválido que el servicio rechaza sale como 400 con su mensaje', async () => {
    svc.actualizarGestion = jest.fn(async () => { throw malUso('La tipificación no es válida') })
    const r = await llamar(ctrl.actualizar, { params: { id: '5' }, body: { tipificacion: 'XX' } })
    expectRechazo(r, /tipificación/)
    expect(r.res.cuerpo.ok).toBeUndefined()
  })

  test('un fallo de MySQL va a next', async () => {
    const falla = new Error('ER_LOCK_WAIT_TIMEOUT')
    svc.actualizarGestion = jest.fn(async () => { throw falla })
    const { res, next } = await llamar(ctrl.actualizar, { params: { id: '5' }, body: { estado: 'GESTIONADA' } })
    expect(next).toHaveBeenCalledWith(falla)
    expect(res.cuerpo).toBeNull()
  })
})

describe('agregarIntento', () => {
  test('registra el intento con el usuario del login', async () => {
    svc.agregarIntento = jest.fn(async () => 3)
    const res = resDoble()
    await ctrl.agregarIntento({
      params: { id: '5' },
      body: { momento: '2026-11-05T14:30', canal: 'LLAMADA', resultado: 'NO_CONTESTO' },
      user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(201)
    expect(svc.agregarIntento.mock.calls[0][1].usuario).toBe('JAZMIN')
  })

  test('pasa al servicio la gestión y los datos del intento, y devuelve el id', async () => {
    const { res } = await llamar(ctrl.agregarIntento, {
      params: { id: '5' },
      body: { momento: '2026-11-05T14:30', canal: 'WHATSAPP', resultado: 'CONTACTADO',
              observacion: 'pide que la llamen mañana', usuario: 'OTRA_PERSONA' },
    })
    expect(res.codigo).toBe(201)
    expect(res.cuerpo).toEqual({ id: 3 })
    // `usuario` del cuerpo se ignora: el intento queda a nombre de quien inició sesión.
    expect(svc.agregarIntento).toHaveBeenCalledWith('5', {
      momento: '2026-11-05T14:30', canal: 'WHATSAPP', resultado: 'CONTACTADO',
      observacion: 'pide que la llamen mañana', usuario: 'JAZMIN',
    })
  })

  test('la observación es opcional y llega como nula', async () => {
    await llamar(ctrl.agregarIntento, {
      params: { id: '5' },
      body: { momento: '2026-11-05T14:30', canal: 'LLAMADA', resultado: 'NO_CONTESTO' },
    })
    expect(svc.agregarIntento.mock.calls[0][1].observacion).toBeNull()
  })

  test('un error de validación del servicio sale como 400', async () => {
    svc.agregarIntento = jest.fn(async () => {
      const e = new Error('El canal del intento no es válido'); e.status = 400; throw e
    })
    const res = resDoble()
    await ctrl.agregarIntento({
      params: { id: '5' }, body: { canal: 'PALOMA' }, user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.mensaje).toMatch(/canal/i)
  })

  test('sin cuerpo es el servicio quien lo rechaza, con 400', async () => {
    svc.agregarIntento = jest.fn(async () => { throw malUso('El canal del intento no es válido') })
    const r = await llamar(ctrl.agregarIntento, { params: { id: '5' }, body: undefined })
    expectRechazo(r, /canal/)
  })

  test('un fallo de MySQL va a next y no se contesta como éxito', async () => {
    const falla = new Error('ER_NO_REFERENCED_ROW_2')
    svc.agregarIntento = jest.fn(async () => { throw falla })
    const { res, next } = await llamar(ctrl.agregarIntento, {
      params: { id: '5' },
      body: { momento: '2026-11-05T14:30', canal: 'LLAMADA', resultado: 'NO_CONTESTO' },
    })
    expect(next).toHaveBeenCalledWith(falla)
    expect(res.cuerpo).toBeNull()
  })
})

describe('guardarServicios', () => {
  test('guarda la lista y devuelve lo que quedó', async () => {
    svc.guardarServicios = jest.fn(async () => {})
    svc.serviciosDeGestion = jest.fn(async () => [{ servicio: 'MISA_DE_MES', estado: 'ACEPTA' }])
    const res = resDoble()
    await ctrl.guardarServicios({
      params: { id: '5' },
      body: { servicios: [{ servicio: 'MISA_DE_MES', estado: 'ACEPTA', modalidad: 'PRESENCIAL' }] },
      user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.data[0].servicio).toBe('MISA_DE_MES')
  })

  test('lo que devuelve se lee DESPUÉS de guardar y de la misma gestión', async () => {
    const lista = [
      { servicio: 'MISA_DE_MES', estado: 'ACEPTA', modalidad: 'PRESENCIAL', detalle: 'CATOLICA' },
      { servicio: 'TALLER_NINOS', estado: 'NO_DESEA' },
    ]
    await llamar(ctrl.guardarServicios, { params: { id: '5' }, body: { servicios: lista } })
    expect(svc.guardarServicios).toHaveBeenCalledWith('5', lista)
    expect(svc.serviciosDeGestion).toHaveBeenCalledWith('5')
    // Leer antes de guardar devolvería la lista vieja.
    expect(svc.guardarServicios.mock.invocationCallOrder[0])
      .toBeLessThan(svc.serviciosDeGestion.mock.invocationCallOrder[0])
  })

  // La misma regla que en la ficha: los servicios traen created_at y updated_at
  // (DATETIME) y no pueden salir como Date, que Express serializaría en UTC.
  test('lo que devuelve lleva las fechas como texto de hora de pared y no como Date', async () => {
    svc.serviciosDeGestion = jest.fn(async () => [{
      id: 1, gestion_id: 5, servicio: 'MISA_DE_MES', estado: 'ACEPTA', modalidad: 'PRESENCIAL',
      detalle: 'CATOLICA', observacion: null,
      created_at: new Date(2026, 10, 5, 9, 1, 0), updated_at: new Date(2026, 10, 5, 16, 5, 40),
    }])
    const { res } = await llamar(ctrl.guardarServicios, {
      params: { id: '5' }, body: { servicios: [{ servicio: 'MISA_DE_MES', estado: 'ACEPTA' }] },
    })
    expect(contieneDate(res.cuerpo)).toBe(false)
    expect(res.cuerpo.data[0].created_at).toBe('2026-11-05 09:01')
    expect(res.cuerpo.data[0].updated_at).toBe('2026-11-05 16:05')
  })

  test('una lista vacía es válida: no guarda nada y devuelve lo que hay', async () => {
    svc.serviciosDeGestion = jest.fn(async () => SERVICIOS)
    const { res } = await llamar(ctrl.guardarServicios, { params: { id: '5' }, body: { servicios: [] } })
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.data).toEqual(SERVICIOS)
  })

  test('exige que servicios sea una lista', async () => {
    const res = resDoble()
    await ctrl.guardarServicios({
      params: { id: '5' }, body: { servicios: 'MISA' }, user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(400)
  })

  test.each([
    ['un objeto', { servicios: { servicio: 'MISA_DE_MES' } }],
    ['nulo', { servicios: null }],
    ['ausente', {}],
    ['sin cuerpo', undefined],
  ])('rechaza con 400 si servicios es %s, y no toca la base', async (_, body) => {
    const r = await llamar(ctrl.guardarServicios, { params: { id: '5' }, body })
    expectRechazo(r, /lista/)
    expect(svc.guardarServicios).not.toHaveBeenCalled()
    expect(svc.serviciosDeGestion).not.toHaveBeenCalled()
  })

  test('un servicio inválido es 400 y no devuelve una lista a medias', async () => {
    svc.guardarServicios = jest.fn(async () => { throw malUso('El servicio PALOMAR no es uno de los del R-56') })
    const r = await llamar(ctrl.guardarServicios, {
      params: { id: '5' }, body: { servicios: [{ servicio: 'PALOMAR', estado: 'ACEPTA' }] },
    })
    expectRechazo(r, /PALOMAR/)
    expect(r.res.cuerpo.data).toBeUndefined()
    expect(svc.serviciosDeGestion).not.toHaveBeenCalled()
  })

  test('un fallo de MySQL va a next', async () => {
    const falla = new Error('ER_LOCK_DEADLOCK')
    svc.guardarServicios = jest.fn(async () => { throw falla })
    const { res, next } = await llamar(ctrl.guardarServicios, {
      params: { id: '5' }, body: { servicios: [{ servicio: 'MISA_DE_MES', estado: 'ACEPTA' }] },
    })
    expect(next).toHaveBeenCalledWith(falla)
    expect(res.cuerpo).toBeNull()
  })
})
