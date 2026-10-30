jest.mock('mysql2/promise', () => ({ createPool: jest.fn() }));
const mysql = require('mysql2/promise');
const { crearBdPerezosa } = require('../db');

beforeEach(() => mysql.createPool.mockReset());

test('no lee la configuración ni crea el pool hasta el primer uso', async () => {
  const query = jest.fn().mockResolvedValue([[{ 1: 1 }]]);
  mysql.createPool.mockReturnValue({ query, end: jest.fn().mockResolvedValue() });
  const cfgFn = jest.fn(() => ({ host: 'h', port: 1, user: 'u', password: 'p', database: 'd' }));

  const bd = crearBdPerezosa(cfgFn);
  expect(cfgFn).not.toHaveBeenCalled();

  await bd.ping();
  await bd.ping();
  expect(cfgFn).toHaveBeenCalledTimes(1);
  expect(mysql.createPool).toHaveBeenCalledTimes(1);
  expect(mysql.createPool.mock.calls[0][0]).toMatchObject({ timezone: '-05:00', charset: 'utf8mb4', host: 'h' });
  expect(query).toHaveBeenCalledWith('SELECT 1');
});

test('cerrar libera el pool y el siguiente uso crea uno nuevo', async () => {
  const end = jest.fn().mockResolvedValue();
  mysql.createPool.mockReturnValue({ query: jest.fn().mockResolvedValue([[]]), end });
  const bd = crearBdPerezosa(() => ({}));
  bd.obtener();
  await bd.cerrar();
  expect(end).toHaveBeenCalledTimes(1);
  bd.obtener();
  expect(mysql.createPool).toHaveBeenCalledTimes(2);
});
