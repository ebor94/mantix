jest.mock('../src/sv/models', () => ({
  sequelize: { query: jest.fn() },
  SvUsuario: { findAll: jest.fn() },
  SvPresupuesto: { findAll: jest.fn(), findOne: jest.fn() },
  SvProducto: { findAll: jest.fn() }
}));

const { Op } = require('sequelize');
const M = require('../src/sv/models');
const svc = require('../src/sv/services/presupuestos.service');

const user = (rol, extra = {}) => ({ usr_id: 3, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [], areasExtra: [], rol: { rol_codigo: rol }, ...extra });

describe('alcance', () => {
  test.each([
    ['ASESOR solo él', user('ASESOR', { usr_id: '7' }), 1, { usr_id: '7' }],
    ['AGENTE_SVC solo él', user('AGENTE_SVC', { usr_id: 9 }), 1, { usr_id: 9 }],
    ['rol desconocido solo él', user('INVENTADO', { usr_id: 11 }), 1, { usr_id: 11 }],
    ['SUPERVISOR su grupo', user('SUPERVISOR', { usr_grupo_id: '2' }), 1, { usr_grupo_id: { [Op.in]: [2] } }],
    ['SUPERVISOR con varios grupos', user('SUPERVISOR', { usr_grupo_id: 2, gruposExtra: [{ grupo_id: '5' }, { grupo_id: 2 }] }), 1, { usr_grupo_id: { [Op.in]: [2, 5] } }],
    ['COORDINADOR sus grupos', user('COORDINADOR_PREVISION', { usr_grupo_id: 4, gruposExtra: [{ grupo_id: 6 }] }), 1, { usr_grupo_id: { [Op.in]: [4, 6] } }],
    ['JEFE_PAP el grupo 3', user('JEFE_PAP', { usr_grupo_id: 8, gruposExtra: [{ grupo_id: 9 }] }), 1, { usr_grupo_id: 3 }],
    ['ADMIN_AREA su área', user('ADMIN_AREA'), 1, { usr_area_id: 1 }],
    ['ADMIN_AREA otra área', user('ADMIN_AREA'), 2, null],
    ['DIRECTOR un área extra', user('DIRECTOR_COMERCIAL', { usr_area_id: 3, areasExtra: [{ area_id: '1' }] }), 1, { usr_area_id: 1 }],
    ['DIRECTOR sin esa área', user('DIRECTOR_COMERCIAL', { usr_area_id: 3, areasExtra: [{ area_id: 4 }] }), 1, null],
    ['GERENTE un área extra', user('GERENTE_GENERAL', { usr_area_id: 2, areasExtra: [{ area_id: 1 }] }), 1, { usr_area_id: 1 }],
    ['GERENTE sin esa área', user('GERENTE_GENERAL', { usr_area_id: 2, areasExtra: [] }), 1, null],
    ['SUPER_ADMIN todo', user('SUPER_ADMIN', { usr_area_id: null }), 7, {}],
    ['SUPERVISOR sin grupos', user('SUPERVISOR', { usr_grupo_id: null }), 1, null],
    ['ADMIN_AREA sin áreas', user('ADMIN_AREA', { usr_area_id: null }), 1, null]
  ])('%s', (_n, u, area, esperado) => {
    expect(svc.alcance(u, area)).toEqual(esperado);
  });

  test('sin usuario → null', () => {
    expect(svc.alcance(null, 1)).toBeNull();
  });
});

describe('puedeCargar', () => {
  test.each([
    ['SUPERVISOR', user('SUPERVISOR'), 1, true],
    ['SUPERVISOR sin grupos', user('SUPERVISOR', { usr_grupo_id: null }), 1, false],
    ['ADMIN_AREA', user('ADMIN_AREA'), 1, true],
    ['ADMIN_AREA otra área', user('ADMIN_AREA'), 2, false],
    ['SUPER_ADMIN', user('SUPER_ADMIN'), 1, true],
    ['COORDINADOR', user('COORDINADOR_PREVISION'), 1, false],
    ['JEFE_PAP', user('JEFE_PAP'), 1, false],
    ['DIRECTOR', user('DIRECTOR_COMERCIAL', { areasExtra: [{ area_id: 1 }] }), 1, false],
    ['GERENTE', user('GERENTE_GENERAL', { areasExtra: [{ area_id: 1 }] }), 1, false],
    ['ASESOR', user('ASESOR'), 1, false],
    ['AGENTE_SVC', user('AGENTE_SVC'), 1, false]
  ])('%s', (_n, u, area, esperado) => {
    expect(svc.puedeCargar(u, area)).toBe(esperado);
  });
});

