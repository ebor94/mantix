const { proponerVinculos } = require('../services/vinculacionMasiva');
const { leerArgumentos } = require('../scripts/vincularPorAd');

const AD = [
  { usuario: 'WILLIAMLEAL', nombre: 'William Leal' },
  { usuario: 'silvanamejia', nombre: '', cn: 'SILVANA MEJIA' },
  { usuario: 'jgomez', nombre: 'Juan Gomez' },
  { usuario: 'jgomez2', nombre: 'Juan Gómez' }, // homónimo
  { usuario: 'mdiaz', nombre: 'Marta Diaz Ruiz' },
  { usuario: 'ana', nombre: 'Ana' }, // una sola palabra: nunca es candidato seguro
];

test('segura: el nombre corto cabe completo en el largo (en cualquier sentido), sin tildes ni mayúsculas', () => {
  const r = proponerVinculos([
    { id: 1, nombre: 'William Antonio Leal Castañeda' },
    { id: 2, nombre: 'Silvana Mejía' },
    { id: 3, nombre: 'Marta Diaz' },
  ], AD);
  expect(r.seguros.map((s) => [s.id, s.usuario])).toEqual([[1, 'williamleal'], [2, 'silvanamejia'], [3, 'mdiaz']]);
});

test('homónimos en el AD → revisar a mano, nunca seguro', () => {
  const r = proponerVinculos([{ id: 1, nombre: 'Juan Carlos Gomez Ruiz' }], AD);
  expect(r.seguros).toEqual([]);
  expect(r.revisar[0].candidatos.map((c) => c.usuario).sort()).toEqual(['jgomez', 'jgomez2']);
});

test('dos beneficiarios para el mismo usuario del AD → ninguno es seguro', () => {
  const r = proponerVinculos([{ id: 1, nombre: 'William Leal Castañeda' }, { id: 2, nombre: 'William Andres Leal' }], AD);
  expect(r.seguros).toEqual([]);
  expect(r.revisar.map((x) => x.id)).toEqual([1, 2]);
});

test('el usuario del AD ya vinculado a otro no se propone', () => {
  const r = proponerVinculos([{ id: 1, nombre: 'William Leal' }], AD, ['williamleal']);
  expect(r.seguros).toEqual([]);
  expect(r.sinCoincidencia).toEqual([{ id: 1, nombre: 'William Leal' }]);
});

test('solo una palabra en común no basta; dos que no cubren el nombre corto → revisar', () => {
  expect(proponerVinculos([{ id: 1, nombre: 'Ana Lucia Torres' }], AD).sinCoincidencia).toHaveLength(1);
  const r = proponerVinculos([{ id: 1, nombre: 'Marta Diaz Ortega' }], [{ usuario: 'md', nombre: 'Marta Lucia Diaz Ruiz' }]);
  expect(r.seguros).toEqual([]);
  expect(r.revisar[0].candidatos).toEqual([{ usuario: 'md', nombreAd: 'Marta Lucia Diaz Ruiz' }]);
});

test('argumentos: --actor obligatorio, --aplicar opcional, nada más', () => {
  expect(leerArgumentos(['--actor', 'eortega'])).toEqual({ args: { actor: 'eortega', aplicar: false } });
  expect(leerArgumentos(['--actor', 'eortega', '--aplicar']).args.aplicar).toBe(true);
  expect(leerArgumentos([]).error).toMatch(/--actor/);
  expect(leerArgumentos(['--actor', 'x y']).error).toMatch(/--actor/);
  expect(leerArgumentos(['--actor', 'eortega', '--todo']).error).toMatch(/desconocida/);
});
