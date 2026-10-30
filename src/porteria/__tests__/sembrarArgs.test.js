const { leerArgumentos } = require('../scripts/sembrar');

const USO = 'Uso: npm run porteria:sembrar -- --sede <id> [--placas ABC123,XYZ789]';

test('sede obligatoria y placas opcionales normalizadas', () => {
  expect(leerArgumentos(['--sede', '3'])).toEqual({ sedeId: 3, placas: null });
  expect(leerArgumentos(['--sede', '3', '--placas', 'abc-123, xyz 789'])).toEqual({ sedeId: 3, placas: ['ABC123', 'XYZ789'] });
});

test.each([[[]], [['--sede']], [['--sede', 'x']], [['--sede', '0']], [['--placas', 'A1']]])('%p → error de uso', (argv) => {
  expect(() => leerArgumentos(argv)).toThrow(USO);
});
