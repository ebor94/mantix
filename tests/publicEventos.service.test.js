const mockEv   = { findOne: jest.fn() };
const mockPool = { findOne: jest.fn(), create: jest.fn() };

jest.mock('../src/sv/models', () => ({
  SvEventoAgenda:       mockEv,
  SvEventoPoolRegistro: mockPool,
  SvEmpresa:            {}
}));

const svc = require('../src/sv/services/publicEventos.service');

beforeEach(() => jest.clearAllMocks());

describe('obtenerPorHash', () => {
  test('retorna null si el hash tiene formato inválido (no consulta la BD)', async () => {
    const r = await svc.obtenerPorHash('corto');
    expect(r).toBeNull();
    expect(mockEv.findOne).not.toHaveBeenCalled();
  });

  test('retorna null si no existe (o registros_publicos_habilitado=0, filtrado en el where)', async () => {
    mockEv.findOne.mockResolvedValue(null);
    const r = await svc.obtenerPorHash('a'.repeat(32));
    expect(r).toBeNull();
    expect(mockEv.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ evento_registros_publicos_habilitado: 1 })
    }));
  });

  test('retorna el model de evento activo cuando existe', async () => {
    const evento = { evento_id: 500, evento_titulo: 'Feria', empresa: null };
    mockEv.findOne.mockResolvedValue(evento);
    const r = await svc.obtenerPorHash('a'.repeat(32));
    expect(r).toBe(evento);
  });
});

describe('registrar', () => {
  test('NOT_FOUND si el hash es inválido o el evento no existe', async () => {
    mockEv.findOne.mockResolvedValue(null);
    await expect(svc.registrar('a'.repeat(32), { nombre: 'X', telefono: '3001111' }, {}))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('EVENTO_CERRADO si evento_fecha_fin ya pasó', async () => {
    mockEv.findOne.mockResolvedValue({
      evento_id: 500,
      evento_fecha_fin: new Date(Date.now() - 86400000)
    });
    await expect(svc.registrar('a'.repeat(32), { nombre: 'X', telefono: '3001111' }, {}))
      .rejects.toMatchObject({ code: 'EVENTO_CERRADO' });
  });

  test('dedup: mismo teléfono con formato distinto se detecta gracias a normalizar()', async () => {
    mockEv.findOne.mockResolvedValue({ evento_id: 500, evento_fecha_fin: null });
    mockPool.findOne.mockResolvedValue({ pool_id: 42 });

    const r = await svc.registrar('a'.repeat(32), { nombre: 'Ana', telefono: '+57 300 111 1111' }, {});

    expect(r).toEqual({ poolId: 42, dedup: true });
    // Debe consultar con el teléfono ya normalizado (sin +57, sin espacios)
    expect(mockPool.findOne).toHaveBeenCalledWith({
      where: { pool_evento_id: 500, pool_telefono: '3001111111' }
    });
    expect(mockPool.create).not.toHaveBeenCalled();
  });

  test('crea el registro con el teléfono normalizado cuando no hay duplicado', async () => {
    mockEv.findOne.mockResolvedValue({ evento_id: 500, evento_fecha_fin: null });
    mockPool.findOne.mockResolvedValue(null);
    mockPool.create.mockResolvedValue({ pool_id: 7 });

    const r = await svc.registrar('a'.repeat(32), { nombre: '  Ana  ', telefono: '300-111-1111' }, { ip: '1.2.3.4', userAgent: 'jest' });

    expect(r).toEqual({ poolId: 7, dedup: false });
    expect(mockPool.create).toHaveBeenCalledWith(expect.objectContaining({
      pool_evento_id: 500,
      pool_nombre:    'Ana',
      pool_telefono:  '3001111111'
    }));
  });

  test('race: create con SequelizeUniqueConstraintError → re-fetch + dedup', async () => {
    mockEv.findOne.mockResolvedValueOnce({ evento_id: 500, evento_link_hash: 'abc' });
    mockPool.findOne
      .mockResolvedValueOnce(null)              // primera comprobación
      .mockResolvedValueOnce({ pool_id: 99 });  // re-fetch tras race
    const err = new Error('dup');
    err.name = 'SequelizeUniqueConstraintError';
    mockPool.create.mockRejectedValue(err);

    const r = await svc.registrar('a'.repeat(32), { nombre: 'X', telefono: '3001111' }, {});

    expect(r).toEqual({ poolId: 99, dedup: true });
  });

  test('race: si el re-fetch tampoco encuentra nada, propaga el error original', async () => {
    mockEv.findOne.mockResolvedValueOnce({ evento_id: 500 });
    mockPool.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const err = new Error('dup');
    err.name = 'SequelizeUniqueConstraintError';
    mockPool.create.mockRejectedValue(err);

    await expect(svc.registrar('a'.repeat(32), { nombre: 'X', telefono: '3001111' }, {}))
      .rejects.toThrow('dup');
  });
});
