const { leerArgumentos } = require('../scripts/importarBeneficiarios');

test('ruta, actor y --simular', () => {
  expect(leerArgumentos(['listado.xlsx', '--actor', 'eortega', '--simular'])).toEqual({ args: { ruta: 'listado.xlsx', actor: 'eortega', simular: true } });
  expect(leerArgumentos(['--actor', 'eortega', 'LISTADO MASAJES 53 BONOS.XLSX']).args.ruta).toBe('LISTADO MASAJES 53 BONOS.XLSX');
});

test.each([
  [[], /Falta la ruta/],
  [['listado.xlsx'], /Falta --actor/],
  [['listado.xlsx', '--actor'], /Falta --actor/],
  [['listado.xlsx', '--actor', 'a; DROP TABLE x'], /Falta --actor/],
  [['listado.csv', '--actor', 'eortega'], /\.xlsx/],
  [['a.xlsx', 'b.xlsx', '--actor', 'eortega'], /una ruta/],
  [['a.xlsx', '--actor', 'eortega', '--forzar'], /Opción desconocida/],
])('%j → error', (argv, msg) => expect(leerArgumentos(argv).error).toMatch(msg));
