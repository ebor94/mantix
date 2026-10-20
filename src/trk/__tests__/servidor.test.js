// M8: un fallo al adjuntar Socket.IO de TRK se registra y Mantix sigue arrancando (listen).
const mockListen = jest.fn((puerto, cb) => cb && cb());
jest.mock('http', () => ({ createServer: jest.fn(() => ({ listen: mockListen })) }));
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../../app', () => ({}));
jest.mock('../../models', () => ({ sequelize: { authenticate: () => Promise.resolve(), sync: () => Promise.resolve() } }));
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../services/cronService', () => ({ start: jest.fn() }));
jest.mock('../../sv/jobs/snapshotDiario.job', () => ({ start: jest.fn() }));
jest.mock('../../sv/jobs/tracking.job', () => ({ start: jest.fn() }));
jest.mock('../../sv/jobs/renovaciones.job', () => ({ start: jest.fn() }));
jest.mock('../../sv/jobs/otpCleanup.job', () => ({ start: jest.fn() }));
jest.mock('../sockets', () => ({ attach: jest.fn(() => { throw new Error('socket.io roto'); }) }));

// server.js registra manejadores globales con process.exit: quitarlos al terminar.
const EVENTOS = ['unhandledRejection', 'uncaughtException'];
const previos = Object.fromEntries(EVENTOS.map((e) => [e, process.listeners(e)]));
afterAll(() => {
  for (const e of EVENTOS) for (const l of process.listeners(e)) if (!previos[e].includes(l)) process.off(e, l);
});

test('M8: si attach() lanza, se registra el error y el servidor HTTP igual escucha', async () => {
  const salir = jest.spyOn(process, 'exit').mockImplementation(() => {});
  const logger = require('../../utils/logger');
  require('../../../server');
  await new Promise((r) => setTimeout(r, 50));
  expect(mockListen).toHaveBeenCalled();
  expect(salir).not.toHaveBeenCalled();
  expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('TRIKIPELUDOS'), expect.anything());
  salir.mockRestore();
});
