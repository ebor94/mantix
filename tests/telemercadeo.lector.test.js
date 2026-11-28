const ExcelJS = require('exceljs');
const { leerLibro, fechaIso, telefonos } = require('../src/sv/services/telemercadeo.lector');

const LIBRO = '11. NOVIEMBRE 2026 TELEMERCADEO.xlsx';
const fecha = (a, m, d) => new Date(Date.UTC(a, m - 1, d));
const enBuffer = async (wb) => Buffer.from(await wb.xlsx.writeBuffer());

// La plantilla real de Prenecesidad, con datos inventados:
// - título en la fila 2 y ASESOR/FECHA en la 3
// - encabezado combinado en las filas 4 y 5, con INTER partido en S y N
// - datos desde la fila 6 y la lista auxiliar del desplegable en la columna T
function hojaPlantilla(wb, nombre, filas, { fecha: valorFecha } = {}) {
  const ws = wb.addWorksheet(nombre);
  ws.getCell('B2').value = 'TELEMERCADEO';
  ws.mergeCells('B2:I2');
  ws.getCell('B3').value = 'ASESOR:';
  ws.getCell('G3').value = 'FECHA:';
  if (valorFecha !== undefined) ws.getCell('H3').value = valorFecha;
  ws.getCell('T3').value = 'LISTA';
  const titulos = { B: 'N°', C: 'HORA', D: 'NOMBRE', E: 'TELEFONO', F: 'COMENTARIO', G: 'PRODUCTO', J: 'PUNTO DE ATENCION', K: 'PROXIMA GESTION' };
  for (const [col, t] of Object.entries(titulos)) {
    ws.getCell(`${col}4`).value = t;
    ws.mergeCells(`${col}4:${col}5`);
  }
  ws.getCell('H4').value = 'INTER';
  ws.mergeCells('H4:I4');
  ws.getCell('H5').value = 'S';
  ws.getCell('I5').value = 'N';
  ws.getCell('L4').value = 'OBSERVACIONES:';
  ws.mergeCells('L4:R4');
  ws.mergeCells('L5:R8');
  ['TELEMERCADEO', 'GRAN COLOMBIA', 'PARQUE', 'SAN JOSE', 'REFERIDO', 'ENCUESTA', 'TITULO', 'OTRO', 'BASE DE EXHUMACION']
    .forEach((v, i) => { ws.getCell(`T${4 + i}`).value = v; });
  filas.forEach((f, i) => {
    const r = 6 + i;
    ws.getCell(`B${r}`).value = i + 1;
    const columnas = { C: f.hora, D: f.nombre, E: f.tel, F: f.comentario, G: f.producto, H: f.s, I: f.n, J: f.punto, K: f.proxima };
    for (const [col, v] of Object.entries(columnas)) if (v !== undefined) ws.getCell(`${col}${r}`).value = v;
  });
  return ws;
}

