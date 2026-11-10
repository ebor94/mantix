const { mapDuplicado } = require('../services/citas.service');

const dup = (k) => ({ code: 'ER_DUP_ENTRY', sqlMessage: `Duplicate entry 'x' for key 'msj_citas.${k}'` });

test('cupo_key → CUPO_MES_USADO; slot_key → SLOT_OCUPADO', () => {
  expect(mapDuplicado(dup('uq_msj_citas_cupo_key')).motivo).toBe('CUPO_MES_USADO');
  expect(mapDuplicado(dup('uq_msj_citas_slot_key')).motivo).toBe('SLOT_OCUPADO');
});

test('un duplicado de otro índice no se disfraza: se propaga tal cual y termina en 500', () => {
  const otro = dup('uq_msj_notificaciones_clave');
  expect(mapDuplicado(otro)).toBe(otro);
});

test('errores que no son de duplicado se propagan tal cual', () => {
  const e = new Error('x');
  expect(mapDuplicado(e)).toBe(e);
  expect(mapDuplicado(undefined)).toBeUndefined();
});
