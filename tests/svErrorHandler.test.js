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
    ['SequelizeValidationError'], ['SequelizeUniqueConstraintError'], ['SequelizeDatabaseError'], ['MulterError']
  ])('%s lo responde el manejador global', (name) => {
    const err = error({ name, code: 'LIMIT_FILE_SIZE' });
    const { res, next } = ejecutar(err);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  test.each([
    ['un error común', error({})],
    ['un error del sistema', error({ code: 'ECONNREFUSED' }, 'connect ECONNREFUSED 10.0.0.5:3306')],
    ['una caída de la base', error({ name: 'SequelizeConnectionError' }, 'connect ETIMEDOUT 10.0.0.5:3306')],
    ['un code que coincide con una propiedad heredada', error({ code: 'constructor' })]
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
      message: 'detalle interno', method: 'GET', path: '/api/sv/personas/buscar'
    }));
    expect(logger.error.mock.calls[0][1].stack).toContain('detalle interno');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('3001234567');
  });

  test('con la respuesta ya empezada lo pasa a next', () => {
    const err = error({ code: 'NOT_FOUND' });
    const { res, next } = ejecutar(err, { headersSent: true });
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