describe('categoriasDe', () => {
  beforeEach(() => jest.resetAllMocks());

  test('las del catálogo activo del área, en su orden', async () => {
    M.SvProducto.findAll.mockResolvedValue([{ prod_categoria: 'Osarios' }, { prod_categoria: 'Bóvedas' }]);
    expect(await svc.categoriasDe(1)).toEqual(['Osarios', 'Bóvedas']);
    const q = M.SvProducto.findAll.mock.calls[0][0];
    expect(q.where).toEqual({
      prod_area_id: 1, prod_activo: 1, prod_tipo: { [Op.ne]: '' }, prod_categoria: { [Op.ne]: null }
    });
    expect(q.group).toEqual(['prod_categoria']);
    expect(q.raw).toBe(true);
    expect(q.order[0][0].fn).toBe('MIN');
    expect(q.order[0][0].args[0].col).toBe('prod_orden_display');
  });
});

describe('valoresDelMes', () => {
  beforeEach(() => jest.resetAllMocks());

  test('un mapa asesor|categoría → número', async () => {
    M.SvPresupuesto.findAll.mockResolvedValue([
      { pre_usr_id: 7, pre_categoria: 'Osarios', pre_valor: '1500000.00' },
      { pre_usr_id: 8, pre_categoria: 'Bóvedas', pre_valor: '0.00' }
    ]);
    const m = await svc.valoresDelMes(1, 2026, 11);
    expect(m).toEqual(new Map([['7|Osarios', 1500000], ['8|Bóvedas', 0]]));
    expect(M.SvPresupuesto.findAll.mock.calls[0][0].where).toEqual({ pre_area_id: 1, pre_anio: 2026, pre_mes: 11 });
  });

  test('con ids, solo de esos asesores', async () => {
    M.SvPresupuesto.findAll.mockResolvedValue([]);
    await svc.valoresDelMes(1, 2026, 11, [7, 8]);
    expect(M.SvPresupuesto.findAll.mock.calls[0][0].where.pre_usr_id).toEqual({ [Op.in]: [7, 8] });
  });
});

describe('asesoresCargables', () => {
  beforeEach(() => jest.resetAllMocks());

  test('activos con rol ASESOR del área dentro del alcance', async () => {
    M.SvUsuario.findAll.mockResolvedValue([{ usr_id: 7 }]);
    const r = await svc.asesoresCargables(user('SUPERVISOR', { usr_grupo_id: 2 }), 1);
    expect(r).toEqual([{ usr_id: 7 }]);
    expect(M.SvUsuario.findAll.mock.calls[0][0].where).toEqual({
      usr_grupo_id: { [Op.in]: [2] }, usr_area_id: 1, usr_activo: 1, '$rol.rol_codigo$': 'ASESOR'
    });
  });

  test('sin alcance no consulta', async () => {
    expect(await svc.asesoresCargables(user('ADMIN_AREA'), 2)).toEqual([]);
    expect(M.SvUsuario.findAll).not.toHaveBeenCalled();
  });
});

