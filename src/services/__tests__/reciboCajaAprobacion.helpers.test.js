const {
  FORMAS_EFECTIVO, FORMAS_BANCARIAS, normalizarErp, recibosBancariosSinErp
} = require('../reciboCajaAprobacion.helpers');

describe('FORMAS', () => {
  test('valores exactos', () => {
    expect(FORMAS_EFECTIVO).toEqual(['EFECTIVO', 'PAGO_EN_CAJA']);
    expect(FORMAS_BANCARIAS).toEqual(['TRANSFERENCIA', 'CORRESPONSAL', 'POSFECHADO_COBRADO', 'EFECTY', 'SUPER_GIROS']);
  });
});

describe('normalizarErp', () => {
  test('trimea, descarta vacíos y stringifica claves', () => {
    expect(normalizarErp({ 5: '  ERP-1 ', 6: '', 7: '   ', 8: 'X' }))
      .toEqual({ '5': 'ERP-1', '8': 'X' });
  });
  test('entrada vacía o nula → {}', () => {
    expect(normalizarErp()).toEqual({});
    expect(normalizarErp(null)).toEqual({});
  });
  test('valores no-string se convierten', () => {
    expect(normalizarErp({ 9: 12345 })).toEqual({ '9': '12345' });
  });
});

describe('recibosBancariosSinErp', () => {
  const recibos = [
    { id: 1, formaPago: 'TRANSFERENCIA', numeroRecibo: 'A-1' },
    { id: 2, formaPago: 'EFECTIVO', numeroRecibo: 'A-2' },
    { id: 3, formaPago: 'CORRESPONSAL', numeroRecibo: 'A-3' },
  ];
  test('bancario sin ERP → incluido; con ERP → excluido; efectivo → nunca', () => {
    const erpNorm = { '1': 'ERP-1' }; // 3 (bancario) sin erp, 2 es efectivo
    const faltantes = recibosBancariosSinErp(recibos, erpNorm);
    expect(faltantes.map(r => r.id)).toEqual([3]);
  });
  test('todos los bancarios con ERP → []', () => {
    expect(recibosBancariosSinErp(recibos, { '1': 'a', '3': 'b' })).toEqual([]);
  });
  test('sin erpNorm → todos los bancarios faltan', () => {
    expect(recibosBancariosSinErp(recibos).map(r => r.id)).toEqual([1, 3]);
  });
});
