// src/h360/controllers/__tests__/duelo.atenciones.test.js
// Las notas de una atención son dato de salud de un tercero. La Ley 1581 de
// 2012 las trata como sensibles. Acá se prueba que solo salen por su propia
// ruta y solo para quien puede leerlas.
//
// Todo se simula: no hay conexión a MySQL. El servicio es el de verdad; lo que
// se reemplaza es el pool.

const util = require('util')
const winston = require('winston')

// El setImmediate de verdad, capturado antes de que la guarda simule los
// temporizadores: es lo que deja pasar un turno del bucle de eventos.
const inmediatoReal = setImmediate

jest.mock('../../config/db')
const db = require('../../config/db')

// El logger del repo (src/utils/logger.js) es winston con transportes a archivo
// y a stderr; no pasa por console, así que espiar console no lo ve. Aquí se
// reemplaza por un doble que no escribe nada y que, para CUALQUIER método que
// se le pida (error, warn, info, log, child...), vuelca lo que recibe a
// `mockLogger.escrito` con util.inspect en el momento de la llamada.
//
// El doble tiene que PARECERSE al winston real en todo lo que un condicional
// puede mirar; si no, esconde lo que el logger real haría y una fuga detrás de
// un `if` pasa en verde:
//   - Los predicados (isLevelEnabled y todos los is<Nivel>Enabled) devuelven
//     true. En el winston real son true para los niveles habilitados; aquí lo
//     están todos, que es el peor caso para quien vigila.
//   - `level` es una cadena de nivel, como en el real (allí es
//     process.env.LOG_LEVEL || 'info'). Por defecto 'debug', el que se activa
//     con LOG_LEVEL=debug; el barrido por niveles de más abajo recorre los
//     siete, porque una comparación de igualdad solo se cumple con uno.
//   - `levels` es el objeto npm de winston, para que `levels[level] >= ...`
//     compare números de verdad.
//   - Los métodos de registro devuelven el logger (se encadenan, como en el
//     real) y startTimer() devuelve un objeto con done(), que también escribe.
// El prefijo `mock` del nombre es lo que deja a jest.mock (que se eleva al
// inicio del archivo) referirse a la variable.
const NIVEL_DEL_DOBLE = 'debug'
const mockLogger = { escrito: [], nivel: NIVEL_DEL_DOBLE }
jest.mock('../../../utils/logger', () => {
  const inspeccionar = require('util').inspect
  const NIVELES = require('winston').config.npm.levels
  const registrar = (...args) => {
    mockLogger.escrito.push(inspeccionar(args, { depth: null }))
    return logger
  }
  const logger = new Proxy({}, {
    get: (_obj, metodo) => {
      if (typeof metodo === 'symbol' || metodo === 'then' || metodo === '__esModule') return undefined
      if (metodo === 'level') return mockLogger.nivel
      if (metodo === 'levels') return NIVELES
      if (metodo === 'silent') return false
      if (metodo === 'getHighestLogLevel') return () => NIVELES[mockLogger.nivel]
      if (metodo === 'isLevelEnabled' || /^is\w+Enabled$/.test(metodo)) return () => true
      // child(meta) devuelve un logger que lleva `meta` en cada línea: lo que
      // se le pase también es una vía de salida.
      if (metodo === 'child') return (...args) => { registrar(...args); return logger }
      if (metodo === 'startTimer') return () => ({ logger, start: Date.now(), done: registrar })
      return registrar
    },
  })
  return logger
})
const logger = require('../../../utils/logger')
const ctrl = require('../duelo_atenciones.controller')

const resDoble = () => {
  const r = { codigo: 200, cuerpo: null }
  r.status = c => { r.codigo = c; return r }
  r.json = b => { r.cuerpo = b; return r }
  return r
}

// Todas las propiedades función de console, propias o heredadas. Quedan fuera
// el constructor `Console` (una clase, no escribe nada) y los métodos de
// Object.prototype (toString, hasOwnProperty...), que no son vías de salida y
// que espiar rompería util.inspect. No se corta la cadena comparando con
// `Object.prototype` porque la consola de jest viene de otro contexto (vm) y su
// Object.prototype no es el de este archivo.
const DE_OBJECT = new Set(Object.getOwnPropertyNames(Object.prototype))
function metodosDeConsola() {
  const nombres = new Set()
  for (let o = console; o; o = Object.getPrototypeOf(o)) {
    for (const nombre of Object.getOwnPropertyNames(o)) {
      if (DE_OBJECT.has(nombre) || nombre === 'Console') continue
      if (typeof Object.getOwnPropertyDescriptor(o, nombre).value === 'function') nombres.add(nombre)
    }
  }
  return [...nombres]
}

// Deja salir lo que el código haya diferido (ver «Qué cubre» en la guarda):
// espera un turno real del bucle de eventos, que deja correr los nextTick y las
// promesas, y vacía los temporizadores simulados.
async function asentarDiferidos() {
  // Varias vueltas: un diferido puede agendar otro (un nextTick que agenda un
  // setImmediate, un temporizador que agenda una promesa...).
  for (let i = 0; i < 3; i++) {
    await new Promise(resolver => inmediatoReal(resolver))
    jest.runAllTimers()
  }
}

