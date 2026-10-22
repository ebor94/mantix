const { borradorVigente } = require('../borrador');

const criterios = [{ id: 1 }, { id: 2 }, { id: 3 }];

test('manda el borrador (incluido un null explícito); sin borrador usa la final; sin nada → null', () => {
  const propios = new Map([[1, 4], [2, null]]);
  const delFinal = new Map([[1, 9], [2, 8], [3, 7]]);
  expect(borradorVigente(criterios, propios, delFinal)).toEqual({ 1: 4, 2: null, 3: 7 });
});

test('sin borrador ni final: todas las casillas vacías', () => {
  expect(borradorVigente(criterios)).toEqual({ 1: null, 2: null, 3: null });
});
