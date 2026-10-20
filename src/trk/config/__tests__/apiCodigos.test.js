const registro = require('../apiCodigos');
const { MODULOS_API } = require('../constantes');
const { modulos } = require('../../routes');

function rutasDeclaradas() {
  const salida = [];
  for (const { prefijo, router } of modulos) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const ruta = prefijo + (layer.route.path === '/' ? '' : layer.route.path);
      for (const metodo of Object.keys(layer.route.methods)) {
        salida.push({ metodo: metodo.toUpperCase(), ruta, codigo: layer.route.stack[0].handle.trkApiCodigo });
      }
    }
  }
  return salida;
}

test('formato TRK-<MÓDULO>-<NNN> con módulo conocido', () => {
  const patron = new RegExp(`^TRK-(${MODULOS_API.join('|')})-\\d{3}$`);
  for (const codigo of Object.keys(registro)) expect(codigo).toMatch(patron);
});

test('toda ruta TRK tiene apiCodigo como primer middleware', () => {
  for (const r of rutasDeclaradas()) expect({ ...r, codigo: r.codigo || null }).toEqual({ ...r, codigo: expect.any(String) });
});

test('cada ruta coincide con su entrada del registro (§9.1)', () => {
  for (const r of rutasDeclaradas()) {
    expect(registro[r.codigo]).toBeDefined();
    expect({ codigo: r.codigo, metodo: registro[r.codigo].metodo, ruta: registro[r.codigo].ruta })
      .toEqual({ codigo: r.codigo, metodo: r.metodo, ruta: r.ruta });
  }
});

test('no hay códigos registrados sin ruta ni códigos usados dos veces', () => {
  const usados = rutasDeclaradas().map((r) => r.codigo);
  expect(new Set(usados).size).toBe(usados.length);
  expect([...usados].sort()).toEqual(Object.keys(registro).sort());
});
