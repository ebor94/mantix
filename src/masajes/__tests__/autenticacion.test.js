const express = require('express');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAutenticacion, requiereRol, crearResolverBeneficiario, requiereBeneficiario } = require('../middleware/autenticacion');
const { masajesErrorHandler } = require('../middleware/errorHandler');
const { firmarToken, ROLES } = require('../services/auth.service');

afterEach(cerrarServidores);

const CFG = { jwtSecret: 'm'.repeat(40), jwtExpires: '8h' };
const token = (rol = ROLES.EMPLEADO, usuario = 'eortega') => firmarToken({ usuario, nombre: 'Edwin', rol }, CFG);

function app({ beneficiarios } = {}) {
  const a = express();
  const autenticar = crearAutenticacion(() => CFG);
  const resolver = crearResolverBeneficiario({ beneficiarios: beneficiarios || { obtenerActivoPorUsuario: async () => ({ id: 7, nombre: 'Edwin' }) } });
  a.get('/yo', autenticar, resolver, (req, res) => res.json({ usuario: req.msjUsuario, beneficiario: req.msjBeneficiario }));
  a.get('/empleado', autenticar, resolver, requiereBeneficiario, (req, res) => res.json({ ok: true }));
  a.get('/admin', autenticar, requiereRol(ROLES.ADMIN), (req, res) => res.json({ ok: true }));
  a.use(masajesErrorHandler);
  return a;
}

describe('autenticar', () => {
  test('Bearer válido → req.msjUsuario', async () => {
    const r = await request(await servir(app())).get('/yo').set('Authorization', `Bearer ${token()}`);
    expect(r.status).toBe(200);
    expect(r.body.usuario).toMatchObject({ usuario: 'eortega', rol: 'empleado' });
  });

  test.each([
    ['sin cabecera', undefined],
    ['sin "Bearer"', () => token()],
    ['"bearer" en minúscula con dos tokens', () => `Bearer ${token()} ${token()}`],
    ['Basic', () => 'Basic ZW9ydGVnYTp4'],
    ['vacío', () => 'Bearer '],
  ])('%s → 401 NO_AUTENTICADO', async (_, valor) => {
    let req = request(await servir(app())).get('/yo');
    if (valor) req = req.set('Authorization', valor());
    const r = await req;
    expect(r.status).toBe(401);
    expect(r.body.motivo).toBe('NO_AUTENTICADO');
  });

  test('el token va solo en la cabecera, nunca en la URL', async () => {
    const r = await request(await servir(app())).get(`/yo?token=${token()}`);
    expect(r.status).toBe(401);
  });
});

describe('requiereRol', () => {
  test('admin pasa; empleado → 403 NO_ADMIN', async () => {
    const s = await servir(app());
    expect((await request(s).get('/admin').set('Authorization', `Bearer ${token(ROLES.ADMIN)}`)).status).toBe(200);
    const r = await request(s).get('/admin').set('Authorization', `Bearer ${token()}`);
    expect(r.status).toBe(403);
    expect(r.body.motivo).toBe('NO_ADMIN');
  });
});

describe('resolverBeneficiario', () => {
  test('relee el beneficiario en CADA petición: desactivarlo surte efecto sin esperar a que venza el token', async () => {
    let activo = true;
    const beneficiarios = { obtenerActivoPorUsuario: jest.fn(async () => (activo ? { id: 7, nombre: 'Edwin' } : null)) };
    const s = await servir(app({ beneficiarios }));
    const t = token();
    expect((await request(s).get('/empleado').set('Authorization', `Bearer ${t}`)).status).toBe(200);
    activo = false;
    const r = await request(s).get('/empleado').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(403);
    expect(r.body.motivo).toBe('NO_BENEFICIARIO');
    expect(beneficiarios.obtenerActivoPorUsuario).toHaveBeenCalledTimes(2);
    expect(beneficiarios.obtenerActivoPorUsuario).toHaveBeenCalledWith('eortega');
  });

  test('admin que no es beneficiario: pasa con beneficiario null, pero no entra a rutas de empleado', async () => {
    const s = await servir(app({ beneficiarios: { obtenerActivoPorUsuario: async () => null } }));
    const yo = await request(s).get('/yo').set('Authorization', `Bearer ${token(ROLES.ADMIN)}`);
    expect(yo.body.beneficiario).toBeNull();
    expect((await request(s).get('/empleado').set('Authorization', `Bearer ${token(ROLES.ADMIN)}`)).status).toBe(403);
  });

  test('si la BD falla → 500 genérico, nunca deja pasar', async () => {
    const s = await servir(app({ beneficiarios: { obtenerActivoPorUsuario: async () => { throw new Error('ECONNREFUSED'); } } }));
    const r = await request(s).get('/empleado').set('Authorization', `Bearer ${token()}`);
    expect(r.status).toBe(500);
    expect(r.body.motivo).toBe('ERROR_INTERNO');
  });
});
