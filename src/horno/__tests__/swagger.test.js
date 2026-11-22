// Toda ruta del módulo está documentada en /api-docs.
const spec = require('../../config/swagger');

const P = '/api/horno/v1';
const ESPERADAS = {
  [`${P}/health`]: ['get'],
  [`${P}/auth/login`]: ['post'],
  [`${P}/auth/me`]: ['get'],
  [`${P}/lecturas/ultima`]: ['get'],
  [`${P}/lecturas/serie`]: ['get'],
  [`${P}/lecturas`]: ['get'],
  [`${P}/lecturas.xlsx`]: ['get'],
};

test('documenta cada ruta del horno con sus métodos', () => {
  for (const [ruta, metodos] of Object.entries(ESPERADAS)) {
    expect([ruta, Object.keys(spec.paths[ruta] || {}).sort()]).toEqual([ruta, [...metodos].sort()]);
  }
  const propias = Object.keys(spec.paths).filter((r) => r.startsWith(P)).sort();
  expect(propias).toEqual(Object.keys(ESPERADAS).sort());
});

test('cada operación lleva tag, código de API y el esquema de error del módulo', () => {
  for (const ruta of Object.keys(ESPERADAS)) {
    for (const [metodo, op] of Object.entries(spec.paths[ruta])) {
      expect([ruta, metodo, op.tags]).toEqual([ruta, metodo, ['Horno INCOL']]);
      expect(op.summary).toMatch(/^HOR-[A-Z]{3}-\d{3} · /);
    }
  }
  expect(spec.components.schemas.HornoError.required).toEqual(['success', 'error', 'motivo', 'message']);
});
