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
})

describe('serviciosDeGestion', () => {
  test('devuelve las filas de la gestión', async () => {
    db.query = jest.fn(async () => [[{ servicio: 'MISA_DE_MES' }]])
    const f = await svc.serviciosDeGestion(5)
    expect(f).toEqual([{ servicio: 'MISA_DE_MES' }])
    expect(db.query.mock.calls[0][1]).toEqual([5])
  })
})