describe('leerLibro', () => {
  it('lee la plantilla real: encabezado combinado, S/N, fecha del nombre de la hoja y año del archivo', async () => {
    const wb = new ExcelJS.Workbook();
    hojaPlantilla(wb, '28 DE NOVIEMBRE', [{
      hora: 'venta', nombre: '  Ana   Pérez ', tel: 3001234567, comentario: '24/11/2026 Se llama //13/11/2026 Se escribe',
      producto: 'Osario,  cremacion', s: 'x', punto: 'REFERIDO', proxima: fecha(2026, 11, 28)
    }]);
    const { filas, incidencias } = await leerLibro(await enBuffer(wb), LIBRO);
    expect(incidencias).toEqual([]);
    expect(filas).toEqual([{
      hoja: '28 DE NOVIEMBRE', fechaHoja: '2026-11-28', fila: 6, nombre: 'Ana Pérez',
      telefonoOriginal: '3001234567', telefonos: ['3001234567'], hora: 'venta',
      comentario: '24/11/2026 Se llama //13/11/2026 Se escribe', producto: 'Osario, cremacion',
      interes: 'S', punto: 'REFERIDO', proxima: '2026-11-28', descarte: null
    }]);
  });

  it('la casilla FECHA manda sobre el nombre de la hoja', async () => {
    const wb = new ExcelJS.Workbook();
    hojaPlantilla(wb, 'LUNES', [{ nombre: 'Beto Ruiz', tel: '3109998877', s: 'x' }], { fecha: fecha(2026, 11, 30) });
    const { filas, incidencias } = await leerLibro(await enBuffer(wb), 'telemercadeo.xlsx');
    expect(incidencias).toEqual([]);
    expect(filas[0].fechaHoja).toBe('2026-11-30');
  });

  it('una hoja sin fecha posible va a incidencias y no se carga', async () => {
    const wb = new ExcelJS.Workbook();
    hojaPlantilla(wb, '28 DE NOVIEMBRE', [{ nombre: 'Ana', tel: '3001234567' }]);
    const { filas, incidencias } = await leerLibro(await enBuffer(wb), 'telemercadeo.xlsx');
    expect(filas).toEqual([]);
    expect(incidencias).toEqual([{
      hoja: '28 DE NOVIEMBRE', fila: null, tipo: 'error', mensaje: expect.stringContaining('no se pudo saber la fecha de la hoja')
    }]);
  });

  it('una hoja sin columna TELEFONO va a incidencias', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('28 DE NOVIEMBRE');
    ws.getCell('B4').value = 'NOMBRE';
    ws.getCell('B5').value = 'Ana';
    const { filas, incidencias } = await leerLibro(await enBuffer(wb), LIBRO);
    expect(filas).toEqual([]);
    expect(incidencias).toEqual([{
      hoja: '28 DE NOVIEMBRE', fila: null, tipo: 'error', mensaje: expect.stringContaining('NOMBRE y TELEFONO')
    }]);
  });

  it('salta las filas con solo N° y lee teléfonos dobles, de más e inválidos', async () => {
    const wb = new ExcelJS.Workbook();
    hojaPlantilla(wb, '28 DE NOVIEMBRE', [
      { nombre: 'Beto', tel: '3001112233  -3109998877', s: 'x' },
      {},
      { nombre: 'Caro', tel: '12', s: 'x' },
      { nombre: 'Dani', tel: '3001112234 / 3001112235 / 3001112236', n: 'x' }
    ]);
    const { filas, incidencias } = await leerLibro(await enBuffer(wb), LIBRO);
    expect(filas.map((f) => [f.nombre, f.fila, f.telefonos, f.descarte])).toEqual([
      ['Beto', 6, ['3001112233', '3109998877'], null],
      ['Caro', 8, [], { resultado: 'error', detalle: 'teléfono inválido' }],
      ['Dani', 9, ['3001112234', '3001112235'], null]
    ]);
    expect(incidencias).toEqual([
      { hoja: '28 DE NOVIEMBRE', fila: 8, tipo: 'error', mensaje: 'teléfono inválido: 12' },
      { hoja: '28 DE NOVIEMBRE', fila: 9, tipo: 'aviso', mensaje: 'trae 3 teléfonos; se usan los dos primeros' }
    ]);
  });

  it('un cliente repetido entre hojas: gana la hoja con fecha más reciente', async () => {
    const wb = new ExcelJS.Workbook();
    hojaPlantilla(wb, '30 DE NOVIEMBRE', [{ nombre: 'Ana', tel: '3001234567', comentario: 'nuevo', s: 'x' }]);
    hojaPlantilla(wb, '28 DE NOVIEMBRE', [{ nombre: 'Ana', tel: '300 123 4567', comentario: 'viejo', s: 'x' }]);
    const { filas } = await leerLibro(await enBuffer(wb), LIBRO);
    expect(filas.map((f) => [f.hoja, f.descarte])).toEqual([
      ['30 DE NOVIEMBRE', null],
      ['28 DE NOVIEMBRE', { resultado: 'omitido', detalle: 'reemplazada por 30 DE NOVIEMBRE fila 6' }]
    ]);
  });

  it('lee fórmulas por su resultado, la próxima gestión en texto y las marcas de interés', async () => {
    const wb = new ExcelJS.Workbook();
    hojaPlantilla(wb, '28 DE NOVIEMBRE', [
      { nombre: { formula: 'CONCAT("Ana"," Ruiz")', result: 'Ana Ruiz' }, tel: '3001234567', s: 'x', n: 'x', proxima: '30/11/2026' },
      { nombre: 'Beto', tel: '3109998877', proxima: 'mañana' }
    ]);
    const { filas, incidencias } = await leerLibro(await enBuffer(wb), LIBRO);
    expect(filas.map((f) => [f.nombre, f.interes, f.proxima])).toEqual([['Ana Ruiz', 'SN', '2026-11-30'], ['Beto', '', null]]);
    expect(incidencias).toEqual([{ hoja: '28 DE NOVIEMBRE', fila: 7, tipo: 'aviso', mensaje: 'próxima gestión no se pudo leer: mañana' }]);
  });
});

describe('fechaIso', () => {
  it.each([
    [new Date(Date.UTC(2026, 10, 28)), '2026-11-28'],
    [46353, '2026-11-27'],
    ['5/1/2026', '2026-01-05'],
    ['30-11-2026', '2026-11-30'],
    ['31/02/2026', null],
    ['mañana', null],
    [null, null]
  ])('%p → %p', (v, esperado) => expect(fechaIso(v)).toBe(esperado));
});

describe('telefonos', () => {
  it.each([
    [3001234567, ['3001234567']],
    ['3001234567  -  3101234567', ['3001234567', '3101234567']],
    ['607-5712345', ['6075712345']],
    ['30012345673101234567', ['3001234567', '3101234567']],
    ['+57 300 123 4567', ['3001234567']],
    ['3001234567 y 3001234567', ['3001234567']],
    ['', []]
  ])('%p → %p', (v, esperado) => expect(telefonos(v).validos).toEqual(esperado));
});