// Guarda de logs: vigila por dónde podría salir texto hacia un log.
//
// Qué cubre:
//   - TODAS las propiedades función de console, propias o heredadas (se
//     enumeran con metodosDeConsola, no hay lista fija: la lista de cinco
//     métodos que había dejaba fuera console.dir y console.dirxml). Que esa
//     enumeración no se quede corta se comprueba contra otra fuente, la
//     Console.prototype de Node (ver la prueba de la guarda más abajo).
//   - TODOS los métodos del logger del repo (winston, src/utils/logger.js),
//     que escribe a archivo y a stderr sin pasar por console. Está simulado
//     arriba (mockLogger) con la forma del real, predicados y nivel incluidos.
//   - Escritura diferida: process.nextTick, setImmediate, setTimeout y
//     setInterval (de cualquier plazo) y promesas encadenadas. Los temporizadores
//     se simulan mientras la guarda está instalada y se vacían, junto con un
//     turno real del bucle de eventos, ANTES de leer el volcado (asentarDiferidos).
//   - Los siete niveles del logger (barrido por niveles) y todos los caminos de
//     salida de crear y listar, 403 incluidos (CASOS_DE_SALIDA).
//   - Los campos de salud de la atención: notas, motivo, atendido_nombre,
//     atendido_parentesco y acompanante (SENSIBLES).
// Qué NO cubre:
//   - Escribir directo en process.stdout / process.stderr o a un archivo con fs,
//     otra librería de logging que no sea ese logger, ni lo que corra fuera del
//     controlador (por ejemplo un manejador de errores global que serialice req).
//   - Un valor transformado antes de escribirse (base64, un hash, otra
//     capitalización, partido en trozos): se busca el texto tal cual.
//   - Una escritura diferida que no pase por los temporizadores ni por un turno
//     del bucle: el callback de una operación de E/S que termine más tarde
//     (fs.appendFile con callback, un socket), un hilo o un proceso hijo, o algo
//     que ocurra cuando la prueba ya terminó.
//
// Lo que recibe cada llamada se vuelca a texto EN EL MOMENTO de la llamada, con
// util.inspect, que también imprime las propiedades de un Error (un `.sql`
// dentro de un Error sale en el log). Guardar solo la referencia no sirve: si
// el código le quita la propiedad al error después de loguearlo, la prueba
// vería el error ya limpio.
//
// El volcado es asíncrono a propósito: `await guarda.volcado()` espera a que
// salga lo diferido (asentarDiferidos) antes de devolver el texto.
function espiarRegistros(nivel = NIVEL_DEL_DOBLE) {
  const escrito = []
  mockLogger.escrito = escrito
  mockLogger.nivel = nivel
  // Solo los temporizadores: Date, nextTick, queueMicrotask, etc. siguen siendo
  // los de verdad para no alterar al servicio ni a jest.
  jest.useFakeTimers({
    doNotFake: ['Date', 'hrtime', 'nextTick', 'performance', 'queueMicrotask',
      'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback'],
  })
  const espias = metodosDeConsola().map(m => jest.spyOn(console, m).mockImplementation((...args) => {
    escrito.push(util.inspect(args, { depth: null }))
  }))
  return {
    volcado: async () => {
      await asentarDiferidos()
      return escrito.join('\n')
    },
    restaurar: () => {
      espias.forEach(e => e.mockRestore())
      jest.useRealTimers()
      mockLogger.escrito = []
      mockLogger.nivel = NIVEL_DEL_DOBLE
    },
  }
}

const PSICOLOGA = { rol: 'psicologia', usuario: 'JAZMIN' }
const BODY_OK = { momento: '2026-11-05T14:30', modalidad: 'PRESENCIAL' }

// Todos los demás roles que el directorio puede dar (ROLES_POR_GRUPO en
// ldap.service.js). El dueño del sistema decidió que el rol de psicología es
// único para las dos psicólogas y la auxiliar, así que «solo psicología»
// significa el módulo y nadie más de H360.
const ROLES_SIN_ACCESO = [
  'coordinador', 'supervisora', 'contabilidad', 'asesor', 'recepcion', 'asistente',
  'tanatologo', 'asistente_tanatologo', 'tramitador',
]

// Los campos del cuerpo de una atención que son dato de salud. Quién fue
// atendido y su parentesco, ligados a una atención psicológica, lo son tanto
// como las notas: son familias en duelo. Cada campo lleva un valor reconocible;
// si aparece en un volcado, salió a un log.
const SENSIBLES = {
  notas:               'SECRETO_CLINICO',
  motivo:              'SECRETO_MOTIVO',
  atendido_nombre:     'SECRETO_ATENDIDO',
  atendido_parentesco: 'SECRETO_PARENTESCO',
  acompanante:         'SECRETO_ACOMPANANTE',
}
const SECRETOS = Object.values(SENSIBLES)
// Los siete niveles de winston (npm), los que el logger del repo puede tener.
const NIVELES = Object.keys(winston.config.npm.levels)
const BODY_SENSIBLE = { ...BODY_OK, ...SENSIBLES }
// La sentencia ya armada que mysql2 le cuelga a un error (`err.sql`): lleva los
// valores adentro, y con ellos los cinco campos.
const SQL_CON_SECRETOS =
  'INSERT INTO h360_duelo_atenciones (gestion_id, atendido_nombre, notas) VALUES (5, ' +
  SECRETOS.map(v => `'${v}'`).join(', ') + ')'

// Qué campos sensibles aparecen en un volcado. Devuelve la lista de campos (no
// un booleano) para que, si la prueba se pone roja, diga cuál se filtró.
const secretosEn = volcado =>
  Object.entries(SENSIBLES).filter(([, valor]) => volcado.includes(valor)).map(([campo]) => campo)

// Los usuarios del login que no traen un nombre utilizable. Los usan la prueba
// de «crear exige un usuario» y el barrido de la guarda de logs.
const USUARIOS_SIN_NOMBRE = [
  ['sin usuario',                    { rol: 'psicologia' }],
  ['usuario null',                   { rol: 'psicologia', usuario: null }],
  ['usuario vacío',                  { rol: 'psicologia', usuario: '' }],
  ['usuario de solo espacios',       { rol: 'psicologia', usuario: '   ' }],
  ['usuario numérico',               { rol: 'psicologia', usuario: 42 }],
  ['usuario que es un objeto',       { rol: 'psicologia', usuario: { nombre: 'JAZMIN' } }],
  ['usuario que es un arreglo',      { rol: 'psicologia', usuario: ['JAZMIN'] }],
  ['admin sin usuario',              { rol: 'admin' }],
]

