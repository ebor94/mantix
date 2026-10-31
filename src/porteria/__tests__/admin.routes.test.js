// src/porteria/__tests__/admin.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const BASE = '/api/porteria/v1/admin';
const guarda = () => tokenDe();
const admin = () => tokenDe({ usuario: 'admin1', rol: 'admin_porteria' });
const enviar = async (prueba, metodo, ruta, token, cuerpo) => request(await servir(prueba.app))[metodo](`${BASE}${ruta}`)
  .set('Authorization', `Bearer ${token}`).send(cuerpo);
const ctx = (codigo) => ({ apiCodigo: codigo, ip: expect.any(String) });
const sesionAdmin = expect.objectContaining({ usuario: 'admin1', rol: 'admin_porteria' });

describe('motivos', () => {
  test.each([
    ['get', '/motivos', 'POR-ADM-001'],
    ['post', '/motivos', 'POR-ADM-002'],
    ['patch', '/motivos/3', 'POR-ADM-003'],
    ['delete', '/motivos/3', 'POR-ADM-004'],
  ])('%s %s: solo el admin', async (metodo, ruta, codigo) => {
    const prueba = crearAppPrueba();
    const r = await enviar(prueba, metodo, ruta, guarda(), {});
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: codigo, motivo: 'SIN_PERMISO' });
  });

  test('listar', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.motivosAdmin.listar.mockResolvedValue([{ id: 1, codigo: 'LAVADO' }]);
    const r = await enviar(prueba, 'get', '/motivos', admin());
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: [{ id: 1, codigo: 'LAVADO' }] });
  });

  test('crear → 201 con el cuerpo, la sesión y el contexto', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.motivosAdmin.crear.mockResolvedValue({ id: 9, codigo: 'NUEVO' });
    const cuerpo = { codigo: 'NUEVO', nombre: 'Nuevo', aplica_propio: true };
    const r = await enviar(prueba, 'post', '/motivos', admin(), cuerpo);
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ id: 9, codigo: 'NUEVO' });
    expect(prueba.deps.motivosAdmin.crear).toHaveBeenCalledWith(cuerpo, sesionAdmin, ctx('POR-ADM-002'));
  });

  test('editar y borrar reciben el id numérico; un id inválido → 404 sin llamar al servicio', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.motivosAdmin.actualizar.mockResolvedValue({ id: 3, activo: false });
    prueba.deps.motivosAdmin.eliminar.mockResolvedValue({ id: 4 });
    expect((await enviar(prueba, 'patch', '/motivos/3', admin(), { activo: false })).body.data).toEqual({ id: 3, activo: false });
    expect(prueba.deps.motivosAdmin.actualizar).toHaveBeenCalledWith(3, { activo: false }, sesionAdmin, ctx('POR-ADM-003'));
    expect((await enviar(prueba, 'delete', '/motivos/4', admin())).body.data).toEqual({ id: 4 });
    expect(prueba.deps.motivosAdmin.eliminar).toHaveBeenCalledWith(4, sesionAdmin, ctx('POR-ADM-004'));
    for (const malo of ['0', 'abc', '1e3']) {
      const r = await enviar(prueba, 'patch', `/motivos/${malo}`, admin(), { activo: false });
      expect(r.status).toBe(404);
      expect(r.body).toMatchObject({ motivo: 'NO_ENCONTRADO', message: 'El motivo no existe' });
    }
    expect(prueba.deps.motivosAdmin.actualizar).toHaveBeenCalledTimes(1);
  });
});
