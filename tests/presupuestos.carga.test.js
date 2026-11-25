jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/models', () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
  SvUsuario: { findAll: jest.fn() },
  SvPresupuesto: { findAll: jest.fn(), findOne: jest.fn(), bulkCreate: jest.fn() },
  SvProducto: { findAll: jest.fn() },
  SvArea: { findByPk: jest.fn() }
}));
jest.mock('../src/sv/services/usuariosAd.service', () => ({ adUsuariosPorIdentidad: jest.fn() }));

const express = require('express');
const request = require('supertest');
const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const M = require('../src/sv/models');
const { adUsuariosPorIdentidad } = require('../src/sv/services/usuariosAd.service');
const svc = require('../src/sv/services/presupuestos.service');
const excel = require('../src/sv/services/presupuestosExcel.service');
const { svAreaGuard } = require('../src/sv/middleware/svAreaGuard');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

const quien = (rol, extra = {}) => ({ usr_id: 3, usr_area_id: 1, usr_grupo_id: 1, gruposExtra: [], areasExtra: [], rol: { rol_codigo: rol }, ...extra });
const SUPERVISOR = quien('SUPERVISOR');
const ADMIN = quien('ADMIN_AREA');
const CATS = ['Osarios', 'Bóvedas'];
const P = { areaId: 1, anio: 2026, mes: 11 };
const usuario = (id, nombre, grupo, identidad = id * 10) => ({
  usr_id: id, usr_nombre: nombre, usr_apellido: 'X', usr_grupo_id: grupo?.grupo_id ?? null, usr_activo: 1,
  usr_id_identidad: identidad, grupo: grupo || null
});
const GA = { grupo_id: 1, grupo_nombre: 'A' };
const GB = { grupo_id: 2, grupo_nombre: 'B' };
const ASESORES = [usuario(9, 'Zoe', GB), usuario(8, 'Beto', GA), usuario(7, 'Ana', GA)];
const t = { commit: jest.fn(), rollback: jest.fn() };
const error = (p) => p.then(() => null, (e) => e);
const fila = (usr_id, nombre, valores) => ({ usr_id, usuario_red: '', nombre, valores });

