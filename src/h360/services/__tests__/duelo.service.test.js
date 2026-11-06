// src/h360/services/__tests__/duelo.service.test.js
jest.mock('../../config/db')
const db = require('../../config/db')
const svc = require('../duelo.service')

beforeEach(() => {
  jest.clearAllMocks()
  db.query = jest.fn(async () => [[]])
})

describe('gestionPorOrden', () => {
  test('recorta la orden y devuelve null cuando no hay gestión', async () => {
    const g = await svc.gestionPorOrden('  SAR-1883 ')
    expect(g).toBeNull()
    expect(db.query.mock.calls[0][1]).toEqual(['SAR-1883'])
  })

  test('devuelve la fila cuando existe', async () => {
    db.query = jest.fn(async () => [[{ id: 4, orden_servicio: 'A-1', estado: 'EN_GESTION' }]])
    const g = await svc.gestionPorOrden('A-1')
    expect(g.id).toBe(4)
  })
})

describe('gestionesPorOrdenes', () => {
  test('devuelve un mapa por número de orden', async () => {
    db.query = jest.fn(async () => [[
      { id: 1, orden_servicio: 'A-1', estado: 'GESTIONADA' },
      { id: 2, orden_servicio: 'A-2', estado: 'PENDIENTE' },
    ]])
    const m = await svc.gestionesPorOrdenes(['A-1', 'A-2'])
    expect(m.get('A-1').estado).toBe('GESTIONADA')
    expect(m.get('A-2').id).toBe(2)
  })

  // Con la lista vacía no se consulta: un IN () es un error de sintaxis y
  // además no hay nada que buscar.
  test('con lista vacía no consulta', async () => {
    const m = await svc.gestionesPorOrdenes([])
    expect(m.size).toBe(0)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('descarta vacíos, recorta y arma un placeholder por orden', async () => {
    await svc.gestionesPorOrdenes([' A-1 ', '', '  ', 'A-2'])
    const [sql, params] = db.query.mock.calls[0]
    expect(params).toEqual(['A-1', 'A-2'])
    expect(sql).toContain('IN (?,?)')
  })

  test('si todo viene vacío tampoco consulta', async () => {
    const m = await svc.gestionesPorOrdenes(['', '  '])
    expect(m.size).toBe(0)
    expect(db.query).not.toHaveBeenCalled()
  })
})

describe('crearGestion', () => {
  // Hay órdenes del ERP sin nombre ni teléfono (SAR-1883) y casi la mitad no
  // tiene asistencia en H360: nada de eso puede tumbar la gestión.
  test('una orden sin titular, sin teléfono y sin asistencia se crea con nulos', async () => {
    db.query = jest.fn(async () => [{ insertId: 31 }])
    const id = await svc.crearGestion({
      orden_servicio: 'SAR-1883', ubicacion_tipo: 'OTRA_CIUDAD',
      psicologa: 'jazmin', created_by: 'jazmin',
    })
    expect(id).toBe(31)
    // orden, asistencia, ubicación, detalle, mascota, titular, parentesco,
    // teléfonos, estado, psicóloga, creador
    expect(db.query.mock.calls[0][1]).toEqual([
      'SAR-1883', null, 'OTRA_CIUDAD', null, 0, null, null, null,
      'EN_GESTION', 'jazmin', 'jazmin',
    ])
  })

  test('es_mascota se guarda como 1', async () => {
    db.query = jest.fn(async () => [{ insertId: 32 }])
    await svc.crearGestion({
      orden_servicio: 'MAS-7', ubicacion_tipo: 'SALA', es_mascota: true,
      psicologa: 'x', created_by: 'x',
    })
    expect(db.query.mock.calls[0][1][4]).toBe(1)
  })

  test('rechaza una ubicación que no está en el catálogo y no escribe', async () => {
    await expect(svc.crearGestion({
      orden_servicio: 'A-1', ubicacion_tipo: 'LUNA', psicologa: 'x', created_by: 'x',
    })).rejects.toThrow(/ubicaci/i)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('el error de entrada lleva status 400', async () => {
    await expect(svc.crearGestion({
      orden_servicio: 'A-1', ubicacion_tipo: 'LUNA', psicologa: 'x', created_by: 'x',
    })).rejects.toMatchObject({ status: 400 })
  })

  // gestionPorOrden recorta al buscar: si aquí se guardara con los espacios, la
  // clave única los conservaría y la gestión recién creada no se volvería a
  // encontrar.
  test("crear con ' A-1 ' guarda 'A-1', el mismo valor que después busca gestionPorOrden", async () => {
    db.query = jest.fn(async () => [{ insertId: 40 }])
    await svc.crearGestion({
      orden_servicio: ' A-1 ', ubicacion_tipo: 'SALA', psicologa: 'x', created_by: 'x',
    })
    expect(db.query.mock.calls[0][1][0]).toBe('A-1')
  })

  test('rechaza un estado que no está en el catálogo, con status 400, y no escribe', async () => {
    await expect(svc.crearGestion({
      orden_servicio: 'A-1', ubicacion_tipo: 'SALA', estado: 'ENOJADA',
      psicologa: 'x', created_by: 'x',
    })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/estado/i) })
    expect(db.query).not.toHaveBeenCalled()
  })

  // Guarda: con o sin la validación, un estado del catálogo se guarda tal cual.
  // Se pondría en rojo si la validación rechazara todo o ignorara `datos.estado`.
  test('un estado válido del catálogo se guarda tal cual', async () => {
    db.query = jest.fn(async () => [{ insertId: 41 }])
    await svc.crearGestion({
      orden_servicio: 'A-2', ubicacion_tipo: 'SALA', estado: 'PENDIENTE',
      psicologa: 'x', created_by: 'x',
    })
    expect(db.query.mock.calls[0][1][8]).toBe('PENDIENTE')
  })

  // Sin esta guarda el recorte convertiría una orden ausente o en blanco en ''
  // y la clave única la dejaría pasar como si fuera una orden.
  test('una orden vacía o solo con espacios se rechaza con status 400 y no escribe', async () => {
    for (const orden of [undefined, null, '', '   ']) {
      await expect(svc.crearGestion({
        orden_servicio: orden, ubicacion_tipo: 'SALA', psicologa: 'x', created_by: 'x',
      })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/orden/i) })
    }
    expect(db.query).not.toHaveBeenCalled()
  })
})

