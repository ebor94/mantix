jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const logger = require('../src/utils/logger');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');

const REQ = { method: 'GET', baseUrl: '/api/sv/personas', path: '/buscar', originalUrl: '/api/sv/personas/buscar?telefono=3001234567' };

function ejecutar(err, { headersSent = false } = {}) {
  const res = { headersSent, status: jest.fn(() => res), json: jest.fn(() => res) };
  const next = jest.fn();
  svErrorHandler(err, REQ, res, next);
  return { res, next };
}

const error = (props, message = 'mensaje del error') => Object.assign(new Error(message), props);

beforeEach(() => jest.clearAllMocks());

describe('svErrorHandler', () => {
  test('tiene cuatro argumentos: Express lo reconoce como manejador de errores', () => {
    expect(svErrorHandler).toHaveLength(4);
  });

  test.each([
    ['VALIDATION_ERROR', 422], ['NOT_FOUND', 404], ['FORBIDDEN', 403], ['CONFLICT', 409],
    ['DUPLICATE', 409], ['DUPLICATE_PHONE', 409], ['DUPLICATE_NIT', 409], ['DUPLICATE_EMAIL', 409]
  ])('%s → %i con su código y su mensaje', (code, estado) => {
    const { res, next } = ejecutar(error({ code }));
    expect(res.status).toHaveBeenCalledWith(estado);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: code, message: 'mensaje del error' });
    expect(next).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test.each([
    ['SequelizeValidationError'], ['SequelizeUniqueConstraintError'], ['MulterError']
  ])('%s lo responde el manejador global', (name) => {
    const err = error({ name, code: 'LIMIT_FILE_SIZE' });
    const { res, next } = ejecutar(err);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  test.each([
    ['ER_DATA_TOO_LONG'], ['ER_BAD_NULL_ERROR'], ['ER_WARN_DATA_OUT_OF_RANGE'],
    ['WARN_DATA_TRUNCATED'], ['ER_TRUNCATED_WRONG_VALUE_FOR_FIELD']
  ])('SequelizeDatabaseError por un dato (%s) lo responde el manejador global', (codigoSql) => {
    const err = error({ name: 'SequelizeDatabaseError', parent: { code: codigoSql } });
    const { res, next } = ejecutar(err);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('un error con statusCode 4xx (URL mal formada) conserva su estado', () => {
    const err = error({ statusCode: 400 });
    const { res, next } = ejecutar(err);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  test.each([
    ['un error común', error({})],
    ['un error del sistema', error({ code: 'ECONNREFUSED' }, 'connect ECONNREFUSED 10.0.0.5:3306')],
    ['una caída de la base', error({ name: 'SequelizeConnectionError' }, 'connect ETIMEDOUT 10.0.0.5:3306')],
    ['un code que coincide con una propiedad heredada', error({ code: 'constructor' })],
    ['una columna que no existe', error({ name: 'SequelizeDatabaseError', parent: { code: 'ER_BAD_FIELD_ERROR' } }, "Unknown column 'x'")],
    ['un interbloqueo', error({ name: 'SequelizeDatabaseError', parent: { code: 'ER_LOCK_DEADLOCK' } }, 'Deadlock found')],
    ['un statusCode 5xx', error({ statusCode: 503 }, 'detalle interno')]
  ])('%s → 500 genérico, sin el texto interno', (_nombre, err) => {
    const { res, next } = ejecutar(err);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false, error: 'INTERNAL_ERROR', message: 'Error interno. Intenta de nuevo en unos minutos.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('el 500 anota el detalle en el log, sin la query', () => {
    ejecutar(error({}, 'detalle interno'));
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][1]).toEqual(expect.objectContaining({
      detalle: 'detalle interno', method: 'GET', path: '/api/sv/personas/buscar'
    }));
    expect(logger.error.mock.calls[0][1].stack).toContain('detalle interno');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('3001234567');
  });

  test('un motivo que no es Error también queda anotado', () => {
    const { res } = ejecutar('texto suelto');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(logger.error.mock.calls[0][1]).toEqual(expect.objectContaining({ detalle: 'texto suelto' }));
  });

  test('con la respuesta ya empezada lo pasa a next', () => {
    const err = error({ code: 'NOT_FOUND' });
    const { res, next } = ejecutar(err, { headersSent: true });
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
