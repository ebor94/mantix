const MasajesError = require('../utils/MasajesError');
const { E } = require('../utils/MasajesError');

test.each([
  ['NO_AUTENTICADO', 401], ['NO_BENEFICIARIO', 403], ['NO_ADMIN', 403], ['NO_ENCONTRADA', 404],
  ['SLOT_OCUPADO', 409], ['CUPO_MES_USADO', 409], ['SLOT_CON_CITA', 409], ['SEMANA_DUPLICADA', 409],
  ['FUERA_DE_VENTANA', 422], ['ANTICIPACION_INSUFICIENTE', 422], ['ESTADO_INVALIDO', 422], ['VALIDACION', 400],
])('%s → %i con mensaje en español', (motivo, status) => {
  const e = E[motivo]();
  expect(e).toBeInstanceOf(MasajesError);
  expect(e).toMatchObject({ motivo, statusCode: status, isOperational: true });
  expect(e.message.length).toBeGreaterThan(10);
});

test('cada llamada crea un error nuevo (no se comparte estado ni stack)', () => {
  expect(E.SLOT_OCUPADO()).not.toBe(E.SLOT_OCUPADO());
});

test('NO_BENEFICIARIO usa el texto exacto de la spec §9.4', () => {
  expect(E.NO_BENEFICIARIO().message).toBe('No estás en el listado de beneficiarios. Comunícate con Talento Humano.');
});

test('ANTICIPACION_INSUFICIENTE dice las horas configuradas, no un 24 fijo', () => {
  expect(E.ANTICIPACION_INSUFICIENTE().message).toMatch(/24 horas/);
  expect(E.ANTICIPACION_INSUFICIENTE(48).message).toMatch(/48 horas/);
  expect(E.ANTICIPACION_INSUFICIENTE(1).message).toMatch(/1 hora antes/);
});

test('NO_ENCONTRADA no revela si la cita existe pero es de otra persona', () => {
  expect(E.NO_ENCONTRADA().message).toBe('La cita no existe.');
});

test('VALIDACION lleva los detalles por campo', () => {
  expect(E.VALIDACION([{ campo: 'inicio', motivo: 'formato' }]).errors).toEqual([{ campo: 'inicio', motivo: 'formato' }]);
  expect(E.VALIDACION().errors).toBeUndefined();
});

test('el catálogo no se puede modificar en tiempo de ejecución', () => {
  expect(Object.isFrozen(E)).toBe(true);
});