// Otras formas de no pasar la compuerta de permiso, además de ROLES_SIN_ACCESO:
// la compuerta falla cerrada con lo que no es un usuario bien formado.
const SIN_ACCESO_OTRAS = [
  ['req.user indefinido',   undefined],
  ['req.user null',         null],
  ['req.user es un texto',  'psicologia'],
  ['usuario sin rol',       { usuario: 'X' }],
  ['rol que es un arreglo', { rol: ['psicologia'], usuario: 'X' }],
  ['rol activo distinto aunque tenga psicología en roles',
    { rol: 'coordinador', roles: ['coordinador', 'psicologia'], usuario: 'X' }],
]

beforeEach(() => {
  jest.clearAllMocks()
  db.query = jest.fn(async () => [[{
    id: 1, gestion_id: 5, momento: '2026-11-05 14:30:00', modalidad: 'PRESENCIAL',
    psicologa: 'JAZMIN', motivo: 'crisis de la hija', notas: 'contenido clínico',
  }]])
})

describe('listar', () => {
  test('psicología ve las atenciones con sus notas', async () => {
    const res = resDoble()
    await ctrl.listar({ params: { id: '5' }, user: { rol: 'psicologia', usuario: 'JAZMIN' } },
      res, jest.fn())
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.data[0].notas).toBe('contenido clínico')
  })

  test('admin también', async () => {
    const res = resDoble()
    await ctrl.listar({ params: { id: '5' }, user: { rol: 'admin', usuario: 'A' } }, res, jest.fn())
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.data[0].notas).toBe('contenido clínico')
  })

  // Lo importante: ningún otro rol, por más alto que sea en la operación.
  test.each(ROLES_SIN_ACCESO)(
    'el rol %s recibe 403 y no consulta la base', async rol => {
      const res = resDoble()
      await ctrl.listar({ params: { id: '5' }, user: { rol, usuario: 'X' } }, res, jest.fn())
      expect(res.codigo).toBe(403)
      expect(JSON.stringify(res.cuerpo)).not.toContain('notas')
      expect(db.query).not.toHaveBeenCalled()
    })

  test('sin usuario, 403', async () => {
    const res = resDoble()
    await ctrl.listar({ params: { id: '5' }, user: undefined }, res, jest.fn())
    expect(res.codigo).toBe(403)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('un usuario sin rol, 403', async () => {
    const res = resDoble()
    await ctrl.listar({ params: { id: '5' }, user: { usuario: 'X' } }, res, jest.fn())
    expect(res.codigo).toBe(403)
    expect(db.query).not.toHaveBeenCalled()
  })

  // Vale el rol activo (`rol`), igual que el requireRol de la ruta. Que el
  // directorio le dé también el de psicología no basta: tiene que haberlo
  // elegido al entrar o con /auth/rol.
  test('tener psicología en `roles` no basta si el rol activo es otro', async () => {
    const res = resDoble()
    await ctrl.listar({
      params: { id: '5' },
      user: { rol: 'coordinador', roles: ['coordinador', 'psicologia'], usuario: 'X' },
    }, res, jest.fn())
    expect(res.codigo).toBe(403)
    expect(db.query).not.toHaveBeenCalled()
  })

  // Si el filtro por gestión se pierde, la respuesta mezcla las notas de otras
  // familias en la ficha de esta.
  test('pide solo las atenciones de la gestión de la ruta, de la más antigua a la más nueva', async () => {
    await ctrl.listar({ params: { id: '5' }, user: PSICOLOGA }, resDoble(), jest.fn())
    const [sql, params] = db.query.mock.calls[0]
    expect(params).toEqual(['5'])
    expect(sql.replace(/\s+/g, ' ')).toMatch(/WHERE gestion_id = \? ORDER BY momento ASC, id ASC/)
  })

  test('si la base falla, pasa el error a next y no responde con datos', async () => {
    db.query = jest.fn(async () => { throw new Error('se cayó') })
    const res = resDoble(), next = jest.fn()
    await ctrl.listar({ params: { id: '5' }, user: PSICOLOGA }, res, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.cuerpo).toBeNull()
  })
})

