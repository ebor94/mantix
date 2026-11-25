jest.mock('../src/masajes/utils/zipSeguro', () => ({ inspeccionarZip: jest.fn() }));

const ExcelJS = require('exceljs');
const { inspeccionarZip } = require('../src/masajes/utils/zipSeguro');
const x = require('../src/sv/services/presupuestosExcel.service');

const CATS = ['Osarios', 'Bóvedas'];
const CTX = { areaId: 1, anio: 2026, mes: 11, categorias: CATS };
const ASESORES = [{ usr_id: 7, nombre: 'Ana Pérez' }, { usr_id: 8, nombre: 'Beto Ruiz' }];
const FILAS = [
  { usr_id: 7, usuario_red: 'aperez', nombre: 'Ana Pérez', valores: { Osarios: 14000000, 'Bóvedas': 500 } },
  { usr_id: 8, usuario_red: 'bruiz', nombre: 'Beto Ruiz', valores: { Osarios: 0, 'Bóvedas': 2500000 } }
];
const leer = (buf, extra = {}) => x.leer(buf, { ...CTX, asesores: ASESORES, ...extra });
const base = () => x.escribir({ titulo: 'Presupuesto', ...CTX, filas: FILAS });
const error = (p) => p.then(() => null, (e) => e);

// Abre el libro, lo cambia y lo vuelve a guardar.
async function modificado(cambiar, buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf || await base());
  cambiar(wb.getWorksheet('Presupuesto'), wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeEach(() => inspeccionarZip.mockReset());

describe('escribir', () => {
  test('hoja, encabezados, formato y hoja oculta', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await base());
    const ws = wb.getWorksheet('Presupuesto');
    expect(ws.getCell('A1').value).toBe('Presupuesto');
    expect(ws.getCell('A1').font.bold).toBe(true);
    expect(ws.getCell('A2').value).toBe('Cambia solo los valores. No agregues filas ni columnas.');
    expect(ws.getRow(3).values.slice(1)).toEqual(['ID', 'Usuario de red', 'Asesor', 'Osarios', 'Bóvedas', 'Total']);
    expect(ws.getCell('A3').font.bold).toBe(true);
    expect(ws.getRow(4).values.slice(1, 4)).toEqual([7, 'aperez', 'Ana Pérez']);
    expect(ws.getCell('D4').value).toBe(14000000);
    expect(ws.getCell('D4').numFmt).toBe('#,##0');
    expect(ws.getCell('F4').value.formula).toBe('SUM(D4:E4)');
    expect(ws.getCell('F4').value.result).toBe(14000500);
    expect(ws.getCell('F4').numFmt).toBe('#,##0');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', xSplit: 2, ySplit: 3 });
    const datos = wb.getWorksheet('_datos');
    expect(datos.state).toBe('veryHidden');
    expect([1, 2, 3, 4].map((r) => datos.getCell(`A${r}`).value)).toEqual(['presupuesto-genflow', 1, 2026, 11]);
  });

  test('el nombre del archivo: área en minúscula y sin tildes', () => {
    expect(x.nombreArchivo({ areaNombre: 'Prenecesidad', anio: 2026, mes: 3 })).toBe('presupuesto-prenecesidad-2026-03.xlsx');
    expect(x.nombreArchivo({ areaNombre: 'Previsión Empresarial', anio: 2026, mes: 12 })).toBe('presupuesto-prevision-empresarial-2026-12.xlsx');
  });
});

