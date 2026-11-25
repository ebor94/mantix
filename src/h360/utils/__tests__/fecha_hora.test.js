// El encuentro es una cita a la que llega una familia. Si el dato se corre de
// hora, alguien llega cuando no debe: de ahí que estas pruebas insistan tanto
// en que la hora guardada sea exactamente la que se escribió.
//
// Desde la Tarea 3.5 del laboratorio este archivo también es el dueño del reloj
// del negocio (`relojBogota`, `hoyBogota`) y de la aritmética de fechas
// (`fechaSolo`, `sumarDias`, `diasEntre`). Lo que esas pruebas cuidan, en orden
// de qué duele más si se rompe, es que la respuesta NO dependa de en qué zona
// corra el proceso: en un contenedor en UTC, entre las 19:00 y la medianoche de
// Cúcuta el reloj local ya marca el día siguiente, y con él el cron de
// medianoche generaría el día equivocado y el tablero amanecería vacío.

const {
  relojBogota, hoyBogota, fechaSolo, sumarDias, diasEntre, normalizarFechaHora,
  ZONA_NEGOCIO,
} = require('../fecha_hora')

describe('normalizarFechaHora', () => {
  test('acepta lo que manda datetime-local y le pone los segundos', () => {
    expect(normalizarFechaHora('2026-11-04T14:30')).toBe('2026-11-04 14:30:00')
  })

  test('acepta el formato de MySQL con espacio', () => {
    expect(normalizarFechaHora('2026-11-04 14:30:45')).toBe('2026-11-04 14:30:45')
  })

  // Esta es la razón de ser del helper: pasar por Date y sacar el ISO movería
  // las 14:30 de Bogotá a las 19:30 UTC.
  test('NO desplaza la hora a UTC', () => {
    const r = normalizarFechaHora('2026-11-04T14:30')
    expect(r).toContain('14:30')
    expect(r).not.toContain('19:30')
  })

  test('conserva la medianoche en lugar de tratarla como vacío', () => {
    expect(normalizarFechaHora('2026-11-04T00:00')).toBe('2026-11-04 00:00:00')
  })

  test('rellena a dos dígitos', () => {
    expect(normalizarFechaHora('2026-01-05T09:07')).toBe('2026-01-05 09:07:00')
  })

  test.each([
    ['vacío',            ''],
    ['nulo',             null],
    ['indefinido',       undefined],
    ['solo fecha',       '2026-11-04'],
    ['solo hora',        '14:30'],
    ['texto',            'mañana a las 3'],
    ['mes 13',           '2026-13-04T14:30'],
    ['día 0',            '2026-11-00T14:30'],
    ['hora 24',          '2026-11-04T24:00'],
    ['minuto 60',        '2026-11-04T14:60'],
    ['31 de febrero',    '2026-02-31T14:30'],
    ['29 feb no bisiesto','2026-02-29T14:30'],
    ['año de dos cifras','26-11-04T14:30'],
  ])('rechaza %s', (_, valor) => {
    expect(normalizarFechaHora(valor)).toBeNull()
  })

  test('acepta el 29 de febrero en año bisiesto', () => {
    expect(normalizarFechaHora('2028-02-29T14:30')).toBe('2028-02-29 14:30:00')
  })

  test('tolera espacios alrededor', () => {
    expect(normalizarFechaHora('  2026-11-04T14:30  ')).toBe('2026-11-04 14:30:00')
  })
})

// ── El reloj del negocio ───────────────────────────────────────────────────

describe('relojBogota', () => {
  test('devuelve el día y la hora de pared de Bogotá, no las de UTC', () => {
    // 22:30 UTC son las 17:30 en Cúcuta, el mismo día.
    expect(relojBogota(new Date('2026-11-09T22:30:00Z')))
      .toEqual({ dia: '2026-11-09', hora: '17:30' })
  })

  test('antes de medianoche en UTC todavía es el día anterior en Bogotá', () => {
    // 2026-11-26 02:30 UTC es el 25 a las 21:30 en Cúcuta. Con el reloj de UTC
    // el cron de las 00:05 generaría el día de mañana.
    expect(relojBogota(new Date('2026-11-26T02:30:00Z')))
      .toEqual({ dia: '2026-11-25', hora: '21:30' })
  })

  test('la hora viene en 24 horas y a dos dígitos, no «5 PM»', () => {
    expect(relojBogota(new Date('2026-11-09T10:05:00Z')).hora).toBe('05:05')
    expect(relojBogota(new Date('2026-11-09T05:00:00Z')).hora).toBe('00:00')
  })

  test('la zona va escrita y es la de Bogotá', () => {
    expect(ZONA_NEGOCIO).toBe('America/Bogota')
  })

  // Esta es la prueba que justifica el archivo: el resultado no puede depender
  // de la zona del proceso. Hoy el servidor corre en America/Bogota porque la
  // máquina está configurada así; en un contenedor corre en UTC.
  test('da lo mismo en procesos que corren en otras zonas', () => {
    const { execFileSync } = require('child_process')
    const ZONAS = ['UTC', 'Asia/Tokyo', 'Pacific/Auckland', 'America/Los_Angeles', 'America/Bogota']
    const script = `
      const f = require(${JSON.stringify(require.resolve('../fecha_hora'))})
      const instante = new Date('2026-11-26T02:30:00Z')
      const salida = {}
      for (const tz of ${JSON.stringify(ZONAS)}) {
        process.env.TZ = tz
        salida[tz] = {
          reloj: f.relojBogota(instante),
          hoy: f.hoyBogota(instante),
          suma: f.sumarDias('2026-02-28', 1),
          entre: f.diasEntre('2026-02-28', '2026-03-01'),
          feb31: f.fechaSolo('2026-02-31'),
          horaLocal: instante.getHours(),
        }
      }
      console.log(JSON.stringify(salida))`
    const entorno = { ...process.env }
    delete entorno.TZ
    const salida = JSON.parse(execFileSync(process.execPath, ['-e', script],
      { env: entorno, encoding: 'utf8', timeout: 20000 }))

    // Que la prueba tenga con qué fallar: el reloj local marca otra hora en
    // cada zona, y con la hora local el resultado daría distinto en cada una.
    expect(salida['UTC'].horaLocal).toBe(2)
    expect(salida['Asia/Tokyo'].horaLocal).toBe(11)

    for (const tz of ZONAS) {
      expect(salida[tz].reloj).toEqual({ dia: '2026-11-25', hora: '21:30' })
      expect(salida[tz].hoy).toBe('2026-11-25')
      expect(salida[tz].suma).toBe('2026-03-01')
      expect(salida[tz].entre).toBe(1)
      expect(salida[tz].feb31).toBeNull()
    }
  })
})

