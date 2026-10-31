// src/porteria/__tests__/motivosAdmin.test.js
const { leerMotivo } = require('../services/motivosAdmin.service');

const errorDe = (fn) => { try { fn(); return undefined; } catch (e) { return e; } };
const nuevo = { codigo: ' lavado_ext ', nombre: ' Lavado externo ', aplica_propio: true };

test('un motivo nuevo toma valores por defecto y normaliza el código', () => {
  expect(leerMotivo(nuevo, { nuevo: true })).toEqual({
    codigo: 'LAVADO_EXT', nombre: 'Lavado externo', descripcion: null,
    aplica_propio: true, aplica_proveedor_asistencia: false, aplica_proveedor: false,
    aplica_ingreso: true, aplica_salida: true, tipo_referencia: 'NINGUNA', referencia_obligatoria: false, orden: 0, activo: true,
  });
});

test('una edición solo trae lo que viene en el cuerpo', () => {
  expect(leerMotivo({ activo: false, orden: 15, descripcion: '' }, { nuevo: false })).toEqual({ activo: false, orden: 15, descripcion: null });
});

test.each([
  [{ ...nuevo, codigo: 'A' }, 'Código inválido (letras, números y _; de 2 a 40)'],
  [{ ...nuevo, codigo: 'CON ESPACIO' }, 'Código inválido (letras, números y _; de 2 a 40)'],
  [{ ...nuevo, nombre: '  ' }, 'Indica el nombre'],
  [{ ...nuevo, nombre: 'x'.repeat(101) }, 'El nombre es demasiado largo'],
  [{ ...nuevo, descripcion: 'x'.repeat(256) }, 'La descripción es demasiado larga'],
  [{ ...nuevo, aplica_proveedor: 'si' }, 'Valor inválido en aplica_proveedor'],
  [{ ...nuevo, tipo_referencia: 'FACTURA' }, 'Tipo de referencia inválido'],
  [{ ...nuevo, orden: 1.5 }, 'Orden inválido'],
  [{ ...nuevo, orden: 10000 }, 'Orden inválido'],
  [{ ...nuevo, aplica_propio: false }, 'Marca al menos un tipo de vehículo'],
  [{ ...nuevo, aplica_ingreso: false, aplica_salida: false }, 'Marca al menos un sentido'],
  [{ ...nuevo, referencia_obligatoria: true }, 'Un motivo sin referencia no puede exigirla'],
  [null, 'Datos inválidos'],
])('nuevo %j → 400 %s', (body, message) => {
  expect(errorDe(() => leerMotivo(body, { nuevo: true }))).toMatchObject({ statusCode: 400, motivo: 'VALIDACION', message });
});

test('en una edición el código no se cambia y debe haber cambios', () => {
  expect(errorDe(() => leerMotivo({ codigo: 'OTRO' }, { nuevo: false }))).toMatchObject({
    statusCode: 400, message: 'El código no se cambia: crea otro motivo',
  });
  expect(errorDe(() => leerMotivo({}, { nuevo: false }))).toMatchObject({ statusCode: 400, message: 'No hay cambios' });
});
