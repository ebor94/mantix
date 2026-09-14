const mockEvento = { create: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), update: jest.fn() };
const mockAsis   = { create: jest.fn(), bulkCreate: jest.fn(), findAll: jest.fn(), findOne: jest.fn(), update: jest.fn(), destroy: jest.fn(), findByPk: jest.fn() };
const mockSlot   = { bulkCreate: jest.fn(), destroy: jest.fn(), findAll: jest.fn() };
const mockPool   = { count: jest.fn(), findAll: jest.fn() };
const mockUsr    = { findByPk: jest.fn(), findAll: jest.fn() };

jest.mock('../src/sv/models', () => ({
  SvEventoAgenda:       mockEvento,
  SvEventoAsistente:    mockAsis,
  SvEventoSlot:         mockSlot,
  SvEventoPoolRegistro: mockPool,
  SvUsuario:            mockUsr,
  SvProspecto:          {},
  SvEmpresa:            {},
  SvGrupo:              {},
  SvArea:               {}
}));

jest.mock('../src/sv/utils/acceso', () => ({
  usuariosAccesibles: jest.fn(),
  grupoIdsAccesibles: jest.fn(),
  areaIdsAccesibles:  jest.fn()
}));

const acceso = require('../src/sv/utils/acceso');
const svc    = require('../src/sv/services/eventosAgenda.service');

const jefe   = { usr_id: 20, rol: { rol_codigo: 'COORDINADOR_PREVISION' } };
const asesor = { usr_id: 10, rol: { rol_codigo: 'ASESOR' } };

beforeEach(() => {
  jest.clearAllMocks();
  acceso.usuariosAccesibles.mockResolvedValue(null); // por default, admin sin filtro
});