describe('hoyBogota', () => {
  test('es exactamente la parte de fecha de relojBogota', () => {
    for (const iso of ['2026-11-26T02:30:00Z', '2026-11-25T05:10:00Z', '2026-01-01T00:00:00Z']) {
      const instante = new Date(iso)
      expect(hoyBogota(instante)).toBe(relojBogota(instante).dia)
    }
  })

  test('devuelve AAAA-MM-DD y no el DD/MM/AAAA de mostrar', () => {
    // `desinfecciones.service.js` tiene otro `hoyBogota()` que devuelve
    // DD/MM/AAAA para el encabezado de un mensaje de Chat. Mismo nombre, otro
    // contrato: esta es la que se compara contra un DATE de MySQL.
    expect(hoyBogota(new Date('2026-11-25T18:00:00Z'))).toBe('2026-11-25')
  })

  test('sin argumento usa el instante actual', () => {
    expect(hoyBogota()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(hoyBogota()).toBe(relojBogota().dia)
  })
})

// ── Fechas sin hora ───────────────────────────────────────────────────────

describe('fechaSolo', () => {
  test('recorta cualquier ISO que empiece por una fecha', () => {
    expect(fechaSolo('2026-11-09')).toBe('2026-11-09')
    expect(fechaSolo('2026-11-09T14:30:00.000Z')).toBe('2026-11-09')
    expect(fechaSolo('  2026-11-09  ')).toBe('2026-11-09')
  })

  test.each([
    ['vacío',              ''],
    ['nulo',               null],
    ['indefinido',         undefined],
    ['texto',              'mañana'],
    ['31 de febrero',      '2026-02-31'],
    ['29 feb no bisiesto', '2026-02-29'],
    ['mes 13',             '2026-13-01'],
    ['día 0',              '2026-11-00'],
    ['31 de abril',        '2026-04-31'],
    ['año de dos cifras',  '26-11-09'],
  ])('rechaza %s', (_, valor) => {
    expect(fechaSolo(valor)).toBeNull()
  })

  test('acepta el 29 de febrero en año bisiesto', () => {
    expect(fechaSolo('2028-02-29')).toBe('2028-02-29')
  })

  // No se pasa por `new Date('2026-11-09')`: ese constructor da medianoche UTC,
  // que en Bogotá es el 8, y el día se correría hacia atrás.
  test('no corre el día: trabaja con el texto', () => {
    expect(fechaSolo('2026-01-01')).toBe('2026-01-01')
    expect(fechaSolo('2026-12-31')).toBe('2026-12-31')
  })
})

describe('sumarDias', () => {
  test('suma dentro del mes', () => {
    expect(sumarDias('2026-11-09', 3)).toBe('2026-11-12')
  })

  test('cruza el mes, el año y el 29 de febrero', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29')
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01')
  })

  test('sumar cero no mueve nada y sumar negativo resta', () => {
    expect(sumarDias('2026-11-09', 0)).toBe('2026-11-09')
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
  })

  test('quince días es el ciclo de la quincenal', () => {
    expect(sumarDias('2026-11-10', 15)).toBe('2026-11-25')
  })
})

describe('diasEntre', () => {
  test('cuenta los días del intervalo, sin contar las dos puntas', () => {
    expect(diasEntre('2026-11-09', '2026-11-12')).toBe(3)
    expect(diasEntre('2026-11-09', '2026-11-09')).toBe(0)
  })

  test('al revés da negativo: el signo dice si hay atraso o adelanto', () => {
    expect(diasEntre('2026-11-12', '2026-11-09')).toBe(-3)
  })

  test('cruza el mes y el año', () => {
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1)
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1)
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2)   // bisiesto
  })

  test('es la inversa de sumarDias', () => {
    const desde = '2026-11-10'
    for (const n of [0, 1, 15, 45, 400]) {
      expect(diasEntre(desde, sumarDias(desde, n))).toBe(n)
    }
  })
})