// valoresDelMes consulta presupuesto: la 1.ª llamada es el mes; la 2.ª, el anterior.
function presupuestoPorLlamada(...respuestas) {
  respuestas.forEach((r) => M.SvPresupuesto.findAll.mockResolvedValueOnce(
    r.map(([u, c, v]) => ({ pre_usr_id: u, pre_categoria: c, pre_valor: String(v) }))));
  M.SvPresupuesto.findAll.mockResolvedValue([]);
}
async function leerLibro(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

beforeEach(() => {
  jest.resetAllMocks();
  M.SvProducto.findAll.mockResolvedValue(CATS.map((c) => ({ prod_categoria: c })));
  M.SvUsuario.findAll.mockResolvedValue(ASESORES);
  M.SvArea.findByPk.mockResolvedValue({ area_nombre: 'Prenecesidad' });
  M.sequelize.transaction.mockResolvedValue(t);
  M.SvPresupuesto.findAll.mockResolvedValue([]);
  adUsuariosPorIdentidad.mockResolvedValue(new Map([[70, 'aperez'], [80, 'bruiz']]));
});
afterEach(cerrarTodos);

describe('plantilla', () => {
  test('con lo cargado del mes, ordenada por grupo y nombre, con el usuario de red', async () => {
    presupuestoPorLlamada([[7, 'Osarios', 1000], [8, 'Bóvedas', 50], [9, 'Osarios', 9]]);
    const { buffer, nombre } = await svc.plantilla({ user: SUPERVISOR, ...P });
    expect(nombre).toBe('presupuesto-prenecesidad-2026-11.xlsx');
    const ws = (await leerLibro(buffer)).getWorksheet('Presupuesto');
    expect(ws.getCell('A1').value).toBe('Presupuesto Prenecesidad — noviembre 2026');
    expect([4, 5, 6].map((r) => ws.getCell(`C${r}`).value)).toEqual(['Ana X', 'Beto X', 'Zoe X']);
    expect([4, 5, 6].map((r) => ws.getCell(`B${r}`).value)).toEqual(['aperez', 'bruiz', '']);
    expect(ws.getCell('D4').value).toBe(1000);
    expect(ws.getCell('E5').value).toBe(50);
    expect(ws.getCell('D6').value).toBe(9);
    expect(ws.getCell('E4').value).toBe(0);
    expect(M.SvPresupuesto.findAll).toHaveBeenCalledTimes(1);
    expect(adUsuariosPorIdentidad).toHaveBeenCalledWith([90, 80, 70]);
  });

  test('sin nada en el mes, usa el mes anterior', async () => {
    presupuestoPorLlamada([], [[7, 'Osarios', 777]]);
    const ws = (await leerLibro((await svc.plantilla({ user: SUPERVISOR, ...P })).buffer)).getWorksheet('Presupuesto');
    expect(ws.getCell('D4').value).toBe(777);
    const [, previo] = M.SvPresupuesto.findAll.mock.calls;
    expect(previo[0].where).toMatchObject({ pre_anio: 2026, pre_mes: 10 });
  });

  test('el valor por defecto se decide por asesor: los del mes si tiene alguno, si no los del mes anterior', async () => {
    presupuestoPorLlamada([[7, 'Osarios', 1000]], [[7, 'Osarios', 5], [7, 'Bóvedas', 30], [8, 'Osarios', 800], [8, 'Bóvedas', 80]]);
    const ws = (await leerLibro((await svc.plantilla({ user: SUPERVISOR, ...P })).buffer)).getWorksheet('Presupuesto');
    // 7 (Ana): solo lo del mes, el 5 del mes anterior no entra; 8 (Beto): lo del mes anterior; 9 (Zoe): nada
    expect([ws.getCell('D4').value, ws.getCell('E4').value]).toEqual([1000, 0]);
    expect([ws.getCell('D5').value, ws.getCell('E5').value]).toEqual([800, 80]);
    expect([ws.getCell('D6').value, ws.getCell('E6').value]).toEqual([0, 0]);
  });

  test('en enero, el mes anterior es diciembre del año anterior', async () => {
    presupuestoPorLlamada([], []);
    await svc.plantilla({ user: SUPERVISOR, ...P, anio: 2027, mes: 1 });
    expect(M.SvPresupuesto.findAll.mock.calls[1][0].where).toMatchObject({ pre_anio: 2026, pre_mes: 12 });
  });

  test('ordena por grupo antes que por nombre', async () => {
    M.SvUsuario.findAll.mockResolvedValue([usuario(9, 'Zoe', GB), usuario(7, 'Zulema', GA), usuario(8, 'Ana', GB)]);
    const ws = (await leerLibro((await svc.plantilla({ user: SUPERVISOR, ...P })).buffer)).getWorksheet('Presupuesto');
    expect([4, 5, 6].map((r) => ws.getCell(`C${r}`).value)).toEqual(['Zulema X', 'Ana X', 'Zoe X']);
  });

  test('sin nada en ninguno, todo en 0', async () => {
    const ws = (await leerLibro((await svc.plantilla({ user: SUPERVISOR, ...P })).buffer)).getWorksheet('Presupuesto');
    expect([ws.getCell('D4').value, ws.getCell('E6').value]).toEqual([0, 0]);
  });

  test('solo asesores cargables: activos y ASESOR del área, en el alcance', async () => {
    await svc.plantilla({ user: SUPERVISOR, ...P });
    expect(M.SvUsuario.findAll.mock.calls[0][0].where).toEqual({
      usr_grupo_id: { [Op.in]: [1] }, usr_area_id: 1, usr_activo: 1, '$rol.rol_codigo$': 'ASESOR'
    });
  });

  test.each([['COORDINADOR_PREVISION'], ['DIRECTOR_COMERCIAL'], ['GERENTE_GENERAL'], ['ASESOR'], ['JEFE_PAP']])('%s no puede', async (rol) => {
    const e = await error(svc.plantilla({ user: quien(rol, { areasExtra: [{ area_id: 1 }] }), ...P }));
    expect(e).toMatchObject({ code: 'FORBIDDEN' });
    expect(M.SvUsuario.findAll).not.toHaveBeenCalled();
  });

  test('un área sin catálogo → VALIDATION_ERROR', async () => {
    M.SvProducto.findAll.mockResolvedValue([]);
    expect(await error(svc.plantilla({ user: SUPERVISOR, ...P }))).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('revisar', () => {
  const libro = (filas) => excel.escribir({ titulo: 't', ...P, categorias: CATS, filas });
  const revisar = (buffer, user = SUPERVISOR) => svc.revisar({ user, ...P, buffer });

  test('no escribe, y solo cuenta como cambio lo que difiere de lo guardado', async () => {
    presupuestoPorLlamada([[7, 'Osarios', 1000], [7, 'Bóvedas', 50]]);
    const r = await revisar(await libro([
      fila(7, 'Ana X', { Osarios: 1000, 'Bóvedas': 60 }),
      fila(8, 'Beto X', { Osarios: 0, 'Bóvedas': 5 })
    ]));
    expect(r.filas).toEqual([
      { usr_id: 7, nombre: 'Ana X', valores: { Osarios: 1000, 'Bóvedas': 60 } },
      { usr_id: 8, nombre: 'Beto X', valores: { Osarios: 0, 'Bóvedas': 5 } }
    ]);
    expect(r.errores).toEqual([]);
    expect(r.cambios).toEqual([
      { usr_id: 7, nombre: 'Ana X', categoria: 'Bóvedas', antes: 50, despues: 60 },
      { usr_id: 8, nombre: 'Beto X', categoria: 'Bóvedas', antes: 0, despues: 5 }
    ]);
    expect(M.SvPresupuesto.bulkCreate).not.toHaveBeenCalled();
    expect(M.sequelize.transaction).not.toHaveBeenCalled();
    expect(M.SvPresupuesto.findAll.mock.calls[0][0].where.pre_usr_id).toEqual({ [Op.in]: [7, 8] });
  });

  test('lista lo guardado en categorías que salieron del catálogo, con despues 0', async () => {
    presupuestoPorLlamada([[7, 'Vieja', 300], [7, 'Osarios', 10], [8, 'Vieja', 0], [99, 'Vieja', 5]]);
    const r = await revisar(await libro([fila(7, 'Ana X', { Osarios: 10, 'Bóvedas': 0 }), fila(8, 'Beto X', { Osarios: 0, 'Bóvedas': 0 })]));
    expect(r.cambios).toEqual([{ usr_id: 7, nombre: 'Ana X', categoria: 'Vieja', antes: 300, despues: 0 }]);
  });

  test('un asesor cuyo nombre no es el del ID da error', async () => {
    const r = await revisar(await libro([fila(7, 'Beto X', { Osarios: 1, 'Bóvedas': 0 })]));
    expect(r.errores).toEqual([{ fila: 4, columna: 'A (ID)', mensaje: expect.stringMatching(/no corresponde/) }]);
  });

  test('sin diferencias, sin cambios', async () => {
    presupuestoPorLlamada([[7, 'Osarios', 1]]);
    expect((await revisar(await libro([fila(7, 'Ana X', { Osarios: 1, 'Bóvedas': 0 })]))).cambios).toEqual([]);
  });

  test('devuelve los errores del libro con fila y columna', async () => {
    const r = await revisar(await libro([fila(7, 'Ana X', { Osarios: -1, 'Bóvedas': 0 }), fila(99, 'Otro', { Osarios: 1, 'Bóvedas': 1 })]));
    expect(r.errores.map((e) => [e.fila, e.columna])).toEqual([[4, 'D (Osarios)'], [5, 'A (ID)']]);
    expect(r.filas).toEqual([]);
    expect(r.cambios).toEqual([]);
  });

  test('un error del libro entero se informa sin fila ni columna, con filas y cambios vacíos', async () => {
    const buf = await excel.escribir({ titulo: 't', ...P, mes: 10, categorias: CATS, filas: [fila(7, 'Ana X', { Osarios: 5 })] });
    const r = await revisar(buf);
    expect(r).toEqual({ filas: [], cambios: [], errores: [{ fila: null, columna: null, mensaje: expect.stringMatching(/no es de noviembre de 2026/) }] });
    expect(M.SvPresupuesto.findAll).not.toHaveBeenCalled();
  });

  test('con errores de celda, filas y cambios van vacíos aunque otras filas estén bien', async () => {
    const r = await revisar(await libro([fila(7, 'Ana X', { Osarios: 5, 'Bóvedas': 0 }), fila(8, 'Beto X', { Osarios: -5, 'Bóvedas': 0 })]));
    expect(r.errores).toHaveLength(1);
    expect(r.filas).toEqual([]);
    expect(r.cambios).toEqual([]);
  });

  test('sin permiso de cargar no abre el archivo', async () => {
    expect(await error(revisar(Buffer.from('x'), quien('DIRECTOR_COMERCIAL', { areasExtra: [{ area_id: 1 }] })))).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('guardar', () => {
  const guardar = (filas, user = SUPERVISOR) => svc.guardar({ user, ...P, filas });
  const FILAS = [{ usr_id: 7, valores: { Osarios: 100, 'Bóvedas': 0 } }, { usr_id: 8, valores: { Osarios: 5 } }];

  test('upsert en una transacción, a nombre de quien guarda', async () => {
    const r = await guardar(FILAS);
    expect(r).toEqual({ guardados: 2, cambios: 2 });
    const [registros, opts] = M.SvPresupuesto.bulkCreate.mock.calls[0];
    expect(opts).toEqual({ updateOnDuplicate: ['pre_valor', 'pre_updated_by', 'pre_updated_at', 'pre_categoria'], transaction: t });
    // el 0 explícito de 7/Bóvedas se guarda, pero no cuenta como cambio
    expect(registros).toEqual([
      expect.objectContaining({ pre_usr_id: 7, pre_area_id: 1, pre_anio: 2026, pre_mes: 11, pre_categoria: 'Osarios', pre_valor: 100, pre_created_by: 3, pre_updated_by: 3 }),
      expect.objectContaining({ pre_usr_id: 7, pre_categoria: 'Bóvedas', pre_valor: 0 }),
      expect.objectContaining({ pre_usr_id: 8, pre_categoria: 'Osarios', pre_valor: 5 })
    ]);
    expect(registros[0].pre_updated_at).toBeInstanceOf(Date);
    expect(t.commit).toHaveBeenCalledTimes(1);
    expect(t.rollback).not.toHaveBeenCalled();
  });

  test('lo guardado en una categoría que salió del catálogo se pone en 0, en la misma transacción', async () => {
    presupuestoPorLlamada([[7, 'Vieja', 300], [7, 'Osarios', 100], [8, 'Vieja', 0], [99, 'Vieja', 5]]);
    const r = await guardar([{ usr_id: 7, valores: { Osarios: 100 } }, { usr_id: 8, valores: { Osarios: 5 } }]);
    const [registros, opts] = M.SvPresupuesto.bulkCreate.mock.calls[0];
    expect(registros.map((x) => [x.pre_usr_id, x.pre_categoria, x.pre_valor])).toEqual([[7, 'Vieja', 0], [8, 'Osarios', 5]]);
    expect(opts.transaction).toBe(t);
    expect(r).toEqual({ guardados: 2, cambios: 2 });
  });

  test('lo que no cambia no se escribe: ni autor ni fecha', async () => {
    presupuestoPorLlamada([[7, 'Osarios', 100], [7, 'Bóvedas', 20]]);
    const r = await guardar([{ usr_id: 7, valores: { Osarios: 100, 'Bóvedas': 20 } }]);
    expect(M.SvPresupuesto.bulkCreate).not.toHaveBeenCalled();
    expect(t.commit).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ guardados: 0, cambios: 0 });
  });

  test('solo se escribe lo que cambió, comparando con lo guardado dentro de la transacción', async () => {
    presupuestoPorLlamada([[7, 'Osarios', 100], [7, 'Bóvedas', 20]]);
    await guardar([{ usr_id: 7, valores: { Osarios: 100, 'Bóvedas': 25 } }]);
    expect(M.SvPresupuesto.bulkCreate.mock.calls[0][0].map((x) => [x.pre_categoria, x.pre_valor])).toEqual([['Bóvedas', 25]]);
    const lectura = M.SvPresupuesto.findAll.mock.calls[0][0];
    expect(lectura.transaction).toBe(t);
    expect(lectura.where.pre_usr_id).toEqual({ [Op.in]: [7] });
  });

  test('un cero sobre algo guardado sí es un cambio', async () => {
    presupuestoPorLlamada([[7, 'Osarios', 100]]);
    await guardar([{ usr_id: 7, valores: { Osarios: 0 } }]);
    expect(M.SvPresupuesto.bulkCreate.mock.calls[0][0][0]).toMatchObject({ pre_categoria: 'Osarios', pre_valor: 0 });
  });

  test('N3: el cero de la categoría vieja se escribe antes que el valor de la nueva', async () => {
    M.SvProducto.findAll.mockResolvedValue([{ prod_categoria: 'Prórrogas' }]);
    presupuestoPorLlamada([[7, 'Prorrogas', 300]]);
    await guardar([{ usr_id: 7, valores: { Prórrogas: 12 } }]);
    expect(M.SvPresupuesto.bulkCreate.mock.calls[0][0].map((r) => [r.pre_categoria, r.pre_valor])).toEqual([['Prorrogas', 0], ['Prórrogas', 12]]);
  });

  test('N4: un asesor cargado en 0 no vuelve a salir con lo del mes anterior', async () => {
    const filasDB = new Map(); // 'anio-mes|usr|cat' → valor
    const previo = [[7, 'Osarios', 500], [8, 'Osarios', 700]];
    previo.forEach(([u, c, v]) => filasDB.set(`2026-10|${u}|${c}`, v));
    M.SvPresupuesto.findAll.mockImplementation(async ({ where }) => [...filasDB]
      .map(([k, v]) => ({ k: k.split('|'), v }))
      .filter(({ k }) => k[0] === `${where.pre_anio}-${where.pre_mes}` && (!where.pre_usr_id || where.pre_usr_id[Op.in].includes(Number(k[1]))))
      .map(({ k, v }) => ({ pre_usr_id: Number(k[1]), pre_categoria: k[2], pre_valor: String(v) })));
    M.SvPresupuesto.bulkCreate.mockImplementation(async (registros) => {
      registros.forEach((r) => filasDB.set(`${r.pre_anio}-${r.pre_mes}|${r.pre_usr_id}|${r.pre_categoria}`, r.pre_valor));
    });
    const r = await guardar([
      { usr_id: 7, valores: { Osarios: 0, 'Bóvedas': 0 } },
      { usr_id: 8, valores: { Osarios: 10, 'Bóvedas': 0 } }
    ]);
    expect(r).toEqual({ guardados: 1, cambios: 1 }); // el cero explícito no cuenta como cambio
    const ws = (await leerLibro((await svc.plantilla({ user: SUPERVISOR, ...P })).buffer)).getWorksheet('Presupuesto');
    expect([ws.getCell('D4').value, ws.getCell('E4').value]).toEqual([0, 0]); // Ana (7)
    expect([ws.getCell('D5').value, ws.getCell('E5').value]).toEqual([10, 0]); // Beto (8)
  });

  test('un error al guardar deshace todo y se propaga', async () => {
    M.SvPresupuesto.bulkCreate.mockRejectedValue(new Error('se cayó'));
    expect(await error(guardar(FILAS))).toMatchObject({ message: 'se cayó' });
    expect(t.rollback).toHaveBeenCalledTimes(1);
    expect(t.commit).not.toHaveBeenCalled();
  });

  test('lista vacía → VALIDATION_ERROR, sin transacción', async () => {
    expect(await error(guardar([]))).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(M.sequelize.transaction).not.toHaveBeenCalled();
  });

  test.each([
    ['un asesor fuera del alcance', [{ usr_id: 99, valores: { Osarios: 1 } }], 'FORBIDDEN'],
    ['un asesor repetido', [FILAS[0], FILAS[0]], 'VALIDATION_ERROR'],
    ['una categoría que no es del catálogo', [{ usr_id: 7, valores: { Inventada: 1 } }], 'VALIDATION_ERROR'],
    ['una fila sin valores', [{ usr_id: 7, valores: {} }], 'VALIDATION_ERROR'],
    ['un decimal', [{ usr_id: 7, valores: { Osarios: 1.5 } }], 'VALIDATION_ERROR'],
    ['un negativo', [{ usr_id: 7, valores: { Osarios: -1 } }], 'VALIDATION_ERROR'],
    ['un texto', [{ usr_id: 7, valores: { Osarios: '5' } }], 'VALIDATION_ERROR'],
    ['más del máximo', [{ usr_id: 7, valores: { Osarios: 1000000000000 } }], 'VALIDATION_ERROR']
  ])('rechaza %s, sin guardar nada', async (_n, filas, code) => {
    expect(await error(guardar([FILAS[1], ...filas]))).toMatchObject({ code });
    expect(M.SvPresupuesto.bulkCreate).not.toHaveBeenCalled();
    expect(M.sequelize.transaction).not.toHaveBeenCalled();
  });

  test('el máximo exacto se guarda', async () => {
    await guardar([{ usr_id: 7, valores: { Osarios: 999999999999 } }]);
    expect(M.SvPresupuesto.bulkCreate.mock.calls[0][0][0].pre_valor).toBe(999999999999);
  });

  test('más de 300 filas', async () => {
    const muchas = Array.from({ length: 301 }, (_, i) => ({ usr_id: i + 1, valores: { Osarios: 1 } }));
    expect(await error(guardar(muchas))).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('los asesores que no vienen no se tocan: solo se escriben los que vienen', async () => {
    await guardar([FILAS[1]]);
    expect(M.SvPresupuesto.bulkCreate.mock.calls[0][0].map((r) => r.pre_usr_id)).toEqual([8]);
  });

  test.each(['COORDINADOR_PREVISION', 'DIRECTOR_COMERCIAL', 'GERENTE_GENERAL', 'ASESOR'])('%s no puede', async (rol) => {
    expect(await error(guardar(FILAS, quien(rol, { areasExtra: [{ area_id: 1 }] })))).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('rutas', () => {
  function app(user) {
    const r = express.Router();
    r.use('/presupuestos', require('../src/sv/routes/presupuestos.routes'));
    capturarAsync(r);
    r.use(svErrorHandler);
    const a = express();
    a.use(express.json());
    a.use((req, res, next) => { req.user = user; next(); });
    a.use(svAreaGuard);
    a.use('/api/sv', r);
    return escuchar(a);
  }
  const QUERY = { area_id: 1, anio: 2026, mes: 11 };
  const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const libro = () => excel.escribir({ titulo: 't', ...P, categorias: CATS, filas: [fila(7, 'Ana X', { Osarios: 10, 'Bóvedas': 0 })] });
  const subir = async (user, adjuntar, campos = QUERY) => {
    let rq = request(await app(user)).post('/api/sv/presupuestos/revisar');
    for (const [k, v] of Object.entries(campos)) rq = rq.field(k, String(v));
    return adjuntar ? adjuntar(rq) : rq;
  };

  test.each([['SUPERVISOR', SUPERVISOR], ['ADMIN_AREA', ADMIN]])('%s: plantilla con cabeceras de xlsx', async (_n, user) => {
    const r = await request(await app(user)).get('/api/sv/presupuestos/plantilla').query(QUERY).buffer(true).parse((res, cb) => {
      const trozos = []; res.on('data', (d) => trozos.push(d)); res.on('end', () => cb(null, Buffer.concat(trozos)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe(XLSX);
    expect(r.headers['content-disposition']).toBe('attachment; filename="presupuesto-prenecesidad-2026-11.xlsx"');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(Number(r.headers['content-length'])).toBe(r.body.length);
    expect(r.body.subarray(0, 2).toString()).toBe('PK');
  });

  test.each([['SUPERVISOR', SUPERVISOR], ['ADMIN_AREA', ADMIN]])('%s: revisar y guardar', async (_n, user) => {
    const rev = await subir(user, async (rq) => rq.attach('archivo', await libro(), 'p.xlsx'));
    expect(rev.status).toBe(200);
    expect(rev.body.data).toMatchObject({ filas: [{ usr_id: 7, nombre: 'Ana X', valores: { Osarios: 10, 'Bóvedas': 0 } }], errores: [] });
    expect(rev.body.data.cambios).toHaveLength(1);
    const g = await request(await app(user)).post('/api/sv/presupuestos').send({ ...QUERY, filas: [{ usr_id: 7, valores: { Osarios: 10 } }] });
    expect(g.status).toBe(200);
    expect(g.body.data).toEqual({ guardados: 1, cambios: 1 });
  });

  test.each([
    ['ASESOR', quien('ASESOR')], ['COORDINADOR', quien('COORDINADOR_PREVISION')],
    ['DIRECTOR', quien('DIRECTOR_COMERCIAL', { areasExtra: [{ area_id: 1 }] })], ['GERENTE', quien('GERENTE_GENERAL', { areasExtra: [{ area_id: 1 }] })]
  ])('%s: 403 en plantilla, revisar y guardar', async (_n, user) => {
    const a = request(await app(user));
    expect((await a.get('/api/sv/presupuestos/plantilla').query(QUERY)).status).toBe(403);
    expect((await a.post('/api/sv/presupuestos').send({ ...QUERY, filas: [{ usr_id: 7, valores: { Osarios: 1 } }] })).status).toBe(403);
    const rev = await subir(user, async (rq) => rq.attach('archivo', await libro(), 'p.xlsx'));
    expect(rev.status).toBe(403);
    expect(rev.body.error).toBe('FORBIDDEN');
    expect(M.sequelize.transaction).not.toHaveBeenCalled();
  });

  test('revisar sin archivo → 422', async () => {
    const r = await subir(SUPERVISOR);
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ success: false, error: 'VALIDATION_ERROR', message: 'Falta el archivo' });
  });

  test('un archivo de más de 2 MB → 422, sin leerlo', async () => {
    const r = await subir(SUPERVISOR, (rq) => rq.attach('archivo', Buffer.alloc(2 * 1024 * 1024 + 1), 'p.xlsx'));
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ success: false, error: 'VALIDATION_ERROR', message: 'El archivo supera 2 MB' });
    expect(M.SvProducto.findAll).not.toHaveBeenCalled();
  });

  test('un archivo que no es .xlsx → 422', async () => {
    const r = await subir(SUPERVISOR, (rq) => rq.attach('archivo', Buffer.from('a,b'), 'p.csv'));
    expect(r.status).toBe(422);
    expect(r.body.message).toBe('Sube el archivo en formato .xlsx');
  });

  test('un archivo .xlsx falso → error del libro, sin fila ni columna', async () => {
    const r = await subir(SUPERVISOR, (rq) => rq.attach('archivo', Buffer.from('no soy excel'), 'p.xlsx'));
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ filas: [], cambios: [], errores: [{ fila: null, columna: null, mensaje: 'El archivo no es un Excel válido' }] });
  });

  test('quien no puede cargar recibe 403 antes de validar o leer lo enviado', async () => {
    const a = request(await app(quien('ASESOR')));
    expect((await a.post('/api/sv/presupuestos/revisar').field('area_id', '1')).status).toBe(403);
    expect((await a.post('/api/sv/presupuestos').send({ ...QUERY, filas: [] })).status).toBe(403);
    expect((await a.get('/api/sv/presupuestos/plantilla').query({ area_id: 'x' })).status).toBe(403);
  });

  test('periodo inválido en revisar y en guardar → 422', async () => {
    const r = await subir(SUPERVISOR, async (rq) => rq.attach('archivo', await libro(), 'p.xlsx'), { ...QUERY, mes: 13 });
    expect(r.status).toBe(422);
    const g = await request(await app(SUPERVISOR)).post('/api/sv/presupuestos').send({ ...QUERY, filas: [] });
    expect(g.status).toBe(422);
    const h = await request(await app(SUPERVISOR)).post('/api/sv/presupuestos').send({ ...QUERY, filas: [{ usr_id: 7, valores: { Osarios: 1.5 } }] });
    expect(h.status).toBe(422);
    expect(M.sequelize.transaction).not.toHaveBeenCalled();
  });

  test('un asesor fuera del alcance al guardar → 403', async () => {
    const g = await request(await app(SUPERVISOR)).post('/api/sv/presupuestos').send({ ...QUERY, filas: [{ usr_id: 99, valores: { Osarios: 1 } }] });
    expect(g.status).toBe(403);
  });
});
