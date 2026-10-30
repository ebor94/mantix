const { sedeDeConsulta } = require('../middleware/autenticacion');

const req = (porUsuario, query = {}) => ({ porUsuario, query });
const errorDe = (fn) => { try { fn(); return undefined; } catch (e) { return e; } };
const guarda = (sede_id) => ({ usuario: 'g', rol: 'guarda', sede_id });
const admin = (sede_id = null) => ({ usuario: 'a', rol: 'admin_porteria', sede_id });

test('el guarda siempre consulta su sede, aunque pida otra', () => {
  expect(sedeDeConsulta(req(guarda(3), { sede_id: '9' }))).toBe(3);
});

test('el guarda sin sede → 403 SEDE_REQUERIDA', () => {
  expect(errorDe(() => sedeDeConsulta(req(guarda(null)), { todasParaAdmin: true }))).toMatchObject({
    statusCode: 403, motivo: 'SEDE_REQUERIDA', message: 'Elige la sede de tu turno para continuar',
  });
});

test('el admin usa ?sede_id, luego la de su token, luego todas o 400', () => {
  expect(sedeDeConsulta(req(admin(2), { sede_id: '7' }))).toBe(7);
  expect(sedeDeConsulta(req(admin(2)))).toBe(2);
  expect(sedeDeConsulta(req(admin(), { sede_id: '' }), { todasParaAdmin: true })).toBeNull();
  expect(errorDe(() => sedeDeConsulta(req(admin())))).toMatchObject({ statusCode: 400, motivo: 'VALIDACION', message: 'Indica la sede' });
});

test.each(['abc', '0', '-1', '1.5', '1e1', '0x10', ' 5 ', '1234567890'])('?sede_id=%s → 400 Sede inválida', (valor) => {
  expect(errorDe(() => sedeDeConsulta(req(admin(), { sede_id: valor })))).toMatchObject({ statusCode: 400, message: 'Sede inválida' });
});

test.each([[['2']], [['2', '3']], [{ a: '2' }]])('?sede_id no string (%j) → 400 Sede inválida', (pedida) => {
  expect(errorDe(() => sedeDeConsulta(req(admin(), { sede_id: pedida })))).toMatchObject({ statusCode: 400, message: 'Sede inválida' });
});
