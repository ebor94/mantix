// El calendario de las reglas del laboratorio: qué actividad toca y qué día.
//
// Lo único que se decide acá es lo que se puede decidir sin base de datos. Por
// eso el archivo no mockea nada: si alguna vez estas pruebas necesitan un
// `jest.mock('../../config/db')`, es que el módulo dejó de ser puro.
//
// Lo que se cuida, en orden de qué duele más si se rompe:
//
//  1. Que el día de la semana se saque DEL TEXTO de la fecha. 'AAAA-MM-DD'
//     pasado por `new Date()` es medianoche UTC, que en Bogotá (UTC-5) es el
//     día anterior: el sábado se leería viernes y las dos actividades
//     semanales de la trampa de grasa saldrían el día equivocado. Es el mismo
//     bug que corrió las fechas en la pantalla de vehículos.
//  2. Que CADA_N_DIAS y POR_EVENTO NO las decida el calendario. La primera
//     depende de cuándo se hizo la última (eso lo sabe el generador, que sí
//     consulta la base) y la segunda no tiene día.
//  3. Que solo la DIARIA se pierda al cerrar el día. Si una semanal caducara,
//     el atraso se borraría y el informe de cumplimiento mentiría.

const { diaSemanaISO, reglaAplicaEn, arrastra } = require('../laboratorio.calendario')

describe('diaSemanaISO', () => {
  test('el sábado es 6 y el domingo es 7', () => {
    expect(diaSemanaISO('2026-11-28')).toBe(6)   // sábado
    expect(diaSemanaISO('2026-11-29')).toBe(7)   // domingo
    expect(diaSemanaISO('2026-11-30')).toBe(1)   // lunes
  })

  // La trampa que tumbó la pantalla de vehículos: 'AAAA-MM-DD' por new Date()
  // es medianoche UTC, que en Bogotá es el día anterior.
  test('no corre el día por zona horaria', () => {
    expect(diaSemanaISO('2026-01-01')).toBe(4)   // jueves
  })

  test('devuelve null si no es una fecha', () => {
    expect(diaSemanaISO('cualquier cosa')).toBeNull()
    expect(diaSemanaISO('2026-02-31')).toBeNull()
  })
})

describe('reglaAplicaEn', () => {
  test('DIARIA aplica todos los días', () => {
    expect(reglaAplicaEn({ frecuencia: 'DIARIA' }, '2026-11-25')).toBe(true)
  })

  test('SEMANAL aplica solo su día', () => {
    const sabado = { frecuencia: 'SEMANAL', dia_semana: 6 }
    expect(reglaAplicaEn(sabado, '2026-11-28')).toBe(true)
    expect(reglaAplicaEn(sabado, '2026-11-27')).toBe(false)
  })

  // CADA_N_DIAS no decide por calendario: depende de cuándo se hizo la última.
  // Esa decisión es del generador, que sí consulta la base.
  test('CADA_N_DIAS y POR_EVENTO no las decide el calendario', () => {
    expect(reglaAplicaEn({ frecuencia: 'CADA_N_DIAS', cada_dias: 15 }, '2026-11-25')).toBe(false)
    expect(reglaAplicaEn({ frecuencia: 'POR_EVENTO' }, '2026-11-25')).toBe(false)
  })
})

describe('arrastra', () => {
  test('solo la diaria se pierde al cerrar el día', () => {
    expect(arrastra('DIARIA')).toBe(false)
    expect(arrastra('SEMANAL')).toBe(true)
    expect(arrastra('CADA_N_DIAS')).toBe(true)
  })
})
