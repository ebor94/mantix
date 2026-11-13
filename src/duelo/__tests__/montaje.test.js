// Carga la app real de Mantix: montaje en /api/duelo/v1, 503 si falta configuración y exención
// del limitador global.
process.env.RATE_LIMIT_MAX_REQUESTS = '2';
const VARIABLES = ['DUELO_PANEL_USUARIO', 'DUELO_PANEL_CLAVE', 'DUELO_JWT_SECRET', 'DUELO_VERSION_POLITICA',
  'DUELO_CORREO_CANAL', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const logger = require('../../utils/logger');
const app = require('../../app');

afterEach(cerrarServidores);
afterEach(() => jest.restoreAllMocks());
beforeEach(() => { for (const v of VARIABLES) delete process.env[v]; });

const completas = () => Object.assign(process.env, {
  DB_HOST: '127.0.0.1', DB_PORT: '1', DB_USER: 'u', DB_PASSWORD: 'p',
  DUELO_PANEL_USUARIO: 'panel', DUELO_PANEL_CLAVE: 'c', DUELO_JWT_SECRET: 'd'.repeat(40), DUELO_VERSION_POLITICA: 'borrador',
});

test('sin configuración responde 503 DUELO_DESHABILITADO y Mantix sigue vivo', async () => {
  const aviso = jest.spyOn(logger, 'error').mockImplementation(() => {});
  const r = await request(await servir(app)).get('/api/duelo/v1/estado');
  expect(r.status).toBe(503);
  expect(r.body).toEqual({
    success: false, motivo: 'DUELO_DESHABILITADO',
    message: 'El formulario no está disponible en este momento. Inténtalo más tarde.',
  });
  expect(JSON.stringify(r.body)).not.toMatch(/DUELO_(PANEL|JWT|VERSION|CORREO|FOTOS)|DB_(HOST|USER|PASSWORD|NAME)/);
  expect(aviso).toHaveBeenCalledWith(expect.stringContaining('duelo deshabilitado'));
  expect((await request(await servir(app)).get('/api/ruta-mantix-inexistente')).status).toBe(404);
});

test('con configuración completa /estado responde sin tocar la base', async () => {
  completas();
  const r = await request(await servir(app)).get('/api/duelo/v1/estado');
  expect(r.status).toBe(200);
  expect(r.body.data).toEqual({ abiertas: true, versionPolitica: 'borrador' });
});

test('las rutas de duelo no consumen el limitador global de Mantix', async () => {
  completas();
  const servidor = await servir(app);
  for (let i = 0; i < 4; i += 1) {
    expect((await request(servidor).get('/api/duelo/v1/estado')).status).toBe(200);
  }
});
