const {
  FORMAS_EFECTIVO, FORMAS_BANCARIAS, normalizarErp, recibosBancariosSinErp,
  normalizarItemsMasivo, clasificarItemsMasivo
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

describe('normalizarItemsMasivo', () => {
  test('trimea, pasa numeroRecibo a mayúsculas y descarta vacíos', () => {
    const out = normalizarItemsMasivo([
      { numeroRecibo: ' mp-000042 ', numeroReciboErp: ' ERP-1 ' },
      { numeroRecibo: '', numeroReciboErp: 'x' },
      { numeroRecibo: 'MP-000043' }
    ]);
    expect(out).toEqual([
      { numeroRecibo: 'MP-000042', numeroReciboErp: 'ERP-1' },
      { numeroRecibo: 'MP-000043', numeroReciboErp: '' }
    ]);
  });
  test('dedupe por numeroRecibo, gana el último', () => {
    const out = normalizarItemsMasivo([
      { numeroRecibo: 'MP-1', numeroReciboErp: 'A' },
      { numeroRecibo: 'mp-1', numeroReciboErp: 'B' }
    ]);
    expect(out).toEqual([{ numeroRecibo: 'MP-1', numeroReciboErp: 'B' }]);
  });
  test('entrada nula → []', () => {
    expect(normalizarItemsMasivo()).toEqual([]);
  });
});

describe('clasificarItemsMasivo', () => {
  const ctx = { permisos: { efectivo: false, bancarios: true, superAdmin: false }, esCajeroScoped: false, sedeUsuario: null };
  const recibos = {
    'A-1': { numeroRecibo: 'A-1', formaPago: 'TRANSFERENCIA', afiliadoId: 10, asesor: { sede_id: 1 } },
    'A-2': { numeroRecibo: 'A-2', formaPago: 'TRANSFERENCIA', afiliadoId: 11, asesor: { sede_id: 1 } },
    'A-3': { numeroRecibo: 'A-3', formaPago: 'EFECTIVO', afiliadoId: 12, asesor: { sede_id: 1 } }
  };

  test('no encontrado', () => {
    const { aprobables, fallidos } = clasificarItemsMasivo(
      [{ numeroRecibo: 'X-9', numeroReciboErp: '' }], recibos, ctx);
    expect(aprobables).toEqual([]);
    expect(fallidos).toEqual([{ numeroRecibo: 'X-9', motivo: 'No encontrado o ya aprobado' }]);
  });
  test('forma sin permiso (cartera intenta efectivo)', () => {
    const { fallidos } = clasificarItemsMasivo([{ numeroRecibo: 'A-3', numeroReciboErp: '' }], recibos, ctx);
    expect(fallidos).toEqual([{ numeroRecibo: 'A-3', motivo: 'Sin permiso para esta forma de pago' }]);
  });
  test('bancario sin ERP', () => {
    const { fallidos } = clasificarItemsMasivo([{ numeroRecibo: 'A-1', numeroReciboErp: '' }], recibos, ctx);
    expect(fallidos).toEqual([{ numeroRecibo: 'A-1', motivo: 'Falta N° de recibo ERP (bancario)' }]);
  });
  test('bancario con ERP → aprobable', () => {
    const { aprobables, fallidos } = clasificarItemsMasivo([{ numeroRecibo: 'A-1', numeroReciboErp: 'ERP-1' }], recibos, ctx);
    expect(fallidos).toEqual([]);
    expect(aprobables).toEqual([{ recibo: recibos['A-1'], erp: 'ERP-1' }]);
  });
  test('cajero acotado: otra sede', () => {
    const ctxCajero = { permisos: { efectivo: true, bancarios: false, superAdmin: false }, esCajeroScoped: true, sedeUsuario: 2 };
    const recibosEf = { 'B-1': { numeroRecibo: 'B-1', formaPago: 'EFECTIVO', afiliadoId: 5, asesor: { sede_id: 1 } } };
    const { fallidos } = clasificarItemsMasivo([{ numeroRecibo: 'B-1', numeroReciboErp: '' }], recibosEf, ctxCajero);
    expect(fallidos).toEqual([{ numeroRecibo: 'B-1', motivo: 'Recibo de otra sede' }]);
  });
  test('efectivo del cajero misma sede → aprobable sin erp', () => {
    const ctxCajero = { permisos: { efectivo: true, bancarios: false, superAdmin: false }, esCajeroScoped: true, sedeUsuario: 1 };
    const recibosEf = { 'B-1': { numeroRecibo: 'B-1', formaPago: 'EFECTIVO', afiliadoId: 5, asesor: { sede_id: 1 } } };
    const { aprobables } = clasificarItemsMasivo([{ numeroRecibo: 'B-1', numeroReciboErp: '' }], recibosEf, ctxCajero);
    expect(aprobables).toEqual([{ recibo: recibosEf['B-1'], erp: null }]);
  });
});
