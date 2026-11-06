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

  // Dos vocabularios parecidos y distintos, y el parecido de los nombres es la
  // trampa: MODALIDADES es cómo se OFRECE un servicio (el SI/SIV del Excel) y
  // MODALIDADES_ATENCION es cómo se ATENDIÓ a la familia (el ENUM de
  // la tabla de atenciones). Validar uno con el otro aceptaría MENSAJE como
  // atención psicológica y rechazaría una atención TELEFONICA.
  describe('las dos modalidades son vocabularios distintos', () => {
    test('la de la atención psicológica es PRESENCIAL/TELEFONICA/VIRTUAL', () => {
      expect(cat.MODALIDADES_ATENCION).toEqual(['PRESENCIAL', 'TELEFONICA', 'VIRTUAL'])
    })

    test('no son la misma lista: cada una tiene un valor que la otra no', () => {
      expect(cat.MODALIDADES_ATENCION).not.toEqual(cat.MODALIDADES)
      expect(cat.MODALIDADES_ATENCION).toContain('TELEFONICA')
      expect(cat.MODALIDADES).not.toContain('TELEFONICA')
      expect(cat.MODALIDADES).toContain('MENSAJE')
      expect(cat.MODALIDADES_ATENCION).not.toContain('MENSAJE')
    })

    // El vocabulario vive en el archivo de catálogos, como los otros ocho, y el
    // servicio de atenciones usa ESE y no una copia suya.
    test('el servicio de atenciones usa el del catálogo, no una copia', () => {
      const svc = require('../../services/duelo_atenciones.service')
      expect(svc.MODALIDADES_ATENCION).toBe(cat.MODALIDADES_ATENCION)
    })
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

  // La sede se comparaba con === acá y por contenido en la rama de otra ciudad:
  // una sede «MASCOTAS CUCUTA» era local para la rama y no era mascota acá, así
  // que la insignia habría dicho persona mientras la fila guardaba una mascota.
  // Las dos normalizan igual y comparan igual.
  describe('la sede se normaliza igual que en la rama de otra ciudad', () => {
    test.each([
      'MASCOTAS CUCUTA', 'Mascotas Cucuta', 'Sede Mascotas', '  mascotas   cucuta ',
    ])('%j es el centro de costo de mascotas', sede => {
      expect(cat.esMascota({ orden_servicio: '03233', sede })).toBe(true)
    })

    test.each(['Sede Gran Colombia', 'Sede San José', 'Cristo Rey Cucuta', 'Sede Pamplona'])(
      '%j no es mascota', sede => {
        expect(cat.esMascota({ orden_servicio: 'A-1', sede })).toBe(false)
      })

    test('una sede vacía o en blanco no es mascota', () => {
      for (const sede of ['', '   ', null, undefined])
        expect(cat.esMascota({ orden_servicio: 'A-1', sede })).toBe(false)
    })

    // La normalización es una sola función, exportada, y es la que usa también la
    // rama de otra ciudad (ver duelo.bandeja.test.js: compara las dos).
    test('normalizarSede deja la sede comparable: mayúsculas, un solo espacio y recortada', () => {
      expect(typeof cat.normalizarSede).toBe('function')
      expect(cat.normalizarSede('  sede   gran   colombia ')).toBe('SEDE GRAN COLOMBIA')
      expect(cat.normalizarSede(null)).toBe('')
      expect(cat.normalizarSede(undefined)).toBe('')
    })
  })
})
