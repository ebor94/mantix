/**
 * Jornada diaria: una por día, cierre automático a las 6 p. m. y solo del dueño.
 * Sin base de datos: modelos simulados.
 */
const mockJornada  = { findOne: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn() };
const mockAusencia = { findOne: jest.fn() };
const mockPunto    = { findAll: jest.fn(), findOne: jest.fn(), bulkCreate: jest.fn() };
const mockUsuario  = { findByPk: jest.fn() };

jest.mock('../src/sv/models', () => ({
  sequelize: {},
  SvJornada: mockJornada,
  SvJornadaAusencia: mockAusencia,
  SvTrackingPunto: mockPunto,
  SvUsuario: mockUsuario,
  SvGestion: {}, SvProspecto: {}, SvPersona: {}
}));

jest.mock('../src/utils/logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));
const logger = require('../src/utils/logger');
const svc = require('../src/sv/services/tracking.service');
svc.__diaDe = require('../src/sv/utils/fechas').diaBogotaISO;

// 8:30 p. m. del 25-nov-2026 en Colombia (ya es 26 en UTC)
const AHORA_NOCHE = '2026-11-26T01:30:00Z';

function jornada(extra = {}) {
  const j = {
    jor_id: 'j1', jor_usr_id: 10, jor_estado: 'activa',
    jor_fecha: new Date('2026-11-24T05:00:00Z'),      // typeCast: DATEONLY llega como Date a las 05:00Z
    jor_inicio_at: new Date('2026-11-24T13:00:00Z'),  // 8 a. m. Colombia
    update: jest.fn(async function (v) { Object.assign(this, v); return this; }),
    increment: jest.fn(),
    ...extra
  };
  return j;
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(AHORA_NOCHE));
  Object.values({ ...mockJornada, ...mockAusencia, ...mockPunto, ...mockUsuario }).forEach(f => f.mockReset());
  logger.error.mockReset();
  mockUsuario.findByPk.mockResolvedValue({ usr_id: 10 });
  mockAusencia.findOne.mockResolvedValue(null);
  mockJornada.findAll.mockResolvedValue([]);
  mockJornada.create.mockImplementation(async (v) => ({ ...v }));
  mockPunto.findAll.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

describe('iniciarJornada', () => {
  test('sin nada: crea con la fecha de hoy en Colombia (no la de UTC)', async () => {
    const r = await svc.iniciarJornada(10, {});
    expect(mockJornada.create).toHaveBeenCalledTimes(1);
    expect(mockJornada.create.mock.calls[0][0].jor_fecha).toBe('2026-11-25');
    expect(r.jor_fecha).toBe('2026-11-25');
  });

  test.each([
    ['Date a las 05:00Z', new Date('2026-11-25T05:00:00Z')],
    ['texto', '2026-11-25']
  ])('con activa de hoy (%s): la devuelve sin crear ni cerrar', async (_n, fecha) => {
    const hoy = jornada({ jor_id: 'hoy', jor_fecha: fecha });
    mockJornada.findAll.mockResolvedValue([hoy]);
    const r = await svc.iniciarJornada(10, {});
    expect(r).toBe(hoy);
    expect(mockJornada.create).not.toHaveBeenCalled();
    expect(hoy.update).not.toHaveBeenCalled();
  });

  test.each([
    ['Date a las 05:00Z', new Date('2026-11-24T05:00:00Z')],
    ['texto', '2026-11-24']
  ])('con activa de ayer (%s): la cierra como auto_cerrada a las 6 p. m. y crea la de hoy', async (_n, fecha) => {
    const ayer = jornada({ jor_fecha: fecha });
    mockJornada.findAll.mockResolvedValue([ayer]);
    mockJornada.findByPk.mockResolvedValue(ayer);
    await svc.iniciarJornada(10, {});
    expect(ayer.update).toHaveBeenCalledWith(expect.objectContaining({
      jor_estado: 'auto_cerrada',
      jor_fin_at: new Date('2026-11-24T23:00:00Z'),
      jor_duracion_min: 600
    }));
    expect(mockJornada.create).toHaveBeenCalledTimes(1);
    expect(mockJornada.create.mock.calls[0][0].jor_fecha).toBe('2026-11-25');
  });

  test('con activa de ayer y de hoy: cierra la de ayer y devuelve la de hoy', async () => {
    const ayer = jornada({ jor_id: 'ayer' });
    const hoy  = jornada({ jor_id: 'hoy', jor_fecha: new Date('2026-11-25T05:00:00Z') });
    mockJornada.findAll.mockResolvedValue([ayer, hoy]);
    mockJornada.findByPk.mockResolvedValue(ayer);
    const r = await svc.iniciarJornada(10, {});
    expect(r).toBe(hoy);
    expect(ayer.update).toHaveBeenCalledWith(expect.objectContaining({ jor_estado: 'auto_cerrada' }));
    expect(hoy.update).not.toHaveBeenCalled();
    expect(mockJornada.create).not.toHaveBeenCalled();
  });

  test('consulta las activas del usuario, de la más reciente a la más antigua', async () => {
    await svc.iniciarJornada(10, {});
    expect(mockJornada.findAll).toHaveBeenCalledWith({
      where: { jor_usr_id: 10, jor_estado: 'activa' },
      order: [['jor_inicio_at', 'DESC']]
    });
  });

  test('con dos activas hoy devuelve la primera de la lista (la más reciente)', async () => {
    const a = jornada({ jor_id: 'a', jor_fecha: new Date('2026-11-25T05:00:00Z') });
    const b = jornada({ jor_id: 'b', jor_fecha: new Date('2026-11-25T05:00:00Z') });
    mockJornada.findAll.mockResolvedValue([a, b]);
    expect(await svc.iniciarJornada(10, {})).toBe(a);
  });

  test('espera el cierre de la de ayer antes de crear', async () => {
    const ayer = jornada();
    mockJornada.findAll.mockResolvedValue([ayer]);
    mockJornada.findByPk.mockResolvedValue(ayer);
    let cerrada = false;
    ayer.update.mockImplementation(() => (async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); cerrada = true; })());
    mockJornada.create.mockImplementation(async (v) => { expect(cerrada).toBe(true); return { ...v }; });
    await svc.iniciarJornada(10, {});
    expect(mockJornada.create).toHaveBeenCalled();
  });

  test('si el cierre de la de ayer falla, igual crea la de hoy y lo registra', async () => {
    const ayer = jornada();
    mockJornada.findAll.mockResolvedValue([ayer]);
    mockJornada.findByPk.mockResolvedValue(ayer);
    ayer.update.mockRejectedValue(new Error('boom'));
    await svc.iniciarJornada(10, {});
    expect(mockJornada.create).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });

  test('si otra petición ya cerró la de ayer (YA_FINALIZADA), sigue sin registrar error', async () => {
    const ayer = jornada();
    mockJornada.findAll.mockResolvedValue([ayer]);
    mockJornada.findByPk.mockResolvedValue({ ...ayer, jor_estado: 'auto_cerrada' });
    await svc.iniciarJornada(10, {});
    expect(mockJornada.create).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('con ausencia hoy: AUSENTE, sin crear ni cerrar', async () => {
    const ayer = jornada();
    mockAusencia.findOne.mockResolvedValue({ aus_id: 1 });
    mockJornada.findAll.mockResolvedValue([ayer]);
    await expect(svc.iniciarJornada(10, {})).rejects.toMatchObject({ code: 'AUSENTE' });
    expect(mockAusencia.findOne).toHaveBeenCalledWith({ where: { aus_usr_id: 10, aus_fecha: '2026-11-25' } });
    expect(mockJornada.create).not.toHaveBeenCalled();
    expect(ayer.update).not.toHaveBeenCalled();
  });
});

describe('finalizarJornada con marcarAuto', () => {
  test('inició 8 a. m.: fin 6 p. m. y duración 600', async () => {
    const j = jornada();
    mockJornada.findByPk.mockResolvedValue(j);
    await svc.finalizarJornada('j1', { marcarAuto: true });
    expect(j.update).toHaveBeenCalledWith(expect.objectContaining({
      jor_fin_at: new Date('2026-11-24T23:00:00Z'), jor_duracion_min: 600, jor_estado: 'auto_cerrada'
    }));
  });

  test('inició 8 p. m.: fin = inicio y duración 0', async () => {
    const inicio = new Date('2026-11-25T01:00:00Z'); // 8 p. m. del 24
    const j = jornada({ jor_inicio_at: inicio });
    mockJornada.findByPk.mockResolvedValue(j);
    await svc.finalizarJornada('j1', { marcarAuto: true });
    expect(j.update).toHaveBeenCalledWith(expect.objectContaining({ jor_fin_at: inicio, jor_duracion_min: 0 }));
  });

  test('a las 3 p. m. de hoy: fin = ahora, nunca en el futuro', async () => {
    jest.setSystemTime(new Date('2026-11-25T20:00:00Z')); // 3 p. m. Colombia
    const j = jornada({ jor_fecha: new Date('2026-11-25T05:00:00Z'), jor_inicio_at: new Date('2026-11-25T13:00:00Z') });
    mockJornada.findByPk.mockResolvedValue(j);
    await svc.finalizarJornada('j1', { marcarAuto: true });
    expect(j.update).toHaveBeenCalledWith(expect.objectContaining({
      jor_fin_at: new Date('2026-11-25T20:00:00Z'), jor_duracion_min: 420
    }));
  });

  test('sin marcarAuto: fin = ahora y estado finalizada', async () => {
    const j = jornada();
    mockJornada.findByPk.mockResolvedValue(j);
    await svc.finalizarJornada('j1');
    expect(j.update).toHaveBeenCalledWith(expect.objectContaining({
      jor_fin_at: new Date(AHORA_NOCHE), jor_estado: 'finalizada'
    }));
  });
});

describe('batchPuntos: dueño', () => {
  test('jornada de otro: FORBIDDEN sin guardar', async () => {
    mockJornada.findByPk.mockResolvedValue(jornada({ jor_usr_id: 99 }));
    await expect(svc.batchPuntos('j1', [{ ts: 1, lat: 1, lng: 1 }], 10)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockPunto.bulkCreate).not.toHaveBeenCalled();
  });

  test('el dueño se comprueba antes que el estado', async () => {
    mockJornada.findByPk.mockResolvedValue(jornada({ jor_usr_id: 99, jor_estado: 'finalizada' }));
    await expect(svc.batchPuntos('j1', [], 10)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('jornada cerrada del dueño: JORNADA_CERRADA', async () => {
    mockJornada.findByPk.mockResolvedValue(jornada({ jor_usr_id: 10, jor_estado: 'finalizada' }));
    await expect(svc.batchPuntos('j1', [], 10)).rejects.toMatchObject({ code: 'JORNADA_CERRADA' });
  });

  test('descarta los puntos de otro día (Colombia) y guarda los del día de la jornada', async () => {
    const ts = new Date(2026, 10, 25, 9, 0, 0);       // 9 a. m. locales: dentro del horario
    const dia = svc.__diaDe(ts);
    mockJornada.findByPk.mockResolvedValue(jornada({ jor_usr_id: 10, jor_fecha: dia, jor_estado: 'activa' }));
    const bien = await svc.batchPuntos('j1', [{ ts, lat: 4.6, lng: -74.1 }], 10);
    expect(bien).toMatchObject({ aceptados: 1 });
    expect(bien.motivos.otro_dia).toBe(0);

    mockJornada.findByPk.mockResolvedValue(jornada({ jor_usr_id: 10, jor_fecha: '2026-01-01', jor_estado: 'activa' }));
    const mal = await svc.batchPuntos('j1', [{ ts, lat: 4.6, lng: -74.1 }], 10);
    expect(mal).toMatchObject({ aceptados: 0, descartados: 1 });
    expect(mal.motivos.otro_dia).toBe(1);
  });

  test('con jor_fecha como Date a las 05:00Z (así llega de la base) compara por día', async () => {
    const ts = new Date(2026, 10, 25, 9, 0, 0);
    const [y, m, d] = svc.__diaDe(ts).split('-').map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d, 5));
    mockJornada.findByPk.mockResolvedValue(jornada({ jor_usr_id: 10, jor_fecha: fecha, jor_estado: 'activa' }));
    const r = await svc.batchPuntos('j1', [{ ts, lat: 4.6, lng: -74.1 }], 10);
    expect(r).toMatchObject({ aceptados: 1 });
    expect(r.motivos.otro_dia).toBe(0);
  });

  test('el dueño pasa (también con id como texto)', async () => {
    mockJornada.findByPk.mockResolvedValue(jornada({ jor_usr_id: 10 }));
    mockPunto.findOne.mockResolvedValue(null);
    const r = await svc.batchPuntos('j1', [], '10');
    expect(r.recibidos).toBe(0);
  });

  test('sin usrId no se comprueba (uso interno)', async () => {
    mockJornada.findByPk.mockResolvedValue(jornada({ jor_usr_id: 99 }));
    mockPunto.findOne.mockResolvedValue(null);
    await expect(svc.batchPuntos('j1', [])).resolves.toBeDefined();
  });
});

describe('obtenerJornada', () => {
  test('lee por id', async () => {
    const j = jornada();
    mockJornada.findByPk.mockResolvedValue(j);
    expect(await svc.obtenerJornada('j1')).toBe(j);
    expect(mockJornada.findByPk).toHaveBeenCalledWith('j1');
  });
});

describe('cerrarJornadasAbiertas (job)', () => {
  test('cierra con marcarAuto', async () => {
    const j = jornada();
    mockJornada.findAll.mockResolvedValue([j]);
    mockJornada.findByPk.mockResolvedValue(j);
    expect(await svc.cerrarJornadasAbiertas()).toBe(1);
    expect(j.update).toHaveBeenCalledWith(expect.objectContaining({ jor_estado: 'auto_cerrada' }));
  });
});
