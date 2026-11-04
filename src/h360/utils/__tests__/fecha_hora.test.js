// El encuentro es una cita a la que llega una familia. Si el dato se corre de
// hora, alguien llega cuando no debe: de ahí que estas pruebas insistan tanto
// en que la hora guardada sea exactamente la que se escribió.

const { normalizarFechaHora } = require('../fecha_hora')

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
