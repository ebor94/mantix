const request = require('supertest');
const ExcelJS = require('exceljs');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');

afterEach(cerrarServidores);

const P = '/api/horno/v1';
const get = async (app, ruta) => request(await servir(app)).get(`${P}${ruta}`).set('Authorization', `Bearer ${tokenDe()}`);
const binario = (res, cb) => {
  const partes = [];
  res.on('data', (c) => partes.push(c));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};
const LECTURA = {
  id: 16, registrado_en: '2026-11-22 14:05:30', fecha_hmi: '2026-11-22 14:05:30',
  temp_combustion: 338, temp_postcombustion: 469, temp_chimenea: 102, co: 4,
  oxigeno: 18.63, co_mg_m3: 4.576, ccr: 4.7, ccr_o2_ref: 19.7,
};

test('todas las rutas de lecturas exigen token', async () => {
  const { app } = crearAppPrueba();
  for (const [ruta, codigo] of [
    ['/lecturas/ultima', 'HOR-LEC-001'], ['/lecturas/serie', 'HOR-LEC-002'],
    ['/lecturas', 'HOR-LEC-003'], ['/lecturas.xlsx', 'HOR-LEC-004'],
  ]) {
    const r = await request(await servir(app)).get(`${P}${ruta}`);
    expect([ruta, r.status, r.body.error]).toEqual([ruta, 401, codigo]);
  }
});

test('/lecturas/ultima devuelve lo del servicio', async () => {
  const { app, deps } = crearAppPrueba();
  deps.lecturas.ultima.mockResolvedValue({ lectura: LECTURA, minutosSinDatos: 2 });
  const r = await get(app, '/lecturas/ultima');
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ success: true, data: { lectura: LECTURA, minutosSinDatos: 2 } });
});

test('/lecturas/serie valida el rango y pasa los días al servicio', async () => {
  const { app, deps } = crearAppPrueba();
  deps.lecturas.serie.mockResolvedValue({ agrupacion: 'crudo', puntos: [] });
  const r = await get(app, '/lecturas/serie?desde=2026-11-22&hasta=2026-11-22');
  expect(r.status).toBe(200);
  expect(deps.lecturas.serie).toHaveBeenCalledWith({
    desde: '2026-11-22 00:00:00', hasta: '2026-11-22 23:59:59', dias: 86399 / 86400,
  });
  const malo = await get(app, '/lecturas/serie?desde=hoy');
  expect(malo.status).toBe(400);
  expect(malo.body.motivo).toBe('VALIDACION');
});

test('/lecturas pagina con valores por defecto y valida página y tamaño', async () => {
  const { app, deps } = crearAppPrueba();
  deps.lecturas.listar.mockResolvedValue({ filas: [], total: 0, pagina: 1, tamano: 50 });
  const r = await get(app, '/lecturas?desde=2026-11-01&hasta=2026-11-22');
  expect(r.status).toBe(200);
  expect(deps.lecturas.listar).toHaveBeenCalledWith(expect.objectContaining({ pagina: 1, tamano: 50, desde: '2026-11-01 00:00:00' }));
  for (const q of ['pagina=0', 'tamano=501', 'tamano=abc']) {
    const malo = await get(app, `/lecturas?desde=2026-11-01&hasta=2026-11-22&${q}`);
    expect([q, malo.status]).toEqual([q, 400]);
  }
});

test('/lecturas.xlsx entrega un Excel con encabezados y filas', async () => {
  const { app, deps } = crearAppPrueba();
  deps.lecturas.contar.mockResolvedValue(1);
  deps.lecturas.filasParaExcel.mockResolvedValue([LECTURA]);
  const r = await request(await servir(app)).get(`${P}/lecturas.xlsx?desde=2026-11-01&hasta=2026-11-22`)
    .set('Authorization', `Bearer ${tokenDe()}`).buffer(true).parse(binario);
  expect(r.status).toBe(200);
  expect(r.headers['content-type']).toMatch(/spreadsheetml/);
  expect(r.headers['content-disposition']).toBe('attachment; filename="horno_incol_20261101_20261122.xlsx"');
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(r.body);
  const hoja = libro.getWorksheet('Lecturas');
  expect(hoja.getRow(1).values.slice(1)).toEqual([
    'Fecha y hora', 'Temp. combustión (°C)', 'Temp. postcombustión (°C)', 'Temp. chimenea (°C)',
    'CO (ppm)', 'Oxígeno (%)', 'CO (mg/m³)', 'Ccr', 'Ccr O2 ref.',
  ]);
  expect(hoja.getRow(2).values.slice(1)).toEqual(['2026-11-22 14:05:30', 338, 469, 102, 4, 18.63, 4.576, 4.7, 19.7]);
});

test('/lecturas.xlsx responde 413 si supera el límite', async () => {
  const { app, deps } = crearAppPrueba();
  deps.lecturas.contar.mockResolvedValue(100001);
  const r = await get(app, '/lecturas.xlsx?desde=2026-01-01&hasta=2026-11-22');
  expect(r.status).toBe(413);
  expect(r.body).toMatchObject({ error: 'HOR-LEC-004', motivo: 'DEMASIADOS_REGISTROS' });
  expect(deps.lecturas.filasParaExcel).not.toHaveBeenCalled();
});
