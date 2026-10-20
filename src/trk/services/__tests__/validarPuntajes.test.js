const { validarPuntajes } = require('../calificaciones.service');

// Fixture de prueba: los máximos reales viven en BD (seed); aquí solo importan para la regla.
const criterios = [
  { id: 1, nombre: 'Creatividad', puntaje_max: 35 },
  { id: 2, nombre: 'Seguridad', puntaje_max: 30 },
  { id: 3, nombre: 'Elaboración', puntaje_max: 20 },
  { id: 4, nombre: 'Pasarela', puntaje_max: 15 }
];
const p = (...v) => v.map((puntaje, i) => ({ criterio_id: i + 1, puntaje }));

test('R2: total = suma de criterios', () => {
  expect(validarPuntajes(criterios, p(30, 25, 10, 5))).toBe(70);
  expect(validarPuntajes(criterios, p(0, 0, 0, 0))).toBe(0);
  expect(validarPuntajes(criterios, p(35, 30, 20, 15))).toBe(100);
});

test('§13.1 / R1: criterio > máximo → 422 PUNTAJE_FUERA_DE_RANGO', () => {
  expect(() => validarPuntajes(criterios, p(36, 0, 0, 0))).toThrow(expect.objectContaining({ statusCode: 422, motivo: 'PUNTAJE_FUERA_DE_RANGO' }));
  expect(() => validarPuntajes(criterios, p(-1, 0, 0, 0))).toThrow(expect.objectContaining({ statusCode: 422 }));
  expect(() => validarPuntajes(criterios, p(1.5, 0, 0, 0))).toThrow(expect.objectContaining({ statusCode: 422 }));
});

test('HU-8 CA4: criterio sin valor explícito → 422 CRITERIO_FALTANTE', () => {
  expect(() => validarPuntajes(criterios, p(10, 10, 10))).toThrow(expect.objectContaining({ statusCode: 422, motivo: 'CRITERIO_FALTANTE' }));
});

test('criterio repetido o de otra rúbrica → 400', () => {
  expect(() => validarPuntajes(criterios, [...p(1, 1, 1, 1), { criterio_id: 1, puntaje: 2 }])).toThrow(expect.objectContaining({ statusCode: 400 }));
  expect(() => validarPuntajes(criterios, [...p(1, 1, 1, 1), { criterio_id: 99, puntaje: 2 }])).toThrow(expect.objectContaining({ statusCode: 400 }));
});
