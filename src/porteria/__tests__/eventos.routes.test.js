// src/porteria/__tests__/eventos.routes.test.js
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const BASE = '/api/porteria/v1/eventos';
const guardaConSede = () => tokenDe({ sede: { id: 3, nombre: 'Norte' } });
const adminSinSede = () => tokenDe({ usuario: 'admin1', rol: 'admin_porteria' });

async function llamar(metodo, ruta, { token = guardaConSede(), cuerpo, prueba = crearAppPrueba() } = {}) {
  let r = request(await servir(prueba.app))[metodo](`${BASE}${ruta}`).set('Authorization', `Bearer ${token}`);
  if (cuerpo !== undefined) r = r.send(cuerpo);
  return { res: await r, deps: prueba.deps };
}

describe('POST /eventos', () => {
  test('exige sede de turno', async () => {
    const { res } = await llamar('post', '', { token: tokenDe(), cuerpo: {} });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'POR-EVT-001', motivo: 'SEDE_REQUERIDA' });
  });

  test('registra con la sesión y el contexto', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.eventos.registrar.mockResolvedValue({ id: 9, placa: 'ABC123' });
    const { res } = await llamar('post', '', { cuerpo: { sentido: 'INGRESO', placa: 'ABC123' }, prueba });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { id: 9, placa: 'ABC123' } });
    expect(prueba.deps.eventos.registrar).toHaveBeenCalledWith(
      { sentido: 'INGRESO', placa: 'ABC123' },
      expect.objectContaining({ usuario: 'guarda1', rol: 'guarda', sede_id: 3 }),
      { ip: expect.any(String), apiCodigo: 'POR-EVT-001' },
    );
  });

  test('los errores del servicio salen con el contrato', async () => {
    const PorteriaError = require('../utils/PorteriaError');
    const prueba = crearAppPrueba();
    prueba.deps.eventos.registrar.mockRejectedValue(new PorteriaError(409, 'SENTIDO_INCOHERENTE', 'Figura dentro', { estado: { dentro: true } }));
    const { res } = await llamar('post', '', { cuerpo: {}, prueba });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: 'POR-EVT-001', motivo: 'SENTIDO_INCOHERENTE', message: 'Figura dentro', errors: { estado: { dentro: true } } });
  });
});

describe('GET /eventos', () => {
  test('el guarda siempre lista su sede', async () => {
    const prueba = crearAppPrueba();
    await llamar('get', '?sede_id=99&placa=abc-1&desde=2026-10-01&inconsistente=1', { prueba });
    expect(prueba.deps.eventos.listar).toHaveBeenCalledWith(
      { sedeId: 3, desde: '2026-10-01', hasta: undefined, placa: 'ABC1', tipoVehiculo: undefined, motivoId: undefined, inconsistente: true },
      { pagina: 1 },
    );
  });

  test('el admin sin sede ve todas; con ?sede_id una', async () => {
    const prueba = crearAppPrueba();
    await llamar('get', '?pagina=2', { token: adminSinSede(), prueba });
    expect(prueba.deps.eventos.listar).toHaveBeenLastCalledWith(expect.objectContaining({ sedeId: null }), { pagina: 2 });
    await llamar('get', '?sede_id=5&inconsistente=0', { token: adminSinSede(), prueba });
    expect(prueba.deps.eventos.listar).toHaveBeenLastCalledWith(expect.objectContaining({ sedeId: 5, inconsistente: false }), { pagina: 1 });
  });

  test.each([
    ['?desde=30-10-2026', 'Fecha inválida (usa AAAA-MM-DD)'],
    ['?tipo_vehiculo=CAMION', 'Tipo de vehículo inválido'],
    ['?motivo_id=x', 'Motivo inválido'],
    ['?pagina=0', 'Página inválida'],
    ['?pagina=1e21', 'Página inválida'],
    ['?pagina=0x10', 'Página inválida'],
    ['?pagina=1e1', 'Página inválida'],
    ['?pagina=-1', 'Página inválida'],
    ['?pagina=%205%20', 'Página inválida'],
    ['?pagina=1234567890', 'Página inválida'],
    ['?pagina[]=2', 'Página inválida'],
    ['?pagina[a]=2', 'Página inválida'],
    ['?motivo_id=1e1', 'Motivo inválido'],
    ['?motivo_id[]=2', 'Motivo inválido'],
    ['?desde=2026-02-31', 'Fecha inválida (usa AAAA-MM-DD)'],
    ['?hasta=2026-13-01', 'Fecha inválida (usa AAAA-MM-DD)'],
    ['?desde=2026-02-29', 'Fecha inválida (usa AAAA-MM-DD)'],
    ['?desde=2026-10-31&hasta=2026-10-01', 'La fecha inicial es posterior a la final'],
    ['?placa[]=x', 'Placa inválida'],
    ['?placa[a]=x', 'Placa inválida'],
  ])('%s → 400', async (query, message) => {
    const { res } = await llamar('get', query);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'POR-EVT-002', motivo: 'VALIDACION', message });
  });
});

