const express = require('express');
const request = require('supertest');

jest.mock('../src/identity/services/identidad.service', () => ({
  login: jest.fn(), refresh: jest.fn(), logout: jest.fn(), publicIdentidad: jest.fn()
}));
jest.mock('../src/identity/controllers/aplicaciones.controller', () => ({
  listarParaIdentidad: jest.fn((req, res) => res.json({})),
  listarAdmin:         jest.fn((req, res) => res.json({})),
  crear:               jest.fn((req, res) => res.json({})),
  actualizar:          jest.fn((req, res) => res.json({})),
  eliminar:            jest.fn((req, res) => res.json({}))
}));
jest.mock('../src/identity/middleware/verifyIdentidad', () => ({
  verifyIdentidad: (req, res, next) => { req.identidad = { id_identidad: 1 }; next(); }
}));

const svc = require('../src/identity/services/identidad.service');
const { claveUsuario } = require('../src/identity/middleware/limitadoresLogin');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/identidad', require('../src/identity/routes'));
  a.use((err, req, res, next) => res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }));
  return a;
}

function errorCon(code, message) { const e = new Error(message); e.code = code; return e; }

beforeEach(() => jest.clearAllMocks());

describe('POST /api/identidad/login', () => {
  test('200 con tokens', async () => {
    svc.login.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', identidad: { id_identidad: 1 } });
    const r = await request(app()).post('/api/identidad/login').send({ usuario: 'ok1', password: 'x' });
    expect(r.status).toBe(200);
    expect(r.body.data.accessToken).toBe('a');
    expect(svc.login).toHaveBeenCalledWith(expect.objectContaining({ usuario: 'ok1', password: 'x' }));
  });

  test('acepta email en el body por compatibilidad', async () => {
    svc.login.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', identidad: {} });
    await request(app()).post('/api/identidad/login').send({ email: 'p@x.co', password: 'x' });
    expect(svc.login).toHaveBeenCalledWith(expect.objectContaining({ usuario: 'p@x.co' }));
  });

  test.each([
    ['VALIDATION_ERROR', 422],
    ['CREDENCIALES_INVALIDAS', 401],
    ['NO_VINCULADO', 401],
    ['SIN_ACCESO', 403],
    ['USER_INACTIVE', 403],
    ['AD_NO_DISPONIBLE', 503]
  ])('%s → %i con el mensaje del servicio', async (code, status) => {
    svc.login.mockRejectedValue(errorCon(code, `mensaje ${code}`));
    const r = await request(app()).post('/api/identidad/login').send({ usuario: `map-${code}`, password: 'x' });
    expect(r.status).toBe(status);
    expect(r.body).toMatchObject({ success: false, error: code, message: `mensaje ${code}` });
  });

  test('al 6.º fallo del mismo usuario responde 429; otro usuario sigue entrando', async () => {
    svc.login.mockRejectedValue(errorCon('CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos'));
    const a = app();
    for (let i = 0; i < 5; i++) {
      const r = await request(a).post('/api/identidad/login').send({ usuario: 'ana', password: 'mal' });
      expect(r.status).toBe(401);
    }
    const sexto = await request(a).post('/api/identidad/login').send({ usuario: 'OLIVOS\\Ana', password: 'mal' });
    expect(sexto.status).toBe(429);
    expect(sexto.body.message).toBe('Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.');

    const otro = await request(a).post('/api/identidad/login').send({ usuario: 'beto', password: 'mal' });
    expect(otro.status).toBe(401);
  });

  test('error inesperado se reenvía al manejador global (500, no cuelga)', async () => {
    svc.login.mockRejectedValue(new Error('DB caída'));
    const r = await request(app()).post('/api/identidad/login').send({ usuario: 'err-login', password: 'x' });
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('INTERNAL_ERROR');
  }, 2000);

  test('los 503 no cuentan para el límite', async () => {
    svc.login.mockRejectedValue(errorCon('AD_NO_DISPONIBLE', 'sin AD'));
    const a = app();
    for (let i = 0; i < 7; i++) {
      const r = await request(a).post('/api/identidad/login').send({ usuario: 'carla', password: 'x' });
      expect(r.status).toBe(503);
    }
  });
});

describe('POST /api/identidad/refresh', () => {
  test('error inesperado se reenvía al manejador global (500, no cuelga)', async () => {
    svc.refresh.mockRejectedValue(new Error('DB caída'));
    const r = await request(app()).post('/api/identidad/refresh').send({ refreshToken: 'r' });
    expect(r.status).toBe(500);
  }, 2000);
});

describe('rutas retiradas', () => {
  test('POST /cambiar-password ya no existe', async () => {
    const r = await request(app()).post('/api/identidad/cambiar-password').send({ nueva: 'x' });
    expect(r.status).toBe(404);
  });
});

describe('claveUsuario', () => {
  test.each([
    [{ usuario: 'PSantafe' }, 'psantafe'],
    [{ usuario: 'OLIVOS\\psantafe' }, 'psantafe'],
    [{ email: 'PSantafe@LosOlivos.co' }, 'psantafe'],
    [{}, '']
  ])('%p → %p', (body, esperado) => {
    expect(claveUsuario(body)).toBe(esperado);
  });
});
