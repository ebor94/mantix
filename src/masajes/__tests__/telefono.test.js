const { normalizarCelular, enmascararCelular } = require('../dominio/telefono');

describe('normalizarCelular (móviles colombianos → 573XXXXXXXXX)', () => {
  test.each([
    ['3152884079', '573152884079'],
    ['315 288 4079', '573152884079'],
    ['315-288-4079', '573152884079'],
    ['+57 315 288 4079', '573152884079'],
    ['573152884079', '573152884079'],
    ['00573152884079', '573152884079'],
    [' (315) 288.4079 ', '573152884079'],
    [3152884079, '573152884079'], // exceljs puede devolver la celda como número
  ])('%p → %s', (entrada, esperado) => expect(normalizarCelular(entrada)).toBe(esperado));

  test.each([
    ['6075551234', 'fijo de Cúcuta, no móvil'],
    ['12345', 'muy corto'],
    ['31528840790', '11 dígitos'],
    ['+1 315 288 4079', 'otro país'],
    ['583152884079', 'prefijo 58'],
    ['', 'vacío'],
    [null, 'null'],
    [undefined, 'undefined'],
    [3.152884079e9 + 0.5, 'número no entero'],
    ['3152884079'.repeat(5), 'demasiado largo'],
    [{ toString: () => '3152884079' }, 'objeto'],
    ['31528840AB79', 'letras en medio: quitarlas daría un número adivinado'],
    ['Cel: 3152884079', 'texto alrededor'],
    ['3152884079 ext 12', 'extensión'],
    ['315+2884079', '"+" fuera del inicio'],
  ])('%p (%s) → null', (entrada) => expect(normalizarCelular(entrada)).toBeNull());
});

describe('enmascararCelular (para logs y tablas)', () => {
  test('deja visibles prefijo y últimos 3 dígitos', () => {
    expect(enmascararCelular('573152884079')).toBe('57315****079');
  });

  test('lo que no es un celular normalizado se enmascara completo', () => {
    expect(enmascararCelular('3152884079')).toBe('****');
    expect(enmascararCelular(null)).toBe('****');
    expect(enmascararCelular('abc')).toBe('****');
  });
});