describe('GET /eventos (casos límite)', () => {
  test('fecha bisiesta válida y rango ordenado se aceptan', async () => {
    const prueba = crearAppPrueba();
    const { res } = await llamar('get', '?desde=2028-02-29&hasta=2028-02-29&pagina=3', { prueba });
    expect(res.status).toBe(200);
    expect(prueba.deps.eventos.listar).toHaveBeenCalledWith(expect.objectContaining({ desde: '2028-02-29', hasta: '2028-02-29' }), { pagina: 3 });
  });

  test('guarda sin sede → 403 SEDE_REQUERIDA', async () => {
    const { res } = await llamar('get', '', { token: tokenDe() });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'POR-EVT-002', motivo: 'SEDE_REQUERIDA' });
  });
});

describe('GET /eventos/:id', () => {
  test('el guarda no ve eventos de otra sede', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.eventos.obtener.mockResolvedValue({ id: 4, sede_id: 8 });
    const { res } = await llamar('get', '/4', { prueba });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'POR-EVT-003', motivo: 'NO_ENCONTRADO', message: 'El registro no existe' });
  });

  test('evento de su sede; id inválido → 404', async () => {
    const prueba = crearAppPrueba();
    prueba.deps.eventos.obtener.mockResolvedValue({ id: 4, sede_id: 3 });
    expect((await llamar('get', '/4', { prueba })).res.body.data).toEqual({ id: 4, sede_id: 3 });
    expect(prueba.deps.eventos.obtener).toHaveBeenCalledWith(4);
    expect((await llamar('get', '/abc')).res.status).toBe(404);
  });
});

test('PATCH y anular delegan en el servicio', async () => {
  const prueba = crearAppPrueba();
  prueba.deps.eventos.corregir.mockResolvedValue({ id: 5, kilometraje: 2 });
  prueba.deps.eventos.anular.mockResolvedValue({ id: 5, anulado: true });
  const corregir = await llamar('patch', '/5', { cuerpo: { kilometraje: 2 }, prueba });
  expect(corregir.res.body.data).toEqual({ id: 5, kilometraje: 2 });
  expect(prueba.deps.eventos.corregir).toHaveBeenCalledWith(5, { kilometraje: 2 }, expect.objectContaining({ usuario: 'guarda1' }), { ip: expect.any(String), apiCodigo: 'POR-EVT-004' });
  const anular = await llamar('post', '/5/anular', { cuerpo: { motivo: 'error' }, prueba });
  expect(anular.res.body.data).toEqual({ id: 5, anulado: true });
  expect(prueba.deps.eventos.anular).toHaveBeenCalledWith(5, { motivo: 'error' }, expect.objectContaining({ usuario: 'guarda1' }), { ip: expect.any(String), apiCodigo: 'POR-EVT-005' });
});

test('un SIN_PERMISO de eventos.anular sale con POR-EVT-005', async () => {
  const PorteriaError = require('../utils/PorteriaError');
  const prueba = crearAppPrueba();
  prueba.deps.eventos.anular.mockRejectedValue(new PorteriaError(403, 'SIN_PERMISO', 'Solo el admin anula'));
  const { res } = await llamar('post', '/5/anular', { cuerpo: { motivo: 'x' }, prueba });
  expect(res.status).toBe(403);
  expect(res.body).toMatchObject({ error: 'POR-EVT-005', motivo: 'SIN_PERMISO', message: 'Solo el admin anula' });
});