describe('crear', () => {
  test('guarda la hora tal como se escribió', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    const res = resDoble()
    await ctrl.crear({
      params: { id: '5' },
      body: { momento: '2026-11-05T14:30', modalidad: 'PRESENCIAL',
              motivo: 'crisis', notas: 'algo' },
      user: { rol: 'psicologia', usuario: 'JAZMIN' },
    }, res, jest.fn())
    expect(res.codigo).toBe(201)
    const params = db.query.mock.calls[0][1]
    expect(params).toContain('2026-11-05 14:30:00')
  })

  test('la psicóloga sale del login', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    await ctrl.crear({
      params: { id: '5' },
      body: { momento: '2026-11-05T14:30', modalidad: 'PRESENCIAL', psicologa: 'OTRA' },
      user: { rol: 'psicologia', usuario: 'JAZMIN' },
    }, resDoble(), jest.fn())
    expect(db.query.mock.calls[0][1]).toContain('JAZMIN')
    expect(db.query.mock.calls[0][1]).not.toContain('OTRA')
  })

  // El `toContain('JAZMIN')` de arriba lo cumpliría también created_by solo. Acá
  // se fija cada valor en su columna: ni quien atendió ni quien registró se leen
  // del cuerpo, y las notas viajan al INSERT en su lugar.
  test('cada valor va en su columna; psicóloga y created_by son del login', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    await ctrl.crear({
      params: { id: '5' },
      body: {
        momento: '2026-11-05T14:30', modalidad: 'TELEFONICA',
        psicologa: 'OTRA', created_by: 'OTRO',
        acompanante: 'AUXILIAR', atendido_nombre: 'Marta Rojas',
        atendido_parentesco: 'hija', motivo: 'crisis', notas: 'texto clínico',
      },
      user: PSICOLOGA,
    }, resDoble(), jest.fn())
    const [sql, params] = db.query.mock.calls[0]
    expect(sql.replace(/\s+/g, ' ')).toContain(
      '(gestion_id, momento, modalidad, psicologa, acompanante, ' +
      'atendido_nombre, atendido_parentesco, motivo, notas, created_by)')
    expect(params).toEqual([
      '5', '2026-11-05 14:30:00', 'TELEFONICA', 'JAZMIN', 'AUXILIAR',
      'Marta Rojas', 'hija', 'crisis', 'texto clínico', 'JAZMIN',
    ])
  })

  test('lo que no se manda queda en NULL', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    await ctrl.crear({ params: { id: '5' }, body: BODY_OK, user: PSICOLOGA }, resDoble(), jest.fn())
    expect(db.query.mock.calls[0][1]).toEqual(
      ['5', '2026-11-05 14:30:00', 'PRESENCIAL', 'JAZMIN', null, null, null, null, null, 'JAZMIN'])
  })

  test('admin también puede crear', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    const res = resDoble()
    await ctrl.crear({ params: { id: '5' }, body: BODY_OK, user: { rol: 'admin', usuario: 'A' } },
      res, jest.fn())
    expect(res.codigo).toBe(201)
  })

  test('un rol que no es psicología no puede crear', async () => {
    const res = resDoble()
    await ctrl.crear({
      params: { id: '5' }, body: { momento: '2026-11-05T14:30', modalidad: 'PRESENCIAL' },
      user: { rol: 'coordinador', usuario: 'X' },
    }, res, jest.fn())
    expect(res.codigo).toBe(403)
    expect(db.query).not.toHaveBeenCalled()
  })

  // Escribir también está cerrado a los demás: se prueba con todos los roles,
  // no con uno de muestra.
  test.each(ROLES_SIN_ACCESO)('el rol %s recibe 403 al crear y no escribe en la base', async rol => {
    const res = resDoble()
    await ctrl.crear({ params: { id: '5' }, body: BODY_OK, user: { rol, usuario: 'X' } },
      res, jest.fn())
    expect(res.codigo).toBe(403)
    expect(db.query).not.toHaveBeenCalled()
  })

  // Sin usuario, `req.user.usuario` reventaría con un TypeError y respondería 500
  // en vez de 403; lo que importa es que tampoco escribe.
  test('sin usuario, 403 y no escribe', async () => {
    const res = resDoble(), next = jest.fn()
    await ctrl.crear({ params: { id: '5' }, body: BODY_OK, user: undefined }, res, next)
    expect(res.codigo).toBe(403)
    expect(next).not.toHaveBeenCalled()
    expect(db.query).not.toHaveBeenCalled()
  })

  test('exige modalidad y una hora válida', async () => {
    const res = resDoble()
    await ctrl.crear({
      params: { id: '5' }, body: { momento: '2026-02-31T14:30', modalidad: 'PRESENCIAL' },
      user: { rol: 'psicologia', usuario: 'JAZMIN' },
    }, res, jest.fn())
    expect(res.codigo).toBe(400)
  })

  // El test anterior solo prueba la hora; la modalidad se prueba aparte. Un 400
  // es un 400 de verdad: con mensaje, sin pasar por next (sería un 500) y sin
  // haber escrito nada.
  test.each([
    ['una modalidad que no existe', { momento: '2026-11-05T14:30', modalidad: 'DOMICILIO' }],
    ['sin modalidad',               { momento: '2026-11-05T14:30' }],
    ['una hora imposible',         { momento: '2026-02-31T14:30', modalidad: 'VIRTUAL' }],
    ['sin hora',                   { modalidad: 'VIRTUAL' }],
    ['sin cuerpo',                 undefined],
  ])('%s: 400 con mensaje, sin next y sin escribir', async (_nombre, body) => {
    const res = resDoble(), next = jest.fn()
    // Con notas en el cuerpo: el rechazo no las devuelve en su respuesta.
    const conNotas = body && { ...body, notas: 'SECRETO_CLINICO' }
    await ctrl.crear({ params: { id: '5' }, body: conNotas, user: PSICOLOGA }, res, next)
    expect(res.codigo).toBe(400)
    expect(typeof res.cuerpo.mensaje).toBe('string')
    expect(JSON.stringify(res.cuerpo)).not.toContain('SECRETO_CLINICO')
    expect(next).not.toHaveBeenCalled()
    expect(db.query).not.toHaveBeenCalled()
  })

  test('acepta las tres modalidades', async () => {
    for (const modalidad of ['PRESENCIAL', 'TELEFONICA', 'VIRTUAL']) {
      db.query = jest.fn(async () => [{ insertId: 7 }])
      const res = resDoble()
      await ctrl.crear({ params: { id: '5' }, body: { ...BODY_OK, modalidad }, user: PSICOLOGA },
        res, jest.fn())
      expect(res.codigo).toBe(201)
    }
  })

  // La única respuesta de crear es el id. Las notas solo viajan por listar.
  test('la respuesta de crear devuelve el id y nada más: ni las notas', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    const res = resDoble()
    await ctrl.crear({
      params: { id: '5' }, body: { ...BODY_OK, notas: 'SECRETO_CLINICO', motivo: 'crisis' },
      user: PSICOLOGA,
    }, res, jest.fn())
    expect(res.cuerpo).toEqual({ id: 7 })
  })

  // Las notas no van a ningún log: un log se lee sin permiso alguno.
  //
  // La versión original de esta prueba juntaba los argumentos de console.log y
  // console.warn con `.flat().join(' ')`. Un `console.log('crear', req.body)` le
  // pasa el cuerpo como objeto, y join lo vuelve «[object Object]»: la prueba
  // quedaba en verde con la fuga puesta. Por eso se usa util.inspect y se
  // vigilan todas las propiedades función de console y el logger del repo; lo
  // que la guarda cubre y lo que no, está descrito en espiarRegistros.
  test('las notas no se escriben en el log', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    const consola = espiarRegistros()
    try {
      await ctrl.crear({
        params: { id: '5' },
        body: BODY_SENSIBLE,
        user: { rol: 'psicologia', usuario: 'JAZMIN' },
      }, resDoble(), jest.fn())
      expect(secretosEn(await consola.volcado())).toEqual([])
    } finally { consola.restaurar() }
  })

  // Lo mismo cuando algo sale mal: el catch es donde un console.error(req.body)
  // parece razonable.
  test.each([
    // El error trae `.sql` con el valor adentro, como el de mysql2. Sin eso, un
    // volcado del error (logger.error(err)) no tendría nada que delatar.
    ['la base rechaza', async () => {
      throw Object.assign(new Error('Data too long'), {
        code: 'ER_DATA_TOO_LONG',
        sql: SQL_CON_SECRETOS,
      })
    }, BODY_OK],
    ['el cuerpo no es válido (400)', null, { momento: 'no es hora', modalidad: 'PRESENCIAL' }],
  ])('las notas no se escriben en el log cuando %s', async (_caso, simulacion, base) => {
    if (simulacion) db.query = jest.fn(simulacion)
    const consola = espiarRegistros()
    try {
      await ctrl.crear({
        params: { id: '5' }, body: { ...base, ...SENSIBLES },
        user: PSICOLOGA,
      }, resDoble(), jest.fn())
      expect(secretosEn(await consola.volcado())).toEqual([])
    } finally { consola.restaurar() }
  })

  // mysql2 le cuelga al error la sentencia ya armada (`err.sql`), con los valores
  // adentro; con una gestión que no existe, el FK falla justo así. Quien reciba
  // ese error por next (un manejador que haga console.error(err), un logger que
  // serialice el objeto) se llevaría las notas. El controlador no lo deja pasar.
  test('si la base falla, el error que va a next no trae la sentencia con las notas', async () => {
    const falla = Object.assign(
      new Error('Cannot add or update a child row: a foreign key constraint fails'),
      {
        code: 'ER_NO_REFERENCED_ROW_2',
        sqlMessage: 'Cannot add or update a child row: a foreign key constraint fails',
        sql: SQL_CON_SECRETOS,
      })
    db.query = jest.fn(async () => { throw falla })
    const consola = espiarRegistros()
    const res = resDoble(), next = jest.fn()
    try {
      await ctrl.crear({ params: { id: '999' }, body: BODY_SENSIBLE,
        user: PSICOLOGA }, res, next)
      expect(next).toHaveBeenCalledTimes(1)
      const recibido = next.mock.calls[0][0]
      // Sigue siendo el error de la base: el manejador global puede mapearlo.
      expect(recibido.code).toBe('ER_NO_REFERENCED_ROW_2')
      expect(recibido.message).toContain('foreign key')
      expect(secretosEn(util.inspect(recibido, { depth: null }))).toEqual([])
      expect(secretosEn(await consola.volcado())).toEqual([])
      expect(res.cuerpo).toBeNull()
    } finally { consola.restaurar() }
  })
})

