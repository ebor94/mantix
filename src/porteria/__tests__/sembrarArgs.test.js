const { leerArgumentos } = require('../scripts/sembrar');

const USO = 'Uso: npm run porteria:sembrar -- --sede <id> (--placas ABC123,XYZ789 | --todos)';

test('--todos siembra toda la flota (placas null)', () => {
  expect(leerArgumentos(['--sede', '3', '--todos'])).toEqual({ sedeId: 3, placas: null });
  expect(leerArgumentos(['--todos', '--sede', '3'])).toEqual({ sedeId: 3, placas: null });
});

test('--placas normaliza la lista', () => {
  expect(leerArgumentos(['--sede', '3', '--placas', 'abc-123, xyz 789'])).toEqual({ sedeId: 3, placas: ['ABC123', 'XYZ789'] });
});

test.each([
  [[]],
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
