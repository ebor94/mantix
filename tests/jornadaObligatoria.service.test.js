const mockJornada  = { findOne: jest.fn() };
const mockAusencia = { findOne: jest.fn(), create: jest.fn(), destroy: jest.fn() };

jest.mock('../src/sv/models', () => ({
  SvJornada:         mockJornada,
  SvJornadaAusencia: mockAusencia
}));

jest.mock('../src/sv/utils/fechas', () => ({
  hoyISO: () => '2026-09-14'
}));

const svc = require('../src/sv/services/jornadaObligatoria.service');

const asesor    = { usr_id: 10, rol: { rol_codigo: 'ASESOR' } };
const coord     = { usr_id: 11, rol: { rol_codigo: 'COORDINADOR_PREVISION' } };
const director  = { usr_id: 12, rol: { rol_codigo: 'DIRECTOR_COMERCIAL' } };
const gerente   = { usr_id: 13, rol: { rol_codigo: 'GERENTE_GENERAL' } };
const superadm  = { usr_id: 14, rol: { rol_codigo: 'SUPER_ADMIN' } };

beforeEach(() => {
  mockJornada.findOne.mockReset().mockResolvedValue(null);
  mockAusencia.findOne.mockReset().mockResolvedValue(null);
  mockAusencia.create.mockReset();
  mockAusencia.destroy.mockReset();
});

describe('esOperativo', () => {
  test('asesor es operativo', () => expect(svc.esOperativo(asesor)).toBe(true));
  test('coordinador es operativo', () => expect(svc.esOperativo(coord)).toBe(true));
  test('director NO es operativo', () => expect(svc.esOperativo(director)).toBe(false));
  test('gerente NO es operativo', () => expect(svc.esOperativo(gerente)).toBe(false));
  test('super_admin NO es operativo', () => expect(svc.esOperativo(superadm)).toBe(false));
});

describe('estadoHoy', () => {
  test('asesor sin jornada ni ausencia → sin_iniciar + requiere_popup=true', async () => {
    const r = await svc.estadoHoy(asesor);
    expect(r.estado).toBe('sin_iniciar');
    expect(r.requiere_popup).toBe(true);
    expect(r.jornada).toBeNull();
    expect(r.ausencia).toBeNull();
  });

  test('asesor con jornada activa → activa + requiere_popup=false', async () => {
    mockJornada.findOne.mockResolvedValue({ jor_id: 'x', jor_estado: 'activa' });
    const r = await svc.estadoHoy(asesor);
    expect(r.estado).toBe('activa');
    expect(r.requiere_popup).toBe(false);
  });

  test('asesor con jornada finalizada → finalizada + requiere_popup=false', async () => {
    mockJornada.findOne.mockResolvedValue({ jor_id: 'x', jor_estado: 'finalizada' });
    const r = await svc.estadoHoy(asesor);
    expect(r.estado).toBe('finalizada');
    expect(r.requiere_popup).toBe(false);
  });

  test('asesor con ausencia declarada → ausente + requiere_popup=false', async () => {
    mockAusencia.findOne.mockResolvedValue({ aus_id: 1, aus_tipo: 'PERMISO' });
    const r = await svc.estadoHoy(asesor);
    expect(r.estado).toBe('ausente');
    expect(r.requiere_popup).toBe(false);
    expect(r.ausencia.aus_id).toBe(1);
  });

  test('director sin jornada → requiere_popup=false (no operativo)', async () => {
    const r = await svc.estadoHoy(director);
    expect(r.estado).toBe('sin_iniciar');
    expect(r.requiere_popup).toBe(false);
  });

  test('super_admin → requiere_popup=false', async () => {
    const r = await svc.estadoHoy(superadm);
    expect(r.requiere_popup).toBe(false);
  });
});

describe('registrarAusencia', () => {
  test('crea el registro y lo retorna', async () => {
    mockAusencia.create.mockResolvedValue({ aus_id: 42, aus_usr_id: 10 });
    const r = await svc.registrarAusencia(10, { tipo: 'PERMISO', motivo: 'Cita médica' });
    expect(mockAusencia.create).toHaveBeenCalledWith({
      aus_usr_id: 10,
      aus_fecha:  '2026-09-14',
      aus_tipo:   'PERMISO',
      aus_motivo: 'Cita médica'
    });
    expect(r.aus_id).toBe(42);
  });

  test('re-emite AUSENCIA_DUPLICADA si el unique key rechaza', async () => {
    const dupErr = new Error('dup');
    dupErr.name = 'SequelizeUniqueConstraintError';
    mockAusencia.create.mockRejectedValue(dupErr);
    await expect(
      svc.registrarAusencia(10, { tipo: 'OTRO', motivo: 'algo' })
    ).rejects.toMatchObject({ code: 'AUSENCIA_DUPLICADA' });
  });
});

describe('eliminarAusenciaHoy', () => {
  test('borra la ausencia del día y retorna el conteo', async () => {
    mockAusencia.destroy.mockResolvedValue(1);
    const r = await svc.eliminarAusenciaHoy(10);
    expect(mockAusencia.destroy).toHaveBeenCalledWith({
      where: { aus_usr_id: 10, aus_fecha: '2026-09-14' }
    });
    expect(r).toBe(1);
  });
});