// La guarda de logs tiene que ver todo lo que podría escribir; si no, es una
// falsa guarda. Estas pruebas la ejercitan directamente, sin pasar por el
// controlador: cada vía por la que un cuerpo de petición podría llegar a un log
// tiene que dejar rastro en el volcado.
describe('la guarda de logs ve cada vía de salida', () => {
  const CUERPO = { notas: 'SECRETO_CLINICO' }

  // Las funciones de console que declara Node en Console.prototype. Es OTRA
  // fuente distinta de metodosDeConsola (que recorre el objeto `console` de
  // jest y su cadena de prototipos): comparar la lista consigo misma no puede
  // fallar por una enumeración incompleta; comparar contra esta, sí.
  const { Console } = require('console')
  const DE_NODE = Object.getOwnPropertyNames(Console.prototype).filter(nombre =>
    nombre !== 'constructor' &&
    typeof Object.getOwnPropertyDescriptor(Console.prototype, nombre).value === 'function')

  test('la referencia de Node no está vacía (si lo estuviera, la comparación no probaría nada)', () => {
    expect(DE_NODE).toEqual(expect.arrayContaining(['log', 'error', 'warn', 'info', 'debug', 'dir', 'dirxml', 'table']))
  })

  test('metodosDeConsola incluye cada función de Console.prototype', () => {
    const enumerados = new Set(metodosDeConsola())
    expect(DE_NODE.filter(nombre => !enumerados.has(nombre))).toEqual([])
  })

  test('vigila cada propiedad función de console, no una lista fija', async () => {
    const guarda = espiarRegistros()
    let sinVigilar
    try {
      sinVigilar = []
      for (const m of new Set([...DE_NODE, ...metodosDeConsola()])) {
        const marca = `MARCA_${m}`
        try { console[m](marca) } catch { sinVigilar.push(m); continue } // sin espía, algunos revientan
        if (!(await guarda.volcado()).includes(marca)) sinVigilar.push(m)
      }
    } finally { guarda.restaurar() }
    expect(sinVigilar).toEqual([])
  })

  test.each([
    ['console.dir',    () => console.dir(CUERPO)],
    ['console.dirxml', () => console.dirxml(CUERPO)],
    ['logger.error',   () => logger.error('crear', CUERPO)],
    ['logger.warn',    () => logger.warn('crear', CUERPO)],
    ['logger.info',    () => logger.info('crear', CUERPO)],
    ['logger.debug',   () => logger.debug('crear', CUERPO)],
    ['logger.log con el nivel como primer argumento', () => logger.log('error', 'crear', CUERPO)],
    ['logger.child(...).error', () => logger.child({ origen: 'duelo' }).error('crear', CUERPO)],
    ['logger.child con el cuerpo de metadato', () => logger.child(CUERPO).info('crear')],
    ['logger.error con un Error que trae .sql', () => logger.error(
      Object.assign(new Error('falló'), { sql: "INSERT ... VALUES ('SECRETO_CLINICO')" }))],
    // Detrás de un condicional que mira al logger. En el winston real el
    // predicado de un nivel habilitado es true y `level` es una cadena; con un
    // doble que devolviera undefined estas líneas no escribirían y la guarda
    // las dejaría pasar, y en producción sí escribirían.
    ['logger.error detrás de isLevelEnabled',
      () => { if (logger.isLevelEnabled('error')) logger.error('crear', CUERPO) }],
    ['logger.debug detrás de isDebugEnabled',
      () => { if (logger.isDebugEnabled()) logger.debug('crear', CUERPO) }],
    ['logger.silly detrás de isSillyEnabled',
      () => { if (logger.isSillyEnabled()) logger.silly('crear', CUERPO) }],
    ['logger.debug detrás de comparar logger.level',
      () => { if (logger.level === 'debug') logger.debug('crear', CUERPO) }],
    ['logger.debug detrás de comparar el rango de logger.level',
      () => { if (logger.levels[logger.level] >= logger.levels.debug) logger.debug('crear', CUERPO) }],
    ['logger.error encadenado', () => logger.info('crear').error('crear', CUERPO)],
    ['logger.startTimer().done', () => logger.startTimer().done({ message: 'crear', ...CUERPO })],
  ])('%s deja rastro en el volcado', async (_via, emitir) => {
    const guarda = espiarRegistros()
    try {
      emitir()
      expect(await guarda.volcado()).toContain('SECRETO_CLINICO')
    } finally { guarda.restaurar() }
  })

  // Cada campo de salud, suelto, como lo escribiría quien loguea `req.body.campo`.
  test.each(Object.entries(SENSIBLES))('%s suelto deja rastro, por console y por el logger', async (campo, valor) => {
    for (const emitir of [() => console.log(valor), () => logger.info(valor)]) {
      const guarda = espiarRegistros()
      try {
        emitir()
        expect(secretosEn(await guarda.volcado())).toEqual([campo])
      } finally { guarda.restaurar() }
    }
  })

  // Una escritura que sale después de que el controlador respondió. El volcado
  // espera a que salga lo diferido (asentarDiferidos), así que se ve.
  test.each([
    ['process.nextTick',                  () => process.nextTick(() => console.log(CUERPO))],
    ['setImmediate',                      () => setImmediate(() => console.log(CUERPO))],
    ['setTimeout sin plazo',              () => setTimeout(() => console.log(CUERPO))],
    ['setTimeout de un minuto',           () => setTimeout(() => logger.info('crear', CUERPO), 60000)],
    ['setInterval',                       () => { const t = setInterval(() => { clearInterval(t); console.dir(CUERPO) }, 1000) }],
    ['un temporizador que agenda otro',   () => setTimeout(() => setImmediate(() => logger.warn(CUERPO)), 10)],
    ['una promesa encadenada',            () => { Promise.resolve().then(() => Promise.resolve()).then(() => console.log(CUERPO)) }],
    ['una promesa dentro de un temporizador',
      () => setTimeout(async () => { await null; await null; console.log(CUERPO) }, 10)],
  ])('una escritura diferida con %s deja rastro en el volcado', async (_via, emitir) => {
    const guarda = espiarRegistros()
    try {
      emitir()
      expect(await guarda.volcado()).toContain('SECRETO_CLINICO')
    } finally { guarda.restaurar() }
  })

  // listar es por donde las notas salen de verdad. Si un `console.log(data)`
  // se cuela ahí, esta prueba lo atrapa.
  test('listar no escribe las notas en ningún log', async () => {
    const guarda = espiarRegistros()
    const res = resDoble()
    try {
      await ctrl.listar({ params: { id: '5' }, user: PSICOLOGA }, res, jest.fn())
      // Que las notas sí viajaron: sin esto, «no aparecen en el log» valdría
      // también si la respuesta no las trajera.
      expect(res.codigo).toBe(200)
      expect(res.cuerpo.data[0].notas).toBe('contenido clínico')
      expect(await guarda.volcado()).not.toContain('contenido clínico')
    } finally { guarda.restaurar() }
  })
})