describe('consultar', () => {
  const ASESORES = [
    { usr_id: 7, usr_nombre: 'Ana', usr_apellido: 'Pérez', usr_grupo_id: 1, usr_activo: 1, grupo: { grupo_id: 1, grupo_nombre: 'Prenec A' } },
    { usr_id: 8, usr_nombre: 'Beto', usr_apellido: 'Ruiz', usr_grupo_id: 1, usr_activo: 1, grupo: { grupo_id: 1, grupo_nombre: 'Prenec A' } }
  ];
  const ADMIN = user('ADMIN_AREA');
  const consultar = (extra = {}) => svc.consultar({ user: ADMIN, areaId: 1, anio: 2026, mes: 11, ...extra });

  // presupuestos: [usr, cat, valor]; realizado: [usr, cat, valor]
  function datos({ cats = ['Osarios', 'Bóvedas'], pres = [], real = [], usuarios = ASESORES, editado = null } = {}) {
    M.SvProducto.findAll.mockResolvedValue(cats.map((c) => ({ prod_categoria: c })));
    M.SvPresupuesto.findAll.mockResolvedValue(pres.map(([u, c, v]) => ({ pre_usr_id: u, pre_categoria: c, pre_valor: String(v) })));
    M.sequelize.query.mockResolvedValue(real.map(([u, c, v]) => ({ usr_id: u, categoria: c, valor: String(v) })));
    M.SvUsuario.findAll.mockResolvedValue(usuarios);
    M.SvPresupuesto.findOne.mockResolvedValue(editado);
  }
  beforeEach(() => { jest.resetAllMocks(); datos(); });

  test('un área sin catálogo por tipos es un error de validación', async () => {
    datos({ cats: [] });
    await expect(consultar()).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('sin alcance es prohibido, y no consulta datos', async () => {
    await expect(consultar({ areaId: 2 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(M.sequelize.query).not.toHaveBeenCalled();
    expect(M.SvPresupuesto.findAll).not.toHaveBeenCalled();
  });

  test('compone asesores por categorías, con 0 donde falta, y totales', async () => {
    datos({
      pres: [[7, 'Osarios', 1000], [7, 'Bóvedas', 500], [8, 'Osarios', 2000]],
      real: [[7, 'Osarios', 1200], [8, 'Bóvedas', 300]]
    });
    const r = await consultar();
    expect(r).toMatchObject({ area_id: 1, anio: 2026, mes: 11, puede_cargar: true, categorias: ['Osarios', 'Bóvedas'] });
    expect(r.asesores).toEqual([
      {
        usr_id: 7, nombre: 'Ana Pérez', grupo_id: 1, activo: true,
        categorias: { Osarios: { presupuesto: 1000, realizado: 1200 }, Bóvedas: { presupuesto: 500, realizado: 0 } },
        presupuesto: 1500, realizado: 1200
      },
      {
        usr_id: 8, nombre: 'Beto Ruiz', grupo_id: 1, activo: true,
        categorias: { Osarios: { presupuesto: 2000, realizado: 0 }, Bóvedas: { presupuesto: 0, realizado: 300 } },
        presupuesto: 2000, realizado: 300
      }
    ]);
    expect(r.total).toEqual({
      presupuesto: 3500, realizado: 1500,
      categorias: { Osarios: { presupuesto: 3000, realizado: 1200 }, Bóvedas: { presupuesto: 500, realizado: 300 } }
    });
    expect(r.grupos).toEqual([{ grupo_id: 1, nombre: 'Prenec A' }]);
    expect(r.actualizado).toBeNull();
  });

  test('un asesor sin nada sale con ceros', async () => {
    const r = await consultar();
    expect(r.asesores[0]).toMatchObject({ presupuesto: 0, realizado: 0, categorias: { Osarios: { presupuesto: 0, realizado: 0 } } });
    expect(r.total.presupuesto).toBe(0);
  });

  test('todo número sale como número', async () => {
    datos({ pres: [[7, 'Osarios', '1000.50']], real: [[7, 'Osarios', '20.25']] });
    const a = (await consultar()).asesores[0];
    expect(a.categorias.Osarios).toEqual({ presupuesto: 1000.5, realizado: 20.25 });
  });

  test('un inactivo con datos ese mes sale (activo: false); sin datos no se pide', async () => {
    const baja = { usr_id: 9, usr_nombre: 'Carla', usr_apellido: 'Gil', usr_grupo_id: 1, usr_activo: 0, grupo: { grupo_id: 1, grupo_nombre: 'Prenec A' } };
    datos({ usuarios: [...ASESORES, baja], real: [[9, 'Osarios', 400]] });
    const r = await consultar();
    expect(r.asesores.map((a) => [a.usr_id, a.activo])).toEqual([[7, true], [8, true], [9, false]]);
    const where = M.SvUsuario.findAll.mock.calls[0][0].where;
    expect(where[Op.or]).toEqual([
      { usr_area_id: 1, usr_activo: 1, '$rol.rol_codigo$': 'ASESOR' },
      { usr_id: { [Op.in]: [9] } }
    ]);
  });

  test('con presupuesto en 0 o sin movimiento, el inactivo no se pide', async () => {
    datos({ pres: [[9, 'Osarios', 0]] });
    await consultar();
    expect(M.SvUsuario.findAll.mock.calls[0][0].where[Op.or][1]).toEqual({ usr_id: { [Op.in]: [] } });
  });

  test('el alcance entra en la consulta de usuarios', async () => {
    await svc.consultar({ user: user('SUPERVISOR', { usr_grupo_id: 2 }), areaId: 1, anio: 2026, mes: 11 });
    expect(M.SvUsuario.findAll.mock.calls[0][0].where.usr_grupo_id).toEqual({ [Op.in]: [2] });
  });

  test('lo de quien queda fuera del alcance no se devuelve ni se suma', async () => {
    datos({
      pres: [[7, 'Osarios', 1000], [99, 'Osarios', 5000]],
      real: [[7, 'Osarios', 100], [99, 'Osarios', 700]]
    });
    const r = await consultar();
    expect(r.asesores.map((a) => a.usr_id)).toEqual([7, 8]);
    expect(r.total.presupuesto).toBe(1000);
    expect(r.total.realizado).toBe(100);
    expect(r.total.categorias.Osarios).toEqual({ presupuesto: 1000, realizado: 100 });
  });

  test('una categoría con datos que ya no está en el catálogo sale al final', async () => {
    datos({ pres: [[7, 'Vieja', 300]], real: [[8, 'Vieja', 50], [7, 'Osarios', 10]] });
    const r = await consultar();
    expect(r.categorias).toEqual(['Osarios', 'Bóvedas', 'Vieja']);
    expect(r.asesores[0].categorias.Vieja).toEqual({ presupuesto: 300, realizado: 0 });
    expect(r.asesores[0].presupuesto).toBe(300);
    expect(r.total.categorias.Vieja).toEqual({ presupuesto: 300, realizado: 50 });
  });

  test('una categoría fuera del catálogo con datos solo de alguien fuera del alcance no sale', async () => {
    datos({ pres: [[99, 'Vieja', 300]] });
    expect((await consultar()).categorias).toEqual(['Osarios', 'Bóvedas']);
  });

  test.each([
    ['febrero común', 2026, 2, '2026-02-01', '2026-02-28'],
    ['febrero bisiesto', 2028, 2, '2028-02-01', '2028-02-29'],
    ['abril, 30 días', 2026, 4, '2026-04-01', '2026-04-30'],
    ['diciembre, 31 días', 2026, 12, '2026-12-01', '2026-12-31']
  ])('el realizado de %s', async (_n, anio, mes, desde, hasta) => {
    await consultar({ anio, mes });
    const [sql, opts] = M.sequelize.query.mock.calls[0];
    expect(sql).toMatch(/BETWEEN :desde AND :hasta/);
    expect(sql).toMatch(/venta_anulada = 0/);
    expect(opts.replacements).toEqual({ areaId: 1, desde, hasta });
    expect(M.SvPresupuesto.findAll.mock.calls[0][0].where).toEqual({ pre_area_id: 1, pre_anio: anio, pre_mes: mes });
  });

  test('actualizado: quién y cuándo, del último cambio de lo que ve', async () => {
    datos({ editado: { pre_updated_at: new Date('2026-11-20T15:30:00Z'), editor: { usr_nombre: 'Sara', usr_apellido: 'Mora' } } });
    const r = await consultar();
    expect(r.actualizado).toEqual({ por: 'Sara Mora', en: '2026-11-20T15:30:00.000Z' });
    const q = M.SvPresupuesto.findOne.mock.calls[0][0];
    expect(q.where).toEqual({ pre_area_id: 1, pre_anio: 2026, pre_mes: 11, pre_usr_id: { [Op.in]: [7, 8] } });
    expect(q.order).toEqual([['pre_updated_at', 'DESC'], ['pre_id', 'DESC']]);
  });

  test('actualizado es null si nadie del alcance tiene presupuesto', async () => {
    expect((await consultar()).actualizado).toBeNull();
  });

  test('no pregunta por el último cambio si no hay asesores', async () => {
    datos({ usuarios: [] });
    const r = await consultar();
    expect(r.asesores).toEqual([]);
    expect(r.actualizado).toBeNull();
    expect(M.SvPresupuesto.findOne).not.toHaveBeenCalled();
  });

  test('los grupos: sin repetir y por id; un asesor sin grupo no aporta', async () => {
    const sin = { usr_id: 10, usr_nombre: 'Dani', usr_apellido: 'Paz', usr_grupo_id: null, usr_activo: 1, grupo: null };
    const otro = { usr_id: 11, usr_nombre: 'Eli', usr_apellido: 'Sol', usr_grupo_id: 2, usr_activo: 1, grupo: { grupo_id: 2, grupo_nombre: 'Prenec B' } };
    datos({ usuarios: [otro, ...ASESORES, sin] });
    const r = await consultar();
    expect(r.grupos).toEqual([{ grupo_id: 1, nombre: 'Prenec A' }, { grupo_id: 2, nombre: 'Prenec B' }]);
    expect(r.asesores.find((a) => a.usr_id === 10).grupo_id).toBeNull();
  });

  test('los asesores van por nombre', async () => {
    datos({ usuarios: [ASESORES[1], ASESORES[0]] });
    expect((await consultar()).asesores.map((a) => a.nombre)).toEqual(['Ana Pérez', 'Beto Ruiz']);
  });

  test('puede_cargar sigue al rol', async () => {
    expect((await consultar({ user: user('DIRECTOR_COMERCIAL', { areasExtra: [{ area_id: 1 }] }) })).puede_cargar).toBe(false);
    expect((await consultar({ user: user('SUPER_ADMIN') })).puede_cargar).toBe(true);
  });
});