describe('leer', () => {
  test('lo escrito se lee igual, sin errores', async () => {
    const r = await leer(await base());
    expect(r.errores).toEqual([]);
    expect(r.filas).toEqual([
      { usr_id: 7, nombre: 'Ana Pérez', valores: { Osarios: 14000000, 'Bóvedas': 500 } },
      { usr_id: 8, nombre: 'Beto Ruiz', valores: { Osarios: 0, 'Bóvedas': 2500000 } }
    ]);
    expect(inspeccionarZip).toHaveBeenCalledTimes(1);
  });

  test('una fórmula se toma por su resultado guardado, sin evaluarla', async () => {
    const buf = await modificado((ws) => { ws.getCell('D4').value = { formula: '1+1', result: 3000 }; });
    expect((await leer(buf)).filas[0].valores.Osarios).toBe(3000);
  });

  test.each([
    ['texto con puntos', '14.000.000', 14000000],
    ['texto con comas', '14,000,000', 14000000],
    ['texto con signo de pesos', '$ 1.500', 1500],
    ['texto con espacios', ' 250 ', 250],
    ['vacía', null, 0],
    ['solo espacios', '   ', 0]
  ])('%s', async (_n, valor, esperado) => {
    const buf = await modificado((ws) => { ws.getCell('D4').value = valor; });
    const r = await leer(buf);
    expect(r.errores).toEqual([]);
    expect(r.filas[0].valores.Osarios).toBe(esperado);
  });

  test.each([
    ['decimal', 1.5], ['negativo', -3], ['texto', 'mucho'], ['texto con decimales', '1.5'],
    ['mayor al máximo', 1000000000000], ['booleano', true]
  ])('un valor inválido (%s): error con fila y columna, el resto se lee', async (_n, valor) => {
    const buf = await modificado((ws) => { ws.getCell('E4').value = valor; });
    const r = await leer(buf);
    expect(r.errores).toEqual([{ fila: 4, columna: 'E (Bóvedas)', mensaje: expect.stringMatching(/entero de 0 a 999\.999\.999\.999/) }]);
    expect(r.filas.map((f) => f.usr_id)).toEqual([8]);
  });

  test('el máximo exacto es válido', async () => {
    const buf = await modificado((ws) => { ws.getCell('D4').value = 999999999999; });
    expect((await leer(buf)).filas[0].valores.Osarios).toBe(999999999999);
  });

  test('los mensajes no repiten el valor de la celda', async () => {
    const buf = await modificado((ws) => { ws.getCell('D4').value = 'secreto-123'; });
    expect(JSON.stringify((await leer(buf)).errores)).not.toMatch(/secreto/);
  });

  test('las categorías se buscan por su encabezado, en cualquier orden', async () => {
    const buf = await modificado((ws) => {
      ws.getCell('D3').value = 'Bóvedas'; ws.getCell('E3').value = 'Osarios';
    });
    const f = (await leer(buf)).filas[0];
    expect(f.valores).toEqual({ Osarios: 500, 'Bóvedas': 14000000 });
  });

  describe('errores de fila', () => {
    test('ID vacío en una fila con asesor', async () => {
      const buf = await modificado((ws) => { ws.getCell('A4').value = null; });
      const r = await leer(buf);
      expect(r.errores).toEqual([{ fila: 4, columna: 'A (ID)', mensaje: 'Falta el ID del asesor' }]);
      expect(r.filas).toHaveLength(1);
    });

    test('ID repetido', async () => {
      const buf = await modificado((ws) => { ws.getCell('A5').value = 7; });
      const r = await leer(buf);
      expect(r.errores).toEqual([{ fila: 5, columna: 'A (ID)', mensaje: 'Este asesor está repetido en el archivo' }]);
      expect(r.filas.map((f) => f.usr_id)).toEqual([7]);
    });

    test('ID que no es número', async () => {
      const buf = await modificado((ws) => { ws.getCell('A4').value = 'abc'; });
      expect((await leer(buf)).errores[0]).toMatchObject({ fila: 4, columna: 'A (ID)' });
    });

    test('asesor fuera del alcance o inactivo', async () => {
      const r = await leer(await base(), { asesores: [ASESORES[1]] });
      expect(r.errores).toEqual([{ fila: 4, columna: 'A (ID)', mensaje: 'Este asesor no está activo o no está a tu alcance' }]);
      expect(r.filas.map((f) => f.usr_id)).toEqual([8]);
    });

    test('las filas vacías (también al final) se ignoran', async () => {
      const buf = await modificado((ws) => { ws.getCell('A9').value = null; ws.getCell('D12').value = ''; });
      const r = await leer(buf);
      expect(r.errores).toEqual([]);
      expect(r.filas).toHaveLength(2);
    });

    test('una celda suelta lejos no hace recorrer toda la hoja', async () => {
      const buf = await modificado((ws) => { ws.getCell('A1048576').value = 'x'; });
      const r = await leer(buf);
      expect(r.filas).toHaveLength(2);
    });
  });

  describe('errores del libro', () => {
    const falla = async (buf, mensaje, extra) => {
      const e = await error(leer(buf, extra));
      expect(e).toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringMatching(mensaje) });
    };

    test('sin la hoja _datos', async () => {
      await falla(await modificado((_ws, wb) => wb.removeWorksheet('_datos')), /no es la plantilla/);
    });
    test('con otra marca', async () => {
      await falla(await modificado((_ws, wb) => { wb.getWorksheet('_datos').getCell('A1').value = 'otro'; }), /no es la plantilla/);
    });
    test('de otro mes', async () => {
      await falla(await base(), /no es de diciembre de 2026/, { mes: 12 });
    });
    test('de otro año', async () => {
      await falla(await base(), /no es de noviembre de 2027/, { anio: 2027 });
    });
    test('de otra área', async () => {
      await falla(await base(), /otra área/, { areaId: 2 });
    });
    test('sin la hoja Presupuesto', async () => {
      await falla(await modificado((_ws, wb) => { wb.getWorksheet('Presupuesto').name = 'Otra'; }), /hoja "Presupuesto"/);
    });
    test('un encabezado de categoría desconocido', async () => {
      await falla(await modificado((ws) => { ws.getCell('E3').value = 'Inventada'; }), /columna E.*desconocida/);
    });
    test('falta una categoría', async () => {
      await falla(await base(), /Falta la columna de la categoría "Cremación"/, { categorias: [...CATS, 'Cremación'] });
    });
    test('categoría repetida', async () => {
      await falla(await modificado((ws) => { ws.getCell('E3').value = 'Osarios'; }), /repetida/);
    });
    test('más de 300 filas', async () => {
      const buf = await modificado((ws) => {
        for (let i = 0; i < 301; i++) { ws.getCell(`A${4 + i}`).value = 1000 + i; ws.getCell(`D${4 + i}`).value = 1; }
      });
      await falla(buf, /más de 300 filas/);
    });
    test('300 filas sí', async () => {
      const buf = await modificado((ws) => {
        for (let i = 0; i < 300; i++) { ws.getCell(`A${4 + i}`).value = 1000 + i; ws.getCell(`D${4 + i}`).value = 1; }
      });
      // Se aceptan: los ids ya no son los de ASESORES, así que cada fila es un error de alcance.
      expect((await leer(buf)).errores).toHaveLength(300);
    });
    test('un archivo que no es xlsx', async () => {
      await falla(Buffer.from('esto no es un excel, pero es largo largo largo largo largo'), /no es un Excel válido/);
    });
    test('un zip sospechoso', async () => {
      inspeccionarZip.mockImplementation(() => { throw Object.assign(new Error('x'), { motivo: 'VALIDACION' }); });
      await falla(await base(), /no es un Excel válido/);
    });
  });
});
