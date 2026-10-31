// src/porteria/__tests__/swagger.test.js
// Toda ruta del módulo está documentada en /api-docs.
const spec = require('../../config/swagger');

const P = '/api/porteria/v1';
const ESPERADAS = {
  [`${P}/health`]: ['get'],
  [`${P}/auth/login`]: ['post'],
  [`${P}/auth/sede`]: ['post'],
  [`${P}/auth/me`]: ['get'],
  [`${P}/catalogos/sedes`]: ['get'],
  [`${P}/catalogos/vehiculos-propios`]: ['get'],
  [`${P}/catalogos/conductores`]: ['get'],
  [`${P}/catalogos/asistencias`]: ['get'],
  [`${P}/catalogos/exequias`]: ['get'],
  [`${P}/catalogos/motivos`]: ['get'],
  [`${P}/eventos`]: ['get', 'post'],
  [`${P}/eventos/{id}`]: ['get', 'patch'],
  [`${P}/eventos/{id}/anular`]: ['post'],
  [`${P}/estado/dentro`]: ['get'],
  [`${P}/estado/fuera`]: ['get'],
  [`${P}/estado/placa/{placa}`]: ['get'],
  [`${P}/vehiculos-externos`]: ['get', 'post'],
  [`${P}/vehiculos-externos/{id}`]: ['patch'],
  [`${P}/admin/motivos`]: ['get', 'post'],
  [`${P}/admin/motivos/{id}`]: ['patch', 'delete'],
  [`${P}/admin/reportes/movimientos.xlsx`]: ['get'],
};

test('documenta cada ruta de Portería con sus métodos', () => {
  for (const [ruta, metodos] of Object.entries(ESPERADAS)) {
    expect([ruta, Object.keys(spec.paths[ruta] || {}).sort()]).toEqual([ruta, [...metodos].sort()]);
  }
  const propias = Object.keys(spec.paths).filter((r) => r.startsWith(P)).sort();
  expect(propias).toEqual(Object.keys(ESPERADAS).sort());
});

test('cada operación lleva tag, código de API y respuesta de error del módulo', () => {
  for (const ruta of Object.keys(ESPERADAS)) {
    for (const [metodo, op] of Object.entries(spec.paths[ruta])) {
      expect([ruta, metodo, op.tags]).toEqual([ruta, metodo, ['Portería']]);
      expect(op.summary).toMatch(/^POR-[A-Z]{3}-\d{3} · /);
    }
  }
  expect(spec.components.schemas.PorteriaError.required).toEqual(['success', 'error', 'motivo', 'message']);
});
