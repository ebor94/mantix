const { inspect } = require('util');

const mockEv    = { findAll: jest.fn() };
const mockPool  = { count: jest.fn() };
const mockUsr   = { findByPk: jest.fn() };
const mockAsis  = { findAll: jest.fn() };
jest.mock('../src/sv/models', () => ({
  SvEventoAgenda: mockEv, SvEventoPoolRegistro: mockPool,
  SvEventoAsistente: mockAsis, SvUsuario: mockUsr, SvEmpresa: {},
  SvProspecto: {}, SvGrupo: {}, SvArea: {}
}));
jest.mock('../src/sv/utils/acceso', () => ({
  usuariosAccesibles: jest.fn(),
  grupoIdsAccesibles: jest.fn()
}));

const svc = require('../src/sv/services/eventosAgenda.service');
const acceso = require('../src/sv/utils/acceso');

// El where usa Symbols de Sequelize (Op.and/Op.or) como claves de nivel
// superior; JSON.stringify ignora las propiedades con clave Symbol, así que
// para inspeccionar el contenido usamos util.inspect (sí recorre símbolos).
const whereStr = (where) => inspect(where, { depth: null, breakLength: Infinity });

const jefe = { usr_id: 20, rol: { rol_codigo: 'COORDINADOR_PREVISION' } };

beforeEach(() => {
  jest.clearAllMocks();
  acceso.usuariosAccesibles.mockResolvedValue([10, 11, 12]);
  mockEv.findAll.mockResolvedValue([]);
  mockPool.count.mockResolvedValue(0);
  mockAsis.findAll.mockResolvedValue([]);
});

describe('listado', () => {
  test('sin filtros retorna eventos del scope del actor', async () => {
    mockEv.findAll.mockResolvedValue([
      { toJSON: () => ({ evento_id: 500, evento_titulo: 'Feria', evento_asesor_id: 10 }) }
    ]);
    const r = await svc.listado({ filtros: {}, actor: jefe });
    expect(r).toHaveLength(1);
    expect(r[0].evento_id).toBe(500);
  });

  test('filtro q busca por título (LIKE)', async () => {
    await svc.listado({ filtros: { q: 'Feria' }, actor: jefe });
    const where = mockEv.findAll.mock.calls[0][0].where;
    expect(whereStr(where)).toContain('Feria');
  });

  test('filtro tipo', async () => {
    await svc.listado({ filtros: { tipo: 'FERIA' }, actor: jefe });
    const where = mockEv.findAll.mock.calls[0][0].where;
    expect(whereStr(where)).toContain('FERIA');
  });

  test('link_publico=1 solo eventos con registros_publicos_habilitado', async () => {
    await svc.listado({ filtros: { link_publico: '1' }, actor: jefe });
    const where = mockEv.findAll.mock.calls[0][0].where;
    expect(whereStr(where)).toContain('evento_registros_publicos_habilitado');
  });

  test('cada fila incluye conteo del pool si el evento tiene link público', async () => {
    mockEv.findAll.mockResolvedValue([
      { toJSON: () => ({ evento_id: 500, evento_registros_publicos_habilitado: 1 }) }
    ]);
    mockPool.count
      .mockResolvedValueOnce(20)  // total
      .mockResolvedValueOnce(5);  // pendientes
    const r = await svc.listado({ filtros: {}, actor: jefe });
    expect(r[0].pool_total).toBe(20);
    expect(r[0].pool_pendientes).toBe(5);
  });
});