// El doble del logger tiene que parecerse al winston real. Se compara contra
// una instancia de verdad (sin transportes que escriban) para que, si winston
// cambia o el doble se desvía, esto se ponga rojo y no la fuga pase en verde.
describe('el doble del logger se parece al winston real', () => {
  let real
  beforeAll(() => {
    real = winston.createLogger({
      level: 'info', transports: [new winston.transports.Console({ silent: true })],
    })
  })
  afterAll(() => real.close())

  const funciones = obj => {
    const nombres = new Set()
    for (let o = obj; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const nombre of Object.getOwnPropertyNames(o)) {
        if (typeof Object.getOwnPropertyDescriptor(o, nombre).value === 'function') nombres.add(nombre)
      }
    }
    return [...nombres]
  }
  const ES_PREDICADO = /^is\w+Enabled$/

  test('cada predicado is<Nivel>Enabled del winston real devuelve true en el doble', () => {
    const predicados = funciones(real).filter(n => ES_PREDICADO.test(n))
    expect(predicados).toEqual(expect.arrayContaining(['isLevelEnabled', 'isErrorEnabled', 'isDebugEnabled']))
    const noVerdaderos = predicados.filter(n => logger[n]('error') !== true)
    expect(noVerdaderos).toEqual([])
  })

  test('level es una cadena de nivel de winston y levels es el objeto de winston', () => {
    expect(typeof logger.level).toBe(typeof real.level)
    expect(Object.keys(real.levels)).toContain(logger.level)
    expect(logger.levels).toEqual(real.levels)
    expect(NIVELES).toEqual(Object.keys(real.levels))
    expect(NIVELES).toContain('debug')
  })

  test('cada método del winston real que no es un predicado deja rastro cuando se llama en el doble', () => {
    const guarda = espiarRegistros()
    try {
      const nombres = funciones(real).filter(n =>
        !ES_PREDICADO.test(n) && !n.startsWith('_') && n !== 'constructor' &&
        n !== 'getHighestLogLevel' && n !== 'startTimer')
      expect(nombres).toEqual(expect.arrayContaining(
        ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly', 'log', 'child', 'profile']))
      const sinRastro = nombres.filter(n => {
        mockLogger.escrito.length = 0
        logger[n](`MARCA_${n}`)
        return !mockLogger.escrito.join('\n').includes(`MARCA_${n}`)
      })
      expect(sinRastro).toEqual([])
    } finally { guarda.restaurar() }
  })

  // El barrido por niveles solo vale si el doble de verdad se pone en el nivel
  // que se le pide, y si al restaurar vuelve al de por defecto.
  test.each(NIVELES)('espiarRegistros(%s) deja el doble en ese nivel y restaurar lo devuelve al de por defecto', nivel => {
    const guarda = espiarRegistros(nivel)
    try {
      expect(logger.level).toBe(nivel)
      expect(logger.levels[logger.level]).toBe(real.levels[nivel])
    } finally { guarda.restaurar() }
    expect(logger.level).toBe(NIVEL_DEL_DOBLE)
  })

  test('los métodos de registro devuelven el logger, como en el real', () => {
    const guarda = espiarRegistros()
    try {
      expect(real.error('x')).toBe(real)
      expect(logger.error('x')).toBe(logger)
      expect(logger.child({}).info('x')).toBe(logger)
    } finally { guarda.restaurar() }
  })
})

// Todos los caminos por los que crear y listar pueden terminar: éxito, 400,
// error de la base y TODAS las salidas tempranas de «no tienes permiso» y «falta
// el usuario en el login». El cuerpo de la petición trae un valor reconocible en
// cada campo de salud; ninguno puede aparecer en un volcado de logs.
//
// Es la prueba que cierra el hueco de las salidas tempranas: son el sitio donde
// cualquiera escribiría un `console.warn('denegado', req.body)`, y en el caso de
// «falta el usuario» el cuerpo trae las notas reales de una psicóloga legítima
// cuyo token vino incompleto. `listar` incluye un cuerpo en la petición aunque
// un GET no suela llevarlo: es lo que haría quien se equivoca de cliente, y es
// lo que un log de «denegado» volcaría.
const baseCrearOk = async () => [{ insertId: 7 }]
const baseCrearFalla = async () => {
  throw Object.assign(new Error('Data too long'), { code: 'ER_DATA_TOO_LONG', sql: SQL_CON_SECRETOS })
}
const baseListarOk = async () => [[{
  id: 1, gestion_id: 5, momento: '2026-11-05 14:30:00', modalidad: 'PRESENCIAL',
  psicologa: 'JAZMIN', ...SENSIBLES,
}]]
const baseListarFalla = async () => { throw new Error('se cayó') }

const CASOS_DE_SALIDA = [
  { nombre: 'crear 201 como psicología', accion: 'crear', user: PSICOLOGA, base: baseCrearOk, codigo: 201 },
  { nombre: 'crear 201 como admin', accion: 'crear', user: { rol: 'admin', usuario: 'A' }, base: baseCrearOk, codigo: 201 },
  { nombre: 'crear 201 con el usuario entre espacios', accion: 'crear',
    user: { rol: 'psicologia', usuario: ' JAZMIN ' }, base: baseCrearOk, codigo: 201 },
  { nombre: 'crear 400 por hora imposible', accion: 'crear', user: PSICOLOGA,
    body: { ...BODY_SENSIBLE, momento: '2026-02-31T14:30' }, codigo: 400 },
  { nombre: 'crear 400 por modalidad inválida', accion: 'crear', user: PSICOLOGA,
    body: { ...BODY_SENSIBLE, modalidad: 'DOMICILIO' }, codigo: 400 },
  { nombre: 'crear: la base rechaza y el error va a next', accion: 'crear', user: PSICOLOGA,
    base: baseCrearFalla, next: true },
  ...ROLES_SIN_ACCESO.map(rol => ({
    nombre: `crear 403: rol ${rol}`, accion: 'crear', user: { rol, usuario: 'X' }, codigo: 403 })),
  ...SIN_ACCESO_OTRAS.map(([caso, user]) => ({
    nombre: `crear 403: ${caso}`, accion: 'crear', user, codigo: 403 })),
  ...USUARIOS_SIN_NOMBRE.map(([caso, user]) => ({
    nombre: `crear 403 (falta el usuario del login): ${caso}`, accion: 'crear', user, codigo: 403 })),

  { nombre: 'listar 200 como psicología', accion: 'listar', user: PSICOLOGA, base: baseListarOk, codigo: 200 },
  { nombre: 'listar 200 como admin', accion: 'listar', user: { rol: 'admin', usuario: 'A' }, base: baseListarOk, codigo: 200 },
  { nombre: 'listar: la base falla y el error va a next', accion: 'listar', user: PSICOLOGA,
    base: baseListarFalla, next: true },
  ...ROLES_SIN_ACCESO.map(rol => ({
    nombre: `listar 403: rol ${rol}`, accion: 'listar', user: { rol, usuario: 'X' }, codigo: 403 })),
  ...SIN_ACCESO_OTRAS.map(([caso, user]) => ({
    nombre: `listar 403: ${caso}`, accion: 'listar', user, codigo: 403 })),
]

// Corre un caso con la guarda instalada y devuelve lo que salió a los logs.
// Comprueba también que el caso tomó el camino que dice (si no, la línea de log
// que se quisiera atrapar no se habría ejecutado y la prueba valdría en vacío).
async function correrCaso(caso, nivel) {
  db.query = jest.fn(caso.base ?? (async () => [[]]))
  const req = {
    params: { id: '5' }, query: {}, body: caso.body ?? BODY_SENSIBLE, user: caso.user,
  }
  const res = resDoble(), next = jest.fn()
  const guarda = espiarRegistros(nivel)
  let volcado
  try {
    await ctrl[caso.accion](req, res, next)
    volcado = await guarda.volcado()
  } finally { guarda.restaurar() }

  if (caso.next) {
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.cuerpo).toBeNull()
  } else {
    expect(res.codigo).toBe(caso.codigo)
    expect(next).not.toHaveBeenCalled()
  }
  if (caso.codigo === 400 || caso.codigo === 403) expect(db.query).not.toHaveBeenCalled()
  return { res, volcado }
}

