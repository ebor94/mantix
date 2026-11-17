const express = require('express');
const request = require('supertest');

// findByPk devuelve un usuario para que, con el código anterior, reset-password
// respondiera 200 (y no un 404 por "usuario no encontrado" que enmascare la prueba).
jest.mock('../src/sv/models', () => ({
  SvUsuario: {
    findAll: jest.fn(), create: jest.fn(), update: jest.fn(),
    findByPk: jest.fn(async () => ({ usr_id: 5, usr_area_id: 1, update: jest.fn() }))
  },
  SvRol: {}, SvArea: {}, SvGrupo: {}, SvPunto: {}
}));
jest.mock('../src/sv/middleware/svAuth', () => ({
  svAuth: (req, res, next) => {
    req.user = { usr_id: 1, usr_id_identidad: 77, usr_area_id: 1, rol: { rol_codigo: 'SUPER_ADMIN' } };
    next();
  }
}));
jest.mock('../src/sv/services/usuariosAd.service', () => ({
  resolverIdentidad: jest.fn(),
  adUsuariosPorIdentidad: jest.fn(async () => new Map([[77, 'agomez']]))
}));
jest.mock('../src/sv/services/directorioAd.service', () => ({ buscar: jest.fn() }));

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/sv/auth', require('../src/sv/routes/auth.routes'));
  a.use('/api/sv/usuarios', (req, res, next) => { req.user = { usr_id: 1, rol: { rol_codigo: 'SUPER_ADMIN' } }; next(); },
    require('../src/sv/routes/usuarios.routes'));
  a.use((err, req, res, next) => res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }));
  return a;
}

test.each([
  ['post', '/api/sv/auth/login'],
  ['post', '/api/sv/auth/refresh'],
  ['post', '/api/sv/auth/logout'],
  ['patch', '/api/sv/auth/me/password'],
  ['post', '/api/sv/usuarios/5/reset-password']
])('%s %s ya no existe', async (metodo, ruta) => {
  const r = await request(app())[metodo](ruta).send({ email: 'a@x.co', password: 'x', actual: 'x', nueva: 'yyyyyy' });
  expect(r.status).toBe(404);
});

test('GET /api/sv/auth/me sigue respondiendo con ad_usuario', async () => {
  const r = await request(app()).get('/api/sv/auth/me');
  expect(r.status).toBe(200);
  expect(r.body.data.ad_usuario).toBe('agomez');
});

test('GET /api/sv/auth/me: si falla la consulta responde 500 sin tumbar el proceso', async () => {
  const { adUsuariosPorIdentidad } = require('../src/sv/services/usuariosAd.service');
  adUsuariosPorIdentidad.mockRejectedValueOnce(new Error('DB caída'));
  const r = await request(app()).get('/api/sv/auth/me');
  expect(r.status).toBe(500);
}, 2000);
