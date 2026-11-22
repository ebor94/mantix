const { crearServicioLecturas, agrupacionPara, VARIABLES } = require('../services/lecturas.service');

// bd falsa: cada llamada a query devuelve la siguiente respuesta de la lista y registra (sql, params).
function bdFalsa(...respuestas) {
  const query = jest.fn(async () => [respuestas.shift() ?? []]);
  return { bd: { obtener: () => ({ query }) }, query };
}

const fila = (extra = {}) => ({
  id_local: 16, registrado_en: '2026-11-22 14:05:30', fecha_hmi: '2026-11-22 14:05:30',
  temp_combustion: '338.0', temp_postcombustion: '469.0', temp_chimenea: '102.0', co: '4.0',
  oxigeno: '18.63', co_mg_m3: '4.576', ccr: '4.7', ccr_o2_ref: null, ...extra,
});

test('agrupación automática por tamaño del rango', () => {
  expect(agrupacionPara(1)).toBe('crudo');
  expect(agrupacionPara(2)).toBe('crudo');
  expect(agrupacionPara(7)).toBe('hora');
  expect(agrupacionPara(31)).toBe('hora');
  expect(agrupacionPara(31.5)).toBe('dia');
});

test('VARIABLES define las 8 columnas del horno', () => {
  expect(VARIABLES.map((v) => v.campo)).toEqual([
    'temp_combustion', 'temp_postcombustion', 'temp_chimenea', 'co', 'oxigeno', 'co_mg_m3', 'ccr', 'ccr_o2_ref',
  ]);
});

test('ultima convierte los DECIMAL a número y devuelve los minutos sin datos', async () => {
  const { bd, query } = bdFalsa([{ ...fila(), minutos_sin_datos: 3 }]);
  const r = await crearServicioLecturas({ bd }).ultima();
  expect(r).toEqual({
    minutosSinDatos: 3,
    lectura: {
      id: 16, registrado_en: '2026-11-22 14:05:30', fecha_hmi: '2026-11-22 14:05:30',
      temp_combustion: 338, temp_postcombustion: 469, temp_chimenea: 102, co: 4,
      oxigeno: 18.63, co_mg_m3: 4.576, ccr: 4.7, ccr_o2_ref: null,
    },
  });
  expect(query.mock.calls[0][1]).toEqual(['HORNO-INCOL']);
  expect(query.mock.calls[0][0]).toMatch(/ORDER BY lecturas\.registrado_en DESC, lecturas\.id_local DESC LIMIT 1/);
});

test('ultima sin datos devuelve lectura null', async () => {
  const { bd } = bdFalsa([]);
  expect(await crearServicioLecturas({ bd }).ultima()).toEqual({ lectura: null, minutosSinDatos: null });
});

test('serie cruda repite el valor en prom, min y max', async () => {
  const { bd, query } = bdFalsa([{ t: '2026-11-22 14:05:30', ...fila() }]);
  const r = await crearServicioLecturas({ bd }).serie({ desde: '2026-11-22 00:00:00', hasta: '2026-11-22 23:59:59', dias: 1 });
  expect(r.agrupacion).toBe('crudo');
  expect(r.puntos[0].t).toBe('2026-11-22 14:05:30');
  expect(r.puntos[0].oxigeno).toEqual({ prom: 18.63, min: 18.63, max: 18.63 });
  expect(r.puntos[0].ccr_o2_ref).toEqual({ prom: null, min: null, max: null });
  expect(query.mock.calls[0][1]).toEqual(['HORNO-INCOL', '2026-11-22 00:00:00', '2026-11-22 23:59:59']);
  expect(query.mock.calls[0][0]).not.toMatch(/GROUP BY/);
});

test('serie por hora agrupa con promedio redondeado, mínimo y máximo', async () => {
  const { bd, query } = bdFalsa([{ t: '2026-11-22 14:00:00', oxigeno_prom: '18.6166', oxigeno_min: '18.61', oxigeno_max: '18.63' }]);
  const r = await crearServicioLecturas({ bd }).serie({ desde: '2026-11-15 00:00:00', hasta: '2026-11-22 23:59:59', dias: 8 });
  expect(r.agrupacion).toBe('hora');
  expect(r.puntos[0].oxigeno).toEqual({ prom: 18.62, min: 18.61, max: 18.63 });
  expect(query.mock.calls[0][0]).toMatch(/%Y-%m-%d %H:00:00/);
  expect(query.mock.calls[0][0]).toMatch(/GROUP BY t ORDER BY t/);
});

test('serie por día usa el formato de fecha', async () => {
  const { bd, query } = bdFalsa([]);
  const r = await crearServicioLecturas({ bd }).serie({ desde: '2026-01-01 00:00:00', hasta: '2026-11-22 23:59:59', dias: 325 });
  expect(r).toEqual({ agrupacion: 'dia', puntos: [] });
  expect(query.mock.calls[0][0]).toMatch(/'%Y-%m-%d'\) AS t/);
});

test('listar pagina de más reciente a más antiguo con total', async () => {
  const { bd, query } = bdFalsa([{ total: 120 }], [fila()]);
  const r = await crearServicioLecturas({ bd }).listar({ desde: 'a', hasta: 'b', pagina: 3, tamano: 50 });
  expect(r.total).toBe(120);
  expect(r.pagina).toBe(3);
  expect(r.tamano).toBe(50);
  expect(r.filas[0].oxigeno).toBe(18.63);
  expect(query.mock.calls[1][0]).toMatch(/ORDER BY lecturas\.registrado_en DESC, lecturas\.id_local DESC LIMIT \? OFFSET \?/);
  expect(query.mock.calls[1][1]).toEqual(['HORNO-INCOL', 'a', 'b', 50, 100]);
});

test('filasParaExcel ordena de más antiguo a más reciente', async () => {
  const { bd, query } = bdFalsa([fila()]);
  const filas = await crearServicioLecturas({ bd }).filasParaExcel({ desde: 'a', hasta: 'b' });
  expect(filas).toHaveLength(1);
  expect(query.mock.calls[0][0]).toMatch(/ORDER BY lecturas\.registrado_en, lecturas\.id_local$/);
});
