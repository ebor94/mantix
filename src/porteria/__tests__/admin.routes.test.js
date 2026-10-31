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

describe('reporte de movimientos', () => {
  const PorteriaError = require('../utils/PorteriaError');
  const RUTA = '/reportes/movimientos.xlsx';
  const binario = (res, cb) => {
    const partes = [];
    res.on('data', (p) => partes.push(p));
    res.on('end', () => cb(null, Buffer.concat(partes)));
  };
  const descargar = async (prueba, query, token = admin()) => request(await servir(prueba.app))
    .get(`${BASE}${RUTA}`).query(query).set('Authorization', `Bearer ${token}`).buffer(true).parse(binario);

  test('solo el admin', async () => {
    const r = await descargar(crearAppPrueba(), {}, guarda());
    expect(r.status).toBe(403);
    expect(JSON.parse(r.body.toString())).toMatchObject({ error: 'POR-ADM-005', motivo: 'SIN_PERMISO' });
  });

  test('descarga el Excel con los filtros de /eventos y todas las sedes', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.reportes.movimientos.mockResolvedValue([]);
    const r = await descargar(prueba, { sede_id: 'todas', desde: '2026-10-01', hasta: '2026-10-31', placa: 'abc-1', inconsistente: '1' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(r.headers['content-disposition']).toBe('attachment; filename="movimientos_2026-10-01_2026-10-31.xlsx"');
    expect(r.body.subarray(0, 2).toString()).toBe('PK');
    expect(prueba.deps.reportes.movimientos).toHaveBeenCalledWith({
      sedeId: null, desde: '2026-10-01', hasta: '2026-10-31', placa: 'ABC1', tipoVehiculo: undefined, motivoId: undefined, inconsistente: true,
    });
  });

  test('sin fechas el nombre lo dice; un filtro inválido → 400; el tope → 413', async () => {
    const prueba = crearAppPrueba();
    expect((await descargar(prueba, { sede_id: '7' })).headers['content-disposition'])
      .toBe('attachment; filename="movimientos_inicio_hoy.xlsx"');
    expect(prueba.deps.reportes.movimientos).toHaveBeenLastCalledWith(expect.objectContaining({ sedeId: 7 }));
    const malo = await descargar(prueba, { desde: '2026-13-01' });
    expect(malo.status).toBe(400);
    prueba.deps.reportes.movimientos.mockRejectedValue(new PorteriaError(413, 'DEMASIADOS_REGISTROS', 'El reporte supera 50000 movimientos. Acota las fechas o los filtros.'));
    const grande = await descargar(prueba, {});
    expect(grande.status).toBe(413);
    expect(JSON.parse(grande.body.toString())).toMatchObject({ error: 'POR-ADM-005', motivo: 'DEMASIADOS_REGISTROS' });
  });
});