describe('ningún camino de salida de crear ni de listar escribe datos de salud en un log', () => {
  test.each(CASOS_DE_SALIDA.map(caso => [caso.nombre, caso]))('%s', async (_nombre, caso) => {
    const { res, volcado } = await correrCaso(caso)
    expect(secretosEn(volcado)).toEqual([])
    // Que el dato sí estaba en juego: sin esto, «no aparece en el log» valdría
    // también si el controlador no lo hubiera recibido o no lo hubiera traído.
    if (caso.codigo === 201) {
      expect(db.query.mock.calls[0][1]).toEqual(expect.arrayContaining(SECRETOS))
    }
    if (caso.accion === 'listar' && caso.codigo === 200) {
      expect(Object.values(res.cuerpo.data[0])).toEqual(expect.arrayContaining(SECRETOS))
    }
  })

  // Una comparación de igualdad con el nivel (`logger.level === 'silly'`) solo
  // se cumple con uno de los siete: se recorren todos con el doble puesto en
  // cada uno.
  test.each(NIVELES)('con el logger en nivel %s, ningún camino escribe datos de salud', async nivel => {
    const fugas = []
    for (const caso of CASOS_DE_SALIDA) {
      const { volcado } = await correrCaso(caso, nivel)
      const campos = secretosEn(volcado)
      if (campos.length) fugas.push(`${caso.nombre}: ${campos.join(', ')}`)
    }
    expect(fugas).toEqual([])
  })

  // Si alguien agrega una columna a la atención y no decide si es dato de
  // salud, esto se pone rojo: SENSIBLES (y con él la guarda) se quedaría corto
  // sin que nadie lo note. Una columna nueva va a SENSIBLES o a NO_SENSIBLES.
  test('SENSIBLES cubre todas las columnas que el INSERT guarda, salvo las de agenda y auditoría', async () => {
    const NO_SENSIBLES = ['gestion_id', 'momento', 'modalidad', 'psicologa', 'created_by']
    db.query = jest.fn(baseCrearOk)
    await ctrl.crear({ params: { id: '5' }, body: BODY_SENSIBLE, user: PSICOLOGA }, resDoble(), jest.fn())
    const sql = db.query.mock.calls[0][0].replace(/\s+/g, ' ')
    const columnas = sql.match(/\(([^)]*)\) VALUES/)[1].split(',').map(c => c.trim())
    expect(columnas.length).toBeGreaterThan(NO_SENSIBLES.length)
    expect(columnas.filter(c => !NO_SENSIBLES.includes(c)).sort()).toEqual(Object.keys(SENSIBLES).sort())
  })
})

