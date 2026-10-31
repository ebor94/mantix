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

// Resuelve un $ref local ('#/components/...') para comparar contra lo que ve el lector del Swagger.
const resolver = (nodo) => {
  if (!nodo || !nodo.$ref) return nodo;
  return nodo.$ref.replace('#/', '').split('/').reduce((acc, k) => acc[k], spec);
};
const cuerpo = (ruta, metodo) => resolver(spec.paths[ruta][metodo].requestBody.content['application/json'].schema);

test('/estado/dentro no documenta la sede "todas" que la ruta rechaza', () => {
  const params = spec.paths[`${P}/estado/dentro`].get.parameters || [];
  expect(params.map((p) => p.$ref)).not.toContain('#/components/parameters/SedeConsulta');
  expect(params.map((p) => p.$ref)).toContain('#/components/parameters/SedeId');
  // /estado/fuera sí acepta sede_id (admin, con 'todas')
  expect((spec.paths[`${P}/estado/fuera`].get.parameters || []).map((p) => p.$ref)).toContain('#/components/parameters/SedeConsulta');
});

test('los cuerpos de motivos reflejan lo que aceptan POST y PATCH', () => {
  const crear = cuerpo(`${P}/admin/motivos`, 'post');
  expect(crear.required).toEqual(expect.arrayContaining(['codigo', 'nombre']));
  const cambiar = cuerpo(`${P}/admin/motivos/{id}`, 'patch');
  expect(cambiar.properties).not.toHaveProperty('codigo');
  expect(cambiar.properties).toHaveProperty('nombre');
  expect(cambiar.minProperties).toBe(1);
  for (const c of [crear, cambiar]) {
    expect(c.properties).not.toHaveProperty('id');
    expect(c.properties).not.toHaveProperty('en_uso');
  }
});