describe('crear (multi-asesor)', () => {
  test('jefe crea evento UNICO con 2 asistentes → crea evento + 2 filas asistentes', async () => {
    mockEvento.create.mockResolvedValue({ evento_id: 500 });
    acceso.usuariosAccesibles.mockResolvedValue([10, 11, 12]);
    await svc.crear({
      titulo: 'Feria', tipo: 'FERIA', modo_fechas: 'UNICO',
      fecha_inicio: '2026-10-20T08:00:00Z',
      asistentes_ids: [10, 11]
    }, jefe);
    expect(mockEvento.create).toHaveBeenCalledWith(expect.objectContaining({
      evento_titulo: 'Feria', evento_modo_fechas: 'UNICO'
    }));
    expect(mockAsis.bulkCreate).toHaveBeenCalledWith(
      [{ eva_evento_id: 500, eva_usr_id: 10 }, { eva_evento_id: 500, eva_usr_id: 11 }]
    );
    expect(mockSlot.bulkCreate).not.toHaveBeenCalled();
  });

  test('modo SLOTS también crea slots', async () => {
    mockEvento.create.mockResolvedValue({ evento_id: 501 });
    acceso.usuariosAccesibles.mockResolvedValue([10, 11]);
    await svc.crear({
      titulo: 'Feria', tipo: 'FERIA', modo_fechas: 'SLOTS',
      fecha_inicio: '2026-10-20T08:00:00Z', fecha_fin: '2026-10-22T18:00:00Z',
      slots: [
        { fecha: '2026-10-20', hora_inicio: '08:00', hora_fin: '12:00' },
        { fecha: '2026-10-21', hora_inicio: '14:00', hora_fin: '18:00' }
      ],
      asistentes_ids: [10]
    }, jefe);
    expect(mockSlot.bulkCreate).toHaveBeenCalled();
    expect(mockSlot.bulkCreate.mock.calls[0][0]).toHaveLength(2);
  });

  test('registros_publicos_habilitado → genera evento_link_hash 32 hex', async () => {
    mockEvento.create.mockResolvedValue({ evento_id: 502 });
    acceso.usuariosAccesibles.mockResolvedValue([10]);
    await svc.crear({
      titulo: 'X', tipo: 'FERIA', modo_fechas: 'UNICO',
      fecha_inicio: '2026-10-20T08:00:00Z',
      asistentes_ids: [10],
      registros_publicos_habilitado: true
    }, jefe);
    const payload = mockEvento.create.mock.calls[0][0];
    expect(payload.evento_registros_publicos_habilitado).toBe(1);
    expect(payload.evento_link_hash).toMatch(/^[a-f0-9]{32}$/);
  });

  test('asesor sólo puede agregarse a sí mismo (rechaza asistentes_ids con otros)', async () => {
    acceso.usuariosAccesibles.mockResolvedValue([10]);
    await expect(svc.crear({
      titulo: 'X', tipo: 'REUNION', modo_fechas: 'UNICO',
      fecha_inicio: '2026-10-20T08:00:00Z',
      asistentes_ids: [10, 11]
    }, asesor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('jefe rechaza asistente fuera de scope', async () => {
    acceso.usuariosAccesibles.mockResolvedValue([10, 11]);
    await expect(svc.crear({
      titulo: 'X', tipo: 'REUNION', modo_fechas: 'UNICO',
      fecha_inicio: '2026-10-20T08:00:00Z',
      asistentes_ids: [10, 999]
    }, jefe)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('actualizarMetricasAsistente', () => {
  test('jefe actualiza métricas de un asistente en su scope', async () => {
    mockAsis.findByPk.mockResolvedValue({
      eva_id: 77, eva_evento_id: 500, eva_usr_id: 10,
      update: jest.fn().mockResolvedValue(true)
    });
    acceso.usuariosAccesibles.mockResolvedValue([10, 11]);
    const r = await svc.actualizarMetricasAsistente(77,
      { estado: 'ASISTIO', leads_captados: 5 }, jefe);
    expect(r.update).toHaveBeenCalledWith({
      eva_estado: 'ASISTIO', eva_leads_captados: 5
    });
  });

  test('asesor sólo puede actualizar sus propias métricas', async () => {
    mockAsis.findByPk.mockResolvedValue({
      eva_id: 77, eva_evento_id: 500, eva_usr_id: 999,
      update: jest.fn()
    });
    await expect(svc.actualizarMetricasAsistente(77, { estado: 'ASISTIO' }, asesor))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('asistente inexistente → NOT_FOUND', async () => {
    mockAsis.findByPk.mockResolvedValue(null);
    await expect(svc.actualizarMetricasAsistente(999, { estado: 'ASISTIO' }, jefe))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('resumen', () => {
  test('devuelve totales del pool + agregado por asistente', async () => {
    mockEvento.findByPk.mockResolvedValue({ evento_id: 500, evento_asesor_id: 10 });
    mockAsis.findAll.mockResolvedValue([
      { eva_usr_id: 10, eva_leads_captados: 8, eva_prospectos_creados: 3, eva_ventas_cerradas: 1,
        usuario: { usr_id: 10, usr_nombre: 'Juan', usr_apellido: 'P' } },
      { eva_usr_id: 11, eva_leads_captados: 4, eva_prospectos_creados: 1, eva_ventas_cerradas: 0,
        usuario: { usr_id: 11, usr_nombre: 'Ana', usr_apellido: 'G' } }
    ]);
    mockPool.count
      .mockResolvedValueOnce(20)   // total_registros
      .mockResolvedValueOnce(12);  // total_asignados
    acceso.usuariosAccesibles.mockResolvedValue([10, 11]);
    const r = await svc.resumen(500, jefe);
    expect(r.total_registros).toBe(20);
    expect(r.total_asignados).toBe(12);
    expect(r.total_pendientes).toBe(8);
    expect(r.por_asesor).toHaveLength(2);
    expect(r.por_asesor[0]).toMatchObject({ usr_id: 10, leads: 8, prospectos: 3, ventas: 1 });
  });
});