describe('crear exige un usuario en el login', () => {
  // La psicóloga sale de req.user.usuario para poder auditar quién atendió. Con
  // un token válido en rol pero sin nombre, guardar NULL deja la auditoría tan
  // vacía como el Excel donde ese nombre se escribía a mano.
  test.each(USUARIOS_SIN_NOMBRE)('%s: 403 con mensaje y no escribe', async (_caso, user) => {
    const res = resDoble(), next = jest.fn()
    await ctrl.crear({ params: { id: '5' }, body: BODY_OK, user }, res, next)
    expect(res.codigo).toBe(403)
    // El mensaje explica la causa; no es el de «no tiene permiso».
    expect(res.cuerpo.mensaje).toMatch(/usuario/)
    expect(next).not.toHaveBeenCalled()
    expect(db.query).not.toHaveBeenCalled()
  })

  // El usuario se valida recortado y se guarda recortado: `psicologa` y
  // `created_by` son los campos de auditoría, y ' JAZMIN ' guardado tal cual
  // dejaría dos nombres distintos para la misma persona.
  test.each([
    ['espacios alrededor',            ' JAZMIN '],
    ['tabulador y salto de línea',    '\tJAZMIN\n'],
  ])('un usuario con %s se guarda recortado en psicóloga y en created_by', async (_caso, usuario) => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    const res = resDoble()
    await ctrl.crear({ params: { id: '5' }, body: BODY_OK, user: { rol: 'psicologia', usuario } },
      res, jest.fn())
    expect(res.codigo).toBe(201)
    expect(db.query.mock.calls[0][1]).toEqual(
      ['5', '2026-11-05 14:30:00', 'PRESENCIAL', 'JAZMIN', null, null, null, null, null, 'JAZMIN'])
  })
})
