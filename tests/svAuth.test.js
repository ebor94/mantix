// Secretos distintos y definidos antes de cargar svAuth (se leen al requerir el
// módulo): así el token viejo de ventas SÍ era válido con el código anterior.
process.env.IDENTIDAD_JWT_SECRET = 'secreto-identidad-test';
process.env.SV_JWT_SECRET        = 'secreto-sv-test';

jest.mock('../src/sv/models', () => ({
  SvUsuario: { findOne: jest.fn(), findByPk: jest.fn(async () => ({ usr_id: 5, usr_activo: 1 })) },
  SvRol: {}, SvArea: {}, SvGrupo: {}, SvPunto: {}
}));
jest.mock('../src/sv/utils/accesoCruzado', () => ({ enriquecerAccesoCruzado: jest.fn(async () => {}) }));

const jwt = require('jsonwebtoken');
const { SvUsuario } = require('../src/sv/models');
const { svAuth } = require('../src/sv/middleware/svAuth');

function correr(token) {
  const req = { header: () => (token ? `Bearer ${token}` : '') };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  const next = jest.fn();
  return svAuth(req, res, next).then(() => ({ req, res, next }));
}

beforeEach(() => jest.clearAllMocks());

test('token de identidad válido: resuelve el usuario por usr_id_identidad', async () => {
  SvUsuario.findOne.mockResolvedValue({ usr_id: 5, usr_activo: 1 });
  const token = jwt.sign({ kind: 'identidad', id_identidad: 77 }, 'secreto-identidad-test');
  const { req, next } = await correr(token);
  expect(SvUsuario.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { usr_id_identidad: 77 } }));
  expect(next).toHaveBeenCalled();
  expect(req.user.usr_id).toBe(5);
});

test('token viejo de ventas ({ usr_id }) ya no se acepta', async () => {
  const token = jwt.sign({ usr_id: 5 }, 'secreto-sv-test');
  const { res, next } = await correr(token);
  expect(SvUsuario.findByPk).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
  expect(res.statusCode).toBe(401);
});

test('sin token: 401', async () => {
  const { res } = await correr(null);
  expect(res.statusCode).toBe(401);
});