describe('actualizarGestion', () => {
  test('solo escribe los campos editables y descarta el resto', async () => {
    db.query = jest.fn(async () => [{ affectedRows: 1 }])
    const ok = await svc.actualizarGestion(8, {
      estado: 'GESTIONADA', observaciones: 'listo',
      orden_servicio: 'OTRA-9', created_by: 'intruso', id: 99,
    })
    expect(ok).toBe(true)
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('UPDATE h360_duelo_gestion SET ? WHERE id = ?')
    expect(params[0]).toEqual({ estado: 'GESTIONADA', observaciones: 'listo' })
    expect(params[1]).toBe(8)
  })

  test('sin campos editables devuelve false y no consulta', async () => {
    const ok = await svc.actualizarGestion(8, { orden_servicio: 'OTRA-9' })
    expect(ok).toBe(false)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('devuelve false cuando ninguna fila coincide', async () => {
    db.query = jest.fn(async () => [{ affectedRows: 0 }])
    expect(await svc.actualizarGestion(404, { estado: 'NO_LOGRADA' })).toBe(false)
  })

  test('rechaza un estado inválido', async () => {
    await expect(svc.actualizarGestion(8, { estado: 'ENOJADA' })).rejects.toThrow(/estado/i)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('rechaza una tipificación inválida', async () => {
    await expect(svc.actualizarGestion(8, { tipificacion: 'AL_AZAR' })).rejects.toThrow(/tipificaci/i)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('rechaza una ubicación inválida', async () => {
    await expect(svc.actualizarGestion(8, { ubicacion_tipo: null })).rejects.toThrow(/ubicaci/i)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('permite limpiar la tipificación con null', async () => {
    db.query = jest.fn(async () => [{ affectedRows: 1 }])
    await svc.actualizarGestion(8, { tipificacion: null })
    expect(db.query.mock.calls[0][1][0]).toEqual({ tipificacion: null })
  })
})

describe('agregarIntento', () => {
  test('guarda la hora tal como se escribió, sin pasarla por Date', async () => {
    db.query = jest.fn(async () => [{ insertId: 9 }])
    await svc.agregarIntento(5, {
      momento: '2026-11-05T14:30', canal: 'LLAMADA',
      resultado: 'NO_CONTESTO', observacion: 'no contesta', usuario: 'JAZMIN',
    })
    const params = db.query.mock.calls[0][1]
    expect(params).toContain('2026-11-05 14:30:00')
    expect(params.join(' ')).not.toContain('19:30')
  })

  test('rechaza un canal que no está en el catálogo', async () => {
    await expect(svc.agregarIntento(5, {
      momento: '2026-11-05T14:30', canal: 'PALOMA', resultado: 'CONTACTADO', usuario: 'X',
    })).rejects.toThrow(/canal/i)
  })

  test('rechaza una hora imposible', async () => {
    await expect(svc.agregarIntento(5, {
      momento: '2026-02-31T14:30', canal: 'LLAMADA', resultado: 'CONTACTADO', usuario: 'X',
    })).rejects.toThrow(/fecha/i)
  })

  test('rechaza un resultado que no está en el catálogo', async () => {
    await expect(svc.agregarIntento(5, {
      momento: '2026-11-05T14:30', canal: 'LLAMADA', resultado: 'TAL_VEZ', usuario: 'X',
    })).rejects.toThrow(/resultado/i)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('devuelve el id y deja la observación en null cuando no viene', async () => {
    db.query = jest.fn(async () => [{ insertId: 9 }])
    const id = await svc.agregarIntento(5, {
      momento: '2026-11-05 08:05:07', canal: 'WHATSAPP', resultado: 'CONTACTADO', usuario: 'AUX',
    })
    expect(id).toBe(9)
    expect(db.query.mock.calls[0][1]).toEqual(
      [5, '2026-11-05 08:05:07', 'WHATSAPP', 'CONTACTADO', null, 'AUX'])
  })
})

describe('intentosDeGestion', () => {
  test('pide los intentos en orden cronológico', async () => {
    db.query = jest.fn(async () => [[{ id: 1 }, { id: 2 }]])
    const f = await svc.intentosDeGestion(5)
    expect(f).toHaveLength(2)
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toContain('ORDER BY momento ASC, id ASC')
    expect(params).toEqual([5])
  })

  // El pool de h360 no define dateStrings: un DATETIME vuelve como Date y
  // Express lo serializa en UTC (14:30 en Cúcuta llegaría como 19:30Z). Por eso
  // la hora se formatea en SQL y viaja como texto.
  test('no usa SELECT * y nombra las columnas que devuelve', async () => {
    await svc.intentosDeGestion(5)
    const sql = db.query.mock.calls[0][0]
    expect(sql).not.toMatch(/SELECT\s+\*/i)
    const lista = sql.match(/SELECT([\s\S]*?)\sFROM\s/i)[1]
    const sinMomento = lista.replace(/DATE_FORMAT\([^)]*\)\s+AS\s+momento/i, '')
    const columnas = sinMomento.split(',').map(c => c.trim()).filter(Boolean).sort()
    expect(columnas).toEqual(
      ['canal', 'created_at', 'gestion_id', 'id', 'observacion', 'resultado', 'usuario'])
  })

  test('pide momento formateado en SQL como texto, con el mismo nombre', async () => {
    await svc.intentosDeGestion(5)
    const sql = db.query.mock.calls[0][0]
    expect(sql).toMatch(/DATE_FORMAT\(\s*momento\s*,\s*'[^']*'\s*\)\s+AS\s+momento\b/i)
  })

  // Se aplica el formato pedido a una hora de pared conocida: el resultado es el
  // mismo texto, sin T, sin Z y sin desplazamiento. Una pieza desconocida del
  // formato (%T, %r, etc.) hace fallar la prueba en vez de adivinar.
  test('el formato de momento es hora de pared: sin Z ni desplazamiento', async () => {
    await svc.intentosDeGestion(5)
    const sql = db.query.mock.calls[0][0]
    const m = sql.match(/DATE_FORMAT\(\s*momento\s*,\s*'([^']*)'\s*\)\s+AS\s+momento\b/i)
    expect(m).not.toBeNull()
    const pieza = { Y: '2026', m: '11', d: '05', H: '14', i: '30' }
    const texto = m[1].replace(/%(.)/g, (_, c) => {
      if (!(c in pieza)) throw new Error(`Pieza de formato no prevista: %${c}`)
      return pieza[c]
    })
    expect(texto).toBe('2026-11-05 14:30')
    expect(texto).not.toMatch(/[TZ+]/)
  })

  // Guarda: el servicio no debe volver a tocar el texto que entrega MySQL.
  test('entrega momento tal como lo devuelve la base, sin convertirlo', async () => {
    db.query = jest.fn(async () => [[{ id: 1, momento: '2026-11-05 14:30' }]])
    const f = await svc.intentosDeGestion(5)
    expect(f[0].momento).toBe('2026-11-05 14:30')
  })
})

describe('guardarServicios', () => {
  test('rechaza un servicio que no es de los seis', async () => {
    await expect(svc.guardarServicios(5, [{ servicio: 'MASAJES', estado: 'ACEPTA' }]))
      .rejects.toThrow(/servicio/i)
  })

  test('rechaza un estado que no está en el catálogo', async () => {
    await expect(svc.guardarServicios(5, [{ servicio: 'MISA_DE_MES', estado: 'QUIZAS' }]))
      .rejects.toThrow(/estado/i)
  })

  test('rechaza una modalidad que no está en el catálogo', async () => {
    await expect(svc.guardarServicios(5, [
      { servicio: 'MISA_DE_MES', estado: 'ACEPTA', modalidad: 'POR_PALOMA' },
    ])).rejects.toThrow(/modalidad/i)
  })

  // mysql2 expande `VALUES ?` solo cuando el segundo argumento es [filas]:
  // un arreglo que contiene el arreglo de filas.
  test('manda las filas como un arreglo dentro del arreglo de parámetros', async () => {
    await svc.guardarServicios(5, [
      { servicio: 'MISA_DE_MES', estado: 'ACEPTA', modalidad: 'PRESENCIAL', detalle: 'CATOLICA' },
      { servicio: 'TALLER_NINOS', estado: 'NO_APLICA' },
    ])
    const [sql, params] = db.query.mock.calls[0]
    expect(sql).toMatch(/VALUES \?\s+ON DUPLICATE KEY UPDATE/)
    expect(params).toEqual([[
      [5, 'MISA_DE_MES', 'ACEPTA', 'PRESENCIAL', 'CATOLICA', null],
      [5, 'TALLER_NINOS', 'NO_APLICA', null, null, null],
    ]])
  })

  test('si un servicio de la lista es inválido no escribe ninguno', async () => {
    await expect(svc.guardarServicios(5, [
      { servicio: 'MISA_DE_MES', estado: 'ACEPTA' },
      { servicio: 'MASAJES', estado: 'ACEPTA' },
    ])).rejects.toThrow(/servicio/i)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('con lista vacía no consulta', async () => {
    await svc.guardarServicios(5, [])
    await svc.guardarServicios(5, undefined)
    expect(db.query).not.toHaveBeenCalled()
  })

  // En MISA_DE_MES el detalle es la religión: el R-56 solo registra las cinco
  // del catálogo.
  describe('detalle de la misa de mes', () => {
    test('rechaza una religión fuera del catálogo, con status 400, y no escribe', async () => {
      await expect(svc.guardarServicios(5, [
        { servicio: 'MISA_DE_MES', estado: 'ACEPTA', detalle: 'BUDISTA' },
      ])).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/religi/i) })
      expect(db.query).not.toHaveBeenCalled()
    })

    test('una religión inválida en la lista no deja escribir los demás servicios', async () => {
      await expect(svc.guardarServicios(5, [
        { servicio: 'TALLER_NINOS', estado: 'ACEPTA' },
        { servicio: 'MISA_DE_MES', estado: 'ACEPTA', detalle: 'BUDISTA' },
      ])).rejects.toMatchObject({ status: 400 })
      expect(db.query).not.toHaveBeenCalled()
    })

    // Guarda: las cinco religiones del R-56 pasan. Se pondría en rojo si la
    // validación usara una lista incompleta o comparara en otra capitalización.
    test.each(['CATOLICA', 'CRISTIANA', 'MIXTA', 'MUSULMANA', 'TESTIGOS_JEHOVA'])(
      'acepta %s', async (religion) => {
        await svc.guardarServicios(5, [
          { servicio: 'MISA_DE_MES', estado: 'ACEPTA', detalle: religion },
        ])
        expect(db.query.mock.calls[0][1][0][0][4]).toBe(religion)
      })

    // Guarda: puede no haberse preguntado todavía. Se pondría en rojo si la
    // validación exigiera una religión siempre.
    test.each([[null], [undefined], ['']])('un detalle vacío (%p) es válido', async (vacio) => {
      await svc.guardarServicios(5, [
        { servicio: 'MISA_DE_MES', estado: 'OFRECIDO_SIN_RESPUESTA', detalle: vacio },
      ])
      expect(db.query).toHaveBeenCalledTimes(1)
    })

    // Guarda: el detalle solo es la religión en la misa. Se pondría en rojo si
    // la validación se aplicara sin mirar el servicio.
    test.each([
      'CARTILLA_RENACER', 'CONFERENCIA_RENACER', 'TALLER_NINOS',
      'GRUPO_APOYO_HIJOS', 'TALLER_JOVENES',
    ])('en %s el detalle no se valida', async (servicio) => {
      await svc.guardarServicios(5, [
        { servicio, estado: 'ACEPTA', detalle: 'lo que escriba la psicóloga' },
      ])
      expect(db.query.mock.calls[0][1][0][0][4]).toBe('lo que escriba la psicóloga')
    })
  })
})

describe('serviciosDeGestion', () => {
  test('devuelve las filas de la gestión', async () => {
    db.query = jest.fn(async () => [[{ servicio: 'MISA_DE_MES' }]])
    const f = await svc.serviciosDeGestion(5)
    expect(f).toEqual([{ servicio: 'MISA_DE_MES' }])
    expect(db.query.mock.calls[0][1]).toEqual([5])
  })
})
