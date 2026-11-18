jest.mock('../src/sv/models', () => ({ sequelize: { query: jest.fn() } }));

const { sequelize } = require('../src/sv/models');
const repo = require('../src/sv/services/homenajesSala.repo');

beforeEach(() => jest.clearAllMocks());

describe('homenajesSala.repo', () => {
  test('listarEnCurso excluye FINALIZADO y ordena del más reciente', async () => {
    sequelize.query.mockResolvedValue([{ id: 1 }]);
    const filas = await repo.listarEnCurso();
    expect(filas).toEqual([{ id: 1 }]);
    const [sql, opts] = sequelize.query.mock.calls[0];
    expect(sql).toMatch(/FROM homenajes_sala h/);
    expect(sql).toMatch(/h\.estado <> :fin/);
    expect(sql).toMatch(/ORDER BY h\.created_at DESC/);
    expect(opts.replacements).toEqual({ fin: 'FINALIZADO' });
    expect(opts.type).toBe('SELECT');
  });

  test('obtener devuelve la fila o null', async () => {
    sequelize.query.mockResolvedValueOnce([{ id: 56 }]).mockResolvedValueOnce([]);
    expect(await repo.obtener(56)).toEqual({ id: 56 });
    expect(sequelize.query.mock.calls[0][1].replacements).toEqual({ id: 56 });
    expect(await repo.obtener(99)).toBeNull();
  });

  test('las consultas solo leen', async () => {
    sequelize.query.mockResolvedValue([]);
    await repo.listarEnCurso();
    await repo.obtener(1);
    for (const [sql] of sequelize.query.mock.calls) {
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER)\b/i);
    }
  });

  test('estaEnCurso', () => {
    expect(repo.estaEnCurso({ estado: 'ABIERTO' })).toBe(true);
    expect(repo.estaEnCurso({ estado: 'SALIDA_REGISTRADA' })).toBe(true);
    expect(repo.estaEnCurso({ estado: 'FINALIZADO' })).toBe(false);
    expect(repo.estaEnCurso(null)).toBe(false);
  });
});
