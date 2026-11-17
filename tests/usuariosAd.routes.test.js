const express = require('express');
const request = require('supertest');

jest.mock('../src/sv/models', () => ({
  SvUsuario: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  SvRol: {}, SvArea: {}, SvGrupo: {}, SvPunto: {}
}));
jest.mock('../src/sv/services/directorioAd.service', () => ({ buscar: jest.fn() }));
jest.mock('../src/sv/services/usuariosAd.service', () => ({
  resolverIdentidad: jest.fn(),
  adUsuariosPorIdentidad: jest.fn(async () => new Map([[77, 'agomez']]))
}));

const { SvUsuario } = require('../src/sv/models');
const directorio = require('../src/sv/services/directorioAd.service');
const usuariosAd = require('../src/sv/services/usuariosAd.service');

function errorCon(code, message) { const e = new Error(message); e.code = code; return e; }

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => { req.user = { usr_id: 1, usr_area_id: 1, rol: { rol_codigo: 'SUPER_ADMIN' } }; next(); });
  a.use('/api/sv/usuarios', require('../src/sv/routes/usuarios.routes'));
  return a;
}

const BASE = {
  usr_rol_id: 4, usr_email: 'Ana@X.co', usr_nombre: 'Ana', usr_apellido: 'Gomez', ad_usuario: 'agomez'
};

beforeEach(() => jest.clearAllMocks());

describe('GET /directorio', () => {
  test('200 con resultados', async () => {
    directorio.buscar.mockResolvedValue([{ usuario: 'agomez', nombre: 'ANA GOMEZ', mail: 'ana@x.co' }]);
    const r = await request(app()).get('/api/sv/usuarios/directorio?q=ana');
    expect(r.status).toBe(200);
    expect(directorio.buscar).toHaveBeenCalledWith('ana');
    expect(r.body.data[0].usuario).toBe('agomez');
  });
  test('422 si la búsqueda es muy corta', async () => {
    directorio.buscar.mockRejectedValue(errorCon('VALIDATION_ERROR', 'Escribe al menos 3 caracteres'));
    expect((await request(app()).get('/api/sv/usuarios/directorio?q=an')).status).toBe(422);
  });
  test('503 si el AD no responde', async () => {
    directorio.buscar.mockRejectedValue(errorCon('AD_NO_DISPONIBLE', 'No hay conexión con el directorio activo, intenta en unos minutos.'));
    const r = await request(app()).get('/api/sv/usuarios/directorio?q=ana');
    expect(r.status).toBe(503);
    expect(r.body.message).toBe('No hay conexión con el directorio activo, intenta en unos minutos.');
  });
});

describe('POST /', () => {
  test('422 sin ad_usuario', async () => {
    const { ad_usuario, ...sinAd } = BASE;
    const r = await request(app()).post('/api/sv/usuarios').send({ ...sinAd, usr_password: 'secreta' });
    expect(r.status).toBe(422);
    expect(SvUsuario.create).not.toHaveBeenCalled();
  });

  test('201: crea el usuario enlazado a la identidad y sin clave', async () => {
    usuariosAd.resolverIdentidad.mockResolvedValue(77);
    SvUsuario.create.mockResolvedValue({ usr_id: 5 });
    SvUsuario.findByPk.mockResolvedValue({ usr_id: 5 });
    const r = await request(app()).post('/api/sv/usuarios').send(BASE);
    expect(r.status).toBe(201);
    expect(usuariosAd.resolverIdentidad).toHaveBeenCalledWith(expect.objectContaining({
      adUsuario: 'agomez', email: 'ana@x.co', permitirCambio: false
    }));
    const datos = SvUsuario.create.mock.calls[0][0];
    expect(datos.usr_id_identidad).toBe(77);
    expect(datos).not.toHaveProperty('usr_password_hash');
    expect(datos).not.toHaveProperty('ad_usuario');
  });

  test.each([
    ['AD_USUARIO_NO_EXISTE', 422],
    ['AD_USUARIO_INVALIDO', 422],
    ['AD_USUARIO_TOMADO', 409],
    ['CORREO_CON_OTRO_AD', 409]
  ])('%s → %i', async (code, status) => {
    usuariosAd.resolverIdentidad.mockRejectedValue(errorCon(code, `mensaje ${code}`));
    const r = await request(app()).post('/api/sv/usuarios').send(BASE);
    expect(r.status).toBe(status);
    expect(r.body.message).toBe(`mensaje ${code}`);
  });
});

describe('PUT /:id', () => {
  test('con ad_usuario: permite cambiar y guarda usr_id_identidad', async () => {
    const u = { usr_id: 5, usr_area_id: 1, usr_email: 'ana@x.co', usr_nombre: 'Ana', usr_apellido: 'G', usr_id_identidad: 77, update: jest.fn() };
    SvUsuario.findByPk.mockResolvedValue(u);
    usuariosAd.resolverIdentidad.mockResolvedValue(77);
    const r = await request(app()).put('/api/sv/usuarios/5').send({ ad_usuario: 'agomez' });
    expect(r.status).toBe(200);
    expect(usuariosAd.resolverIdentidad).toHaveBeenCalledWith(expect.objectContaining({
      adUsuario: 'agomez', idIdentidadActual: 77, permitirCambio: true
    }));
    expect(u.update).toHaveBeenCalledWith(expect.objectContaining({ usr_id_identidad: 77 }));
  });

  test('sin identidad: se resuelve como en el alta (no permite cambiar la cuenta)', async () => {
    const u = { usr_id: 6, usr_area_id: 1, usr_email: 'beto@x.co', usr_nombre: 'Beto', usr_apellido: 'R', usr_id_identidad: null, update: jest.fn() };
    SvUsuario.findByPk.mockResolvedValue(u);
    usuariosAd.resolverIdentidad.mockResolvedValue(88);
    const r = await request(app()).put('/api/sv/usuarios/6').send({ ad_usuario: 'brodriguez' });
    expect(r.status).toBe(200);
    expect(usuariosAd.resolverIdentidad).toHaveBeenCalledWith(expect.objectContaining({
      adUsuario: 'brodriguez', idIdentidadActual: null, permitirCambio: false
    }));
    expect(u.update).toHaveBeenCalledWith(expect.objectContaining({ usr_id_identidad: 88 }));
  });
});

describe('GET /', () => {
  test('incluye ad_usuario', async () => {
    SvUsuario.findAll.mockResolvedValue([
      { usr_id: 5, usr_id_identidad: 77, toJSON() { return { usr_id: 5, usr_id_identidad: 77 }; } },
      { usr_id: 6, usr_id_identidad: null, toJSON() { return { usr_id: 6, usr_id_identidad: null }; } }
    ]);
    const r = await request(app()).get('/api/sv/usuarios');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([
      { usr_id: 5, usr_id_identidad: 77, ad_usuario: 'agomez' },
      { usr_id: 6, usr_id_identidad: null, ad_usuario: null }
    ]);
  });
});
