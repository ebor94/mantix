const { validarInscripcion, MENSAJES } = require('../dominio/validaciones');

const OPC = { versionPolitica: 'borrador', ordenesConFoto: new Set() };
const base = (extra = {}) => ({
  nombre_completo: '  Ana   María Pérez ', cedula: '1090123456', celular: '3001234567',
  correo: 'Ana@Correo.COM', honra_companero: 'no', acepta_politica: 'true',
  version_politica: 'borrador', companeros: '[]', ...extra,
});

test('rama No válida: normaliza nombre y correo', () => {
  const r = validarInscripcion(base(), OPC);
  expect(r.ok).toBe(true);
  expect(r.datos).toMatchObject({
    nombre_completo: 'Ana María Pérez', correo: 'ana@correo.com', honra_companero: false, companeros: [],
  });
});

test.each([
  ['nombre_completo', 'Ana'],
  ['nombre_completo', 'A'.repeat(60) + ' ' + 'B'.repeat(61)],
  ['cedula', '1234'],
  ['cedula', '12345678901'],
  ['cedula', '1.090.123'],
  ['celular', '6001234567'],
  ['celular', '300123456'],
  ['correo', 'ana@correo'],
  ['correo', 'sin-arroba.com'],
  ['honra_companero', 'tal vez'],
  ['acepta_politica', 'false'],
])('rechaza %s = %p', (campo, valor) => {
  const r = validarInscripcion(base({ [campo]: valor }), OPC);
  expect(r.ok).toBe(false);
  expect(r.errores[campo]).toBeTruthy();
});

test('versión de política distinta a la vigente', () => {
  const r = validarInscripcion(base({ version_politica: 'v0' }), OPC);
  expect(r.errores.acepta_politica).toBe(MENSAJES.politicaVersion);
});

test('rama Sí con dos compañeros y sus fotos', () => {
  const r = validarInscripcion(
    base({ honra_companero: 'si', companeros: JSON.stringify([{ nombre: ' Luna ' }, { nombre: 'Max' }]) }),
    { versionPolitica: 'borrador', ordenesConFoto: new Set([1, 2]) },
  );
  expect(r.ok).toBe(true);
  expect(r.datos.companeros).toEqual([{ orden: 1, nombre: 'Luna' }, { orden: 2, nombre: 'Max' }]);
});

test('rama Sí sin compañeros', () => {
  const r = validarInscripcion(base({ honra_companero: 'si' }), OPC);
  expect(r.errores.companeros).toBe(MENSAJES.companerosCantidad);
});

test('rama Sí con más de tres compañeros', () => {
  const lista = JSON.stringify([1, 2, 3, 4].map((n) => ({ nombre: `C${n}` })));
  const r = validarInscripcion(base({ honra_companero: 'si', companeros: lista }),
    { versionPolitica: 'borrador', ordenesConFoto: new Set([1, 2, 3]) });
  expect(r.errores.companeros).toBe(MENSAJES.companerosCantidad);
});

test('compañero sin nombre o sin foto marca su propio campo', () => {
  const r = validarInscripcion(
    base({ honra_companero: 'si', companeros: JSON.stringify([{ nombre: 'Luna' }, { nombre: '  ' }]) }),
    { versionPolitica: 'borrador', ordenesConFoto: new Set([2]) },
  );
  expect(r.errores).toEqual({
    companero_1_foto: MENSAJES.companeroFoto,
    companero_2_nombre: MENSAJES.companeroNombre,
  });
});

test('companeros con JSON inválido', () => {
  const r = validarInscripcion(base({ honra_companero: 'si', companeros: '{no' }), OPC);
  expect(r.errores.companeros).toBe(MENSAJES.companerosCantidad);
});

test('rama No ignora los compañeros enviados', () => {
  const r = validarInscripcion(base({ companeros: JSON.stringify([{ nombre: 'Luna' }]) }),
    { versionPolitica: 'borrador', ordenesConFoto: new Set([1]) });
  expect(r.ok).toBe(true);
  expect(r.datos.companeros).toEqual([]);
});

test('UTM: recorta a 255 y deja null lo ausente', () => {
  const r = validarInscripcion(base({ utm_source: 'facebook', utm_campaign: 'x'.repeat(300) }), OPC);
  expect(r.datos.utm).toEqual({
    utm_source: 'facebook', utm_medium: null, utm_campaign: 'x'.repeat(255), utm_content: null, fbclid: null,
  });
});
