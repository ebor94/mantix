const cat = require('../duelo.catalogos')

describe('catálogos del módulo de duelo', () => {
  test('los seis servicios del R-56, sin repetidos', () => {
    expect(cat.SERVICIOS).toEqual([
      'CARTILLA_RENACER', 'CONFERENCIA_RENACER', 'MISA_DE_MES',
      'TALLER_NINOS', 'GRUPO_APOYO_HIJOS', 'TALLER_JOVENES',
    ])
    expect(new Set(cat.SERVICIOS).size).toBe(cat.SERVICIOS.length)
  })

  // FUERA_DE_CIUDAD es un estado y no un valor que compita con ACEPTA:
  // en el Excel aparecía 1004 veces dentro de la misma celda del "SI".
  test('fuera de ciudad es un estado del servicio', () => {
    expect(cat.ESTADOS_SERVICIO).toContain('FUERA_DE_CIUDAD')
    expect(cat.ESTADOS_SERVICIO).toContain('ACEPTA')
  })

  test('la modalidad separa presencial de virtual', () => {
    expect(cat.MODALIDADES).toEqual(['PRESENCIAL', 'VIRTUAL', 'MENSAJE'])
  })
})

describe('esMascota', () => {
  test('la reconoce por el prefijo de la orden', () => {
    expect(cat.esMascota({ orden_servicio: 'MAS-0596' })).toBe(true)
  })

  test('la reconoce por el centro de costo', () => {
    expect(cat.esMascota({ orden_servicio: '03233', sede: 'Mascotas' })).toBe(true)
  })

  test('un servicio de persona no es mascota', () => {
    expect(cat.esMascota({ orden_servicio: 'A-20538', sede: 'Sede Gran Colombia' })).toBe(false)
  })

  test('sin datos no la da por mascota', () => {
    expect(cat.esMascota({})).toBe(false)
    expect(cat.esMascota(undefined)).toBe(false)
  })
})
