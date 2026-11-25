jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/services/prospectos.service');

const express = require('express');
const request = require('supertest');
const prospectos = require('../src/sv/services/prospectos.service');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

// Arma el router igual que sv/routes/index.js: montar, capturar y al final el manejador.
function app() {
  const router = express.Router();
  router.use('/prospectos', require('../src/sv/routes/prospectos.routes'));
  capturarAsync(router);
  router.use(svErrorHandler);
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { usr_id: 1 }; req.scope = {}; next(); });
  a.use('/api/sv', router);
  return escuchar(a);
}

beforeEach(() => {
  jest.resetAllMocks();
  prospectos.obtenerCompleto.mockResolvedValue({ prosp_id: 900, prosp_asesor_id: 1 });
  prospectos.actualizarProductos.mockResolvedValue({ prosp_id: 900 });
});
afterEach(cerrarTodos);

const put = async (body) => request(await app()).put('/api/sv/prospectos/900/productos').send(body);

describe('PUT /prospectos/:id/productos', () => {
  test.each([
    ['productos que no es lista', { productos: 'abc' }],
    ['prod_id que no es número', { productos: [{ prod_id: 'abc' }] }],
    ['cuerpo sin productos', {}]
  ])('%s responde 422 y no toca los intereses', async (_n, body) => {
    const r = await put(body);
    expect(r.status).toBe(422);
    expect(prospectos.actualizarProductos).not.toHaveBeenCalled();
  });

  test('el cuerpo que envía GenFlow responde 200 y llega al servicio', async () => {
    const r = await put({ productos: [{ prod_id: 10, es_principal: true, nota: null }] });
    expect(r.status).toBe(200);
    expect(prospectos.actualizarProductos).toHaveBeenCalledWith(900, [{ prod_id: 10, es_principal: true, nota: null }]);
  });

  test('una lista vacía es válida: quita todos', async () => {
    const r = await put({ productos: [] });
    expect(r.status).toBe(200);
    expect(prospectos.actualizarProductos).toHaveBeenCalledWith(900, []);
  });

  test('un pp_precio_ofrecido dentro de un item no llega al servicio', async () => {
    await put({ productos: [{ prod_id: 10, pp_precio_ofrecido: 1 }] });
    const [, items] = prospectos.actualizarProductos.mock.calls[0];
    expect(items[0]).not.toHaveProperty('pp_precio_ofrecido');
  });
});
