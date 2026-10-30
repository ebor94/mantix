const { leerArgumentos, codigoSalida, usuarioDeCarga } = require('../scripts/sembrar');

const USO = 'Uso: npm run porteria:sembrar -- --sede <id> (--placas ABC123,XYZ789 | --todos)';

test('--todos siembra toda la flota (placas null)', () => {
  expect(leerArgumentos(['--sede', '3', '--todos'])).toEqual({ sedeId: 3, placas: null, simular: false });
  expect(leerArgumentos(['--todos', '--sede', '3'])).toEqual({ sedeId: 3, placas: null, simular: false });
});

test('--simular se acepta en cualquier posición', () => {
  expect(leerArgumentos(['--sede', '3', '--todos', '--simular'])).toEqual({ sedeId: 3, placas: null, simular: true });
  expect(leerArgumentos(['--simular', '--sede', '3', '--placas', 'a1'])).toEqual({ sedeId: 3, placas: ['A1'], simular: true });
});

test('codigoSalida: 2 solo si una placa pedida con --placas quedó omitida por no ser vehículo activo', () => {
  const noActivo = { placa: 'X', razon: 'no es un vehículo activo de la empresa' };
  expect(codigoSalida(['X'], [noActivo])).toBe(2);
  expect(codigoSalida(['X'], [{ placa: 'X', razon: 'ya tiene estado' }])).toBe(0);
  expect(codigoSalida(null, [noActivo])).toBe(0);
  expect(codigoSalida(['X'], [])).toBe(0);
});

test('usuarioDeCarga identifica al usuario del sistema', () => {
  expect(usuarioDeCarga()).toMatch(/^carga-inicial(:.+)?$/);
});

test('--placas normaliza la lista', () => {
  expect(leerArgumentos(['--sede', '3', '--placas', 'abc-123, xyz 789'])).toEqual({ sedeId: 3, placas: ['ABC123', 'XYZ789'], simular: false });
});

test.each([
  [[]],
  [['--sede', '3', '--placas', '--todos']],
  [['--sede', '3', '--placas', '--simular', '--todos']],
  [['--sede', '3', '--todos', '--simular', '--simular']],
  [['--sede', '3']],
  [['--sede']],
  [['--sede', 'x', '--todos']],
  [['--sede', '0', '--todos']],
  [['--placas', 'A1']],
  [['--sede', '3', '--placa', 'A1']],
  [['--sede', '3', '--placas=A1']],
  [['--sede', '3', '--placas', 'A1', '--todos']],
  [['--sede', '3', '--sede', '4', '--todos']],
  [['--sede', '3', '--todos', '--todos']],
  [['--sede', '3', '--placas', 'A1', '--placas', 'B2']],
  [['--sede', '3', '--placas', ',']],
  [['--sede', '3', '--placas', '']],
  [['--sede', '3', '--placas', ' ']],
  [['--sede', '3', '--placas']],
  [['--sede', '3', '--todos', 'extra']],
])('%p → error de uso', (argv) => {
  expect(() => leerArgumentos(argv)).toThrow(USO);
});
