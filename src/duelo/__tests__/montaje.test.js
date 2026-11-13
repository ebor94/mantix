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

describe('cuerpos JSON en /api/duelo (parser propio de 10 KB)', () => {
  const PERSONAL = '1090000001';
  const registros = () => JSON.stringify([
    ...logger.error.mock.calls, ...logger.warn.mock.calls, ...console.error.mock.calls,
  ]);
  beforeEach(() => {
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('JSON mal formado: 400 con el contrato del módulo y sin registrar el cuerpo', async () => {
    completas();
    const r = await request(await servir(app)).post('/api/duelo/v1/panel/login')
      .set('Content-Type', 'application/json').send(`{"usuario": "${PERSONAL}",`);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ success: false, motivo: 'JSON_INVALIDO', message: 'No pudimos leer la solicitud.' });
    expect(registros()).not.toContain(PERSONAL);
  });

  test('JSON de más de 10 KB: 413 con el contrato del módulo', async () => {
    completas();
    const r = await request(await servir(app)).post('/api/duelo/v1/panel/login')
      .set('Content-Type', 'application/json').send(JSON.stringify({ usuario: PERSONAL, relleno: 'x'.repeat(11 * 1024) }));
    expect(r.status).toBe(413);
    expect(r.body).toEqual({ success: false, motivo: 'CUERPO_GRANDE', message: 'La solicitud es demasiado grande.' });
    expect(registros()).not.toContain(PERSONAL);
  });

  test('multipart no pasa por estos parsers: la inscripción llega al router (aquí, 403 por origen)', async () => {
    completas();
    const r = await request(await servir(app)).post('/api/duelo/v1/inscripciones')
      .field('nombre_completo', 'x'.repeat(12 * 1024));
    expect(r.status).toBe(403);
    expect(r.body.motivo).toBe('ORIGEN');
  });

  test('también aplica cuando el módulo está deshabilitado (el parser va antes del router)', async () => {
    const r = await request(await servir(app)).post('/api/duelo/v1/panel/login')
      .set('Content-Type', 'application/json').send('{malo');
    expect(r.status).toBe(400);
    expect(r.body.motivo).toBe('JSON_INVALIDO');
  });
});
