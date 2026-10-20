const { permisosTrk, tienePermiso, nivelDatos } = require('../permisos');

const usuario = (permisos, extra = {}) => ({ es_super_admin: false, rol: { nombre: 'X', permisos }, ...extra });

test('lee permisos trk de objeto o de JSON en texto', () => {
  expect(permisosTrk(usuario({ trk: { calificar: true } }))).toEqual({ calificar: true });
  expect(permisosTrk(usuario('{"trk":{"cabina":true},"caja":{"x":true}}'))).toEqual({ cabina: true });
});

test('ignora permisos desconocidos o en falso', () => {
  expect(permisosTrk(usuario({ trk: { calificar: false, volar: true } }))).toEqual({});
});

test('super admin tiene todos los permisos TRK', () => {
  const p = permisosTrk(usuario(null, { es_super_admin: true }));
  expect(Object.keys(p).sort()).toEqual(['administrar', 'cabina', 'calificaciones_desbloquear', 'calificar', 'editar', 'exportar', 'importar', 'pasarela', 'publicar']);
});

test('tienePermiso y nivelDatos', () => {
  expect(tienePermiso(usuario({ trk: { pasarela: true } }), 'pasarela')).toBe(true);
  expect(tienePermiso(null, 'pasarela')).toBe(false);
  expect(nivelDatos(usuario({ trk: { cabina: true } }))).toBe('COMPLETO');
  expect(nivelDatos(usuario({ trk: { administrar: true } }))).toBe('COMPLETO');
  expect(nivelDatos(usuario({ trk: { calificar: true } }))).toBe('PUBLICO');
  expect(nivelDatos(usuario({ trk: { pasarela: true } }))).toBe('PUBLICO');
  expect(nivelDatos(null)).toBe('PUBLICO');
});
