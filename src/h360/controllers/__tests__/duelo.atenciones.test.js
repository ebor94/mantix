// src/h360/controllers/__tests__/duelo.atenciones.test.js
// Las notas de una atención son dato de salud de un tercero. La Ley 1581 de
// 2012 las trata como sensibles. Acá se prueba que solo salen por su propia
// ruta y solo para quien puede leerlas.
//
// Todo se simula: no hay conexión a MySQL. El servicio es el de verdad; lo que
// se reemplaza es el pool.

const util = require('util')

jest.mock('../../config/db')
const db = require('../../config/db')
const ctrl = require('../duelo_atenciones.controller')

const resDoble = () => {
  const r = { codigo: 200, cuerpo: null }
  r.status = c => { r.codigo = c; return r }
  r.json = b => { r.cuerpo = b; return r }
  return r
}

// Espía todos los métodos de console, no solo log y warn: un console.error en
// un catch es justo donde se cuela el cuerpo de la petición. Lo que recibe cada
// llamada se vuelca a texto EN EL MOMENTO de la llamada, con util.inspect, que
// también imprime las propiedades de un Error (un `.sql` dentro de un Error sale
// en el log). Guardar solo la referencia no sirve: si el código le quita la
// propiedad al error después de loguearlo, la prueba vería el error ya limpio.
const METODOS_CONSOLA = ['log', 'info', 'warn', 'error', 'debug']
function espiarConsola() {
  const escrito = []
  const espias = METODOS_CONSOLA.map(m => jest.spyOn(console, m).mockImplementation((...args) => {
    escrito.push(util.inspect(args, { depth: null }))
  }))
  return {
    volcado: () => escrito.join('\n'),
    restaurar: () => espias.forEach(e => e.mockRestore()),
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
  // quedaba en verde con la fuga puesta. Por eso se usa util.inspect y se vigilan
  // todos los métodos de console.
  test('las notas no se escriben en el log', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    const consola = espiarConsola()
    try {
      await ctrl.crear({
        params: { id: '5' },
        body: { momento: '2026-11-05T14:30', modalidad: 'PRESENCIAL',
                notas: 'SECRETO_CLINICO', motivo: 'SECRETO_MOTIVO' },
        user: { rol: 'psicologia', usuario: 'JAZMIN' },
      }, resDoble(), jest.fn())
      expect(consola.volcado()).not.toContain('SECRETO_CLINICO')
      expect(consola.volcado()).not.toContain('SECRETO_MOTIVO')
    } finally { consola.restaurar() }
  })

  // Lo mismo cuando algo sale mal: el catch es donde un console.error(req.body)
  // parece razonable.
  test.each([
    ['la base rechaza', async () => {
      throw Object.assign(new Error('Data too long'), { code: 'ER_DATA_TOO_LONG' })
    }, BODY_OK],
    ['el cuerpo no es válido (400)', null, { momento: 'no es hora', modalidad: 'PRESENCIAL' }],
  ])('las notas no se escriben en el log cuando %s', async (_caso, simulacion, base) => {
    if (simulacion) db.query = jest.fn(simulacion)
    const consola = espiarConsola()
    try {
      await ctrl.crear({
        params: { id: '5' }, body: { ...base, notas: 'SECRETO_CLINICO', motivo: 'SECRETO_MOTIVO' },
        user: PSICOLOGA,
      }, resDoble(), jest.fn())
      expect(consola.volcado()).not.toContain('SECRETO_CLINICO')
      expect(consola.volcado()).not.toContain('SECRETO_MOTIVO')
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
        sql: "INSERT INTO h360_duelo_atenciones (gestion_id, notas) VALUES (999, 'SECRETO_CLINICO')",
      })
    db.query = jest.fn(async () => { throw falla })
    const consola = espiarConsola()
    const res = resDoble(), next = jest.fn()
    try {
      await ctrl.crear({ params: { id: '999' }, body: { ...BODY_OK, notas: 'SECRETO_CLINICO' },
        user: PSICOLOGA }, res, next)
      expect(next).toHaveBeenCalledTimes(1)
      const recibido = next.mock.calls[0][0]
      // Sigue siendo el error de la base: el manejador global puede mapearlo.
      expect(recibido.code).toBe('ER_NO_REFERENCED_ROW_2')
      expect(recibido.message).toContain('foreign key')
      expect(util.inspect(recibido, { depth: null })).not.toContain('SECRETO_CLINICO')
      expect(consola.volcado()).not.toContain('SECRETO_CLINICO')
      expect(res.cuerpo).toBeNull()
    } finally { consola.restaurar() }
  })
})
