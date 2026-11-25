jest.mock('../src/masajes/utils/zipSeguro', () => ({ inspeccionarZip: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const childProcess = require('child_process');
const { EventEmitter } = require('events');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { inspeccionarZip } = require('../src/masajes/utils/zipSeguro');
const logger = require('../src/utils/logger');
const zlib = require('zlib');
const path = require('path');
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

// Cambia el XML de la hoja Presupuesto de un libro bueno.
async function conXml(cambiar) {
  const zip = await JSZip.loadAsync(await base());
  const nombre = Object.keys(zip.files).find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n));
  zip.file(nombre, cambiar(await zip.file(nombre).async('string')));
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}


beforeEach(() => { inspeccionarZip.mockReset(); logger.warn.mockReset(); });

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


  describe('lectura segura', () => {
    test('la bomba de celdas combinadas da error a tiempo y el proceso sigue vivo', async () => {
      const bomba = await conXml((xml) => xml.replace('</sheetData>', '</sheetData><mergeCells count="1"><mergeCell ref="A7:XFD1048576"/></mergeCells>'));
      expect(bomba.length).toBeLessThan(20000);
      const t0 = Date.now();
      const e = await error(leer(bomba));
      expect(e).toMatchObject({ code: 'VALIDATION_ERROR', message: 'El archivo no es un Excel válido o es demasiado grande' });
      expect(Date.now() - t0).toBeLessThan(15000);
      expect((await leer(await base())).filas).toHaveLength(2); // y la siguiente lectura funciona
    }, 30000);

  describe('proceso aparte', () => {
    const MENSAJE = 'El archivo no es un Excel válido o es demasiado grande';
    const validacion = (sqref) => `</sheetData><dataValidations count="1"><dataValidation type="whole" sqref="${sqref}"><formula1>0</formula1></dataValidation></dataValidations>`;
    const nombreDefinido = (ref) => async (buf) => {
      const zip = await JSZip.loadAsync(buf);
      const xml = await zip.file('xl/workbook.xml').async('string');
      zip.file('xl/workbook.xml', xml.includes('<definedNames>')
        ? xml.replace('<definedNames>', `<definedNames><definedName name="N1">${ref}</definedName>`)
        : xml.replace('</sheets>', `</sheets><definedNames><definedName name="N1">${ref}</definedName></definedNames>`));
      return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
    };

    test.each([['D:E completas', 'D1:E1048576'], ['toda la hoja', 'A1:XFD1048576']])('una validación numérica en %s se lee bien', async (_n, rango) => {
      const buf = await conXml((xml) => xml.replace('</sheetData>', validacion(rango)));
      const r = await leer(buf);
      expect(r.errores).toEqual([]);
      expect(r.filas.map((f) => f.valores.Osarios)).toEqual([14000000, 0]);
    }, 30000);

    test.each([
      ['un nombre definido sobre toda la hoja', async () => nombreDefinido('Presupuesto!$A$1:$XFD$1048576')(await base())],
      ['celdas combinadas hasta XFD', () => conXml((xml) => xml.replace('</sheetData>', '</sheetData><mergeCells count="1"><mergeCell ref="A7:XFD1048576"/></mergeCells>'))]
    ])('%s agota la memoria del hijo: error, y enseguida un libro bueno se lee', async (_n, armar) => {
      const e = await error(leer(await armar()));
      expect(e).toMatchObject({ code: 'VALIDATION_ERROR', message: MENSAJE });
      expect((await leer(await base())).filas).toHaveLength(2);
    }, 40000);

    test('el hijo no recibe las claves del padre ni sus opciones de node', async () => {
      process.env.CLAVE_DE_PRUEBA = 'x';
      process.env.NODE_OPTIONS = '--no-warnings';
      const fork = jest.spyOn(childProcess, 'fork');
      try {
        await leer(await base());
        const [ruta, args, opciones] = fork.mock.calls[0];
        expect(ruta).toMatch(/presupuestosExcel\.lector\.js$/);
        expect(args).toEqual([]);
        expect(opciones.execArgv).toEqual(['--max-old-space-size=256']);
        expect(opciones.serialization).toBe('advanced');
        expect(opciones.stdio).toEqual(['ignore', 'ignore', 'ignore', 'ipc']);
        expect(opciones.env.PATH).toBe(process.env.PATH);
        expect(Object.keys(opciones.env).every((k) => ['PATH', 'SystemRoot', 'TEMP', 'TMP'].includes(k))).toBe(true);
        expect(opciones.env.CLAVE_DE_PRUEBA).toBeUndefined();
        expect(opciones.env.NODE_OPTIONS).toBeUndefined();
      } finally {
        fork.mockRestore();
        delete process.env.CLAVE_DE_PRUEBA;
        delete process.env.NODE_OPTIONS;
      }
    });
  });

  describe('proceso aparte simulado', () => {
    const MENSAJE = 'El archivo no es un Excel válido o es demasiado grande';
    let hijos;
    let fork;
    beforeEach(() => {
      jest.useFakeTimers();
      hijos = [];
      fork = jest.spyOn(childProcess, 'fork').mockImplementation(() => {
        const h = new EventEmitter();
        h.pid = 4321;
        h.send = jest.fn((_m, cb) => cb && cb(null));
        h.kill = jest.fn();
        hijos.push(h);
        return h;
      });
    });
    afterEach(() => { fork.mockRestore(); jest.useRealTimers(); });

    const BUF = Buffer.from('x');
    const esperar = () => Promise.resolve().then(() => Promise.resolve());

    test('al vencer los 10 s lo mata con SIGKILL, responde el error y no acepta otra lectura hasta el exit', async () => {
      const p = error(leer(BUF));
      await esperar();
      expect(hijos[0].send).toHaveBeenCalledWith({ buffer: BUF, maxColumna: 6, maxFilas: 300 }, expect.any(Function));
      jest.advanceTimersByTime(9999);
      expect(hijos[0].kill).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(hijos[0].kill).toHaveBeenCalledWith('SIGKILL');
      expect(await error(leer(BUF))).toMatchObject({ code: 'CONFLICT' });
      hijos[0].emit('exit', null, 'SIGKILL');
      expect(await p).toMatchObject({ code: 'VALIDATION_ERROR', message: MENSAJE });
      const otra = leer(BUF);
      await esperar();
      expect(hijos).toHaveLength(2);
      hijos[1].emit('exit', 1);
      await error(otra);
    });

    test('al recibir la respuesta lo mata y libera cuando sale', async () => {
      const p = leer(BUF);
      await esperar();
      hijos[0].emit('message', { ok: true, datos: ['presupuesto-genflow', 1, 2026, 11], hoja: true, celdas: [[3, 4, 'Osarios', 0], [3, 5, 'Bóvedas', 0]] });
      expect(hijos[0].kill).toHaveBeenCalledWith('SIGKILL');
      expect(await error(leer(BUF))).toMatchObject({ code: 'CONFLICT' });
      hijos[0].emit('exit', null, 'SIGKILL');
      expect(await p).toEqual(expect.objectContaining({ filas: [], errores: [] }));
    });

    test('si muere sin responder: error de archivo y queda libre', async () => {
      const p = error(leer(BUF));
      await esperar();
      hijos[0].emit('exit', 134, null);
      expect(await p).toMatchObject({ code: 'VALIDATION_ERROR', message: MENSAJE });
      const otra = leer(BUF);
      await esperar();
      expect(hijos).toHaveLength(2);
      hijos[1].emit('exit', 1);
      await error(otra);
    });

    test('si no arranca (error del fork) no es culpa del archivo: CONFLICT, y vuelve a aceptar', async () => {
      const p = error(leer(BUF));
      await esperar();
      hijos[0].pid = undefined;
      hijos[0].emit('error', new Error('spawn'));
      expect(await p).toMatchObject({ code: 'CONFLICT', message: 'No se pudo leer el archivo. Intenta de nuevo' });
      const otra = leer(BUF);
      await esperar();
      expect(hijos).toHaveLength(2);
      hijos[1].emit('exit', 1);
      await error(otra);
    });

    test('N1: un hijo sin pid ni send (sin descriptores): CONFLICT, nunca llama a kill y acepta la siguiente', async () => {
      fork.mockImplementationOnce(() => {
        const h = new EventEmitter();
        h.kill = jest.fn(); // simulado: un kill real sin pid mataría el grupo de procesos
        hijos.push(h);
        return h;
      });
      expect(await error(leer(BUF))).toMatchObject({ code: 'CONFLICT', message: 'No se pudo leer el archivo. Intenta de nuevo' });
      expect(hijos[0].kill).not.toHaveBeenCalled();
      const otra = leer(BUF);
      await esperar();
      expect(hijos).toHaveLength(2);
      hijos[1].emit('exit', 1);
      await error(otra);
    });

    test('N1: si el hijo no sale tras el kill, a los 2 s responde y libera', async () => {
      const p = error(leer(BUF));
      await esperar();
      jest.advanceTimersByTime(10000);
      expect(hijos[0].kill).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1999);
      expect(await error(leer(BUF))).toMatchObject({ code: 'CONFLICT' });
      jest.advanceTimersByTime(1);
      expect(await p).toMatchObject({ code: 'VALIDATION_ERROR' });
      const otra = leer(BUF);
      await esperar();
      expect(hijos).toHaveLength(2);
      hijos[1].emit('exit', 1);
      await error(otra);
      const tercera = leer(BUF);
      await esperar();
      hijos[0].emit('exit', null, 'SIGKILL'); // un exit tardío no libera la lectura en curso
      expect(await error(leer(BUF))).toMatchObject({ code: 'CONFLICT' });
      hijos[2].emit('exit', 1);
      await error(tercera);
    });

    test('N1: un segundo error del hijo no lanza', async () => {
      const p = error(leer(BUF));
      await esperar();
      expect(() => { hijos[0].emit('error', new Error('a')); hijos[0].emit('error', new Error('b')); }).not.toThrow();
      hijos[0].emit('exit', null, 'SIGKILL');
      await p;
    });

    test('N1: error sin pid después de que send falló: responde y libera', async () => {
      const p = error(leer(BUF));
      await esperar();
      hijos[0].send.mock.calls[0][1](new Error('canal cerrado'));
      expect(hijos[0].kill).toHaveBeenCalledWith('SIGKILL');
      hijos[0].pid = undefined;
      hijos[0].emit('error', new Error('x'));
      expect(await p).toMatchObject({ code: 'CONFLICT' });
      const otra = leer(BUF);
      await esperar();
      expect(hijos).toHaveLength(2);
      hijos[1].emit('exit', 1);
      await error(otra);
    });

    test('N1: send lanza con pid: mata, CONFLICT y libera al salir', async () => {
      fork.mockImplementationOnce(() => {
        const h = new EventEmitter();
        h.pid = 99;
        h.send = () => { throw new Error('ERR_IPC_CHANNEL_CLOSED'); };
        h.kill = jest.fn();
        hijos.push(h);
        return h;
      });
      const p = error(leer(BUF));
      await esperar();
      expect(hijos[0].kill).toHaveBeenCalledWith('SIGKILL');
      hijos[0].emit('exit', null, 'SIGKILL');
      expect(await p).toMatchObject({ code: 'CONFLICT' });
    });

    test('b3: si el hijo muere sin responder, una línea de log con código y señal, sin el archivo', async () => {
      const p = error(leer(Buffer.from('contenido secreto')));
      await esperar();
      hijos[0].emit('exit', 134, null);
      await p;
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [mensaje, datos] = logger.warn.mock.calls[0];
      expect(datos).toEqual({ codigo: 134, senal: null });
      expect(JSON.stringify([mensaje, datos])).not.toMatch(/secreto/);
    });

    test('b3: si no arranca, el log lleva el code del error', async () => {
      const p = error(leer(BUF));
      await esperar();
      hijos[0].pid = undefined;
      hijos[0].emit('error', Object.assign(new Error('x'), { code: 'EMFILE' }));
      await p;
      expect(logger.warn.mock.calls[0][1]).toEqual({ code: 'EMFILE' });
    });

    test('b3: sin descriptores, send lanza antes que el evento error y el log lleva el code igual', async () => {
      fork.mockImplementationOnce(() => {
        const h = new EventEmitter();
        h.kill = jest.fn(); // sin pid ni send, como en EMFILE
        hijos.push(h);
        return h;
      });
      await error(leer(BUF));
      hijos[0].emit('error', Object.assign(new Error('x'), { code: 'EMFILE' }));
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn.mock.calls[0][1]).toEqual({ code: 'EMFILE' });
    });

    test('si fork lanza o send falla: CONFLICT y queda libre', async () => {
      fork.mockImplementationOnce(() => { throw new Error('ENOMEM'); });
      expect(await error(leer(BUF))).toMatchObject({ code: 'CONFLICT', message: 'No se pudo leer el archivo. Intenta de nuevo' });
      hijos.length = 0;
      const p = error(leer(BUF));
      await esperar();
      hijos[0].send.mock.calls[0][1](new Error('canal cerrado'));
      hijos[0].emit('exit', null, 'SIGKILL');
      expect(await p).toMatchObject({ code: 'CONFLICT', message: 'No se pudo leer el archivo. Intenta de nuevo' });
    });
  });

    test('un archivo que el proceso no puede abrir', async () => {
      const e = await error(leer(Buffer.from('basura que inspeccionarZip (simulado) deja pasar')));
      expect(e).toMatchObject({ code: 'VALIDATION_ERROR', message: 'El archivo no es un Excel válido o es demasiado grande' });
    });

    test('una lectura a la vez', async () => {
      const buf = await base();
      const primera = leer(buf);
      const segunda = await error(leer(buf));
      expect(segunda).toMatchObject({ code: 'CONFLICT', message: 'Se está revisando otro archivo. Intenta en unos segundos' });
      expect((await primera).filas).toHaveLength(2);
      expect((await leer(buf)).filas).toHaveLength(2); // libre otra vez
    });

    test('la inspección del zip usa los topes de la carga', async () => {
      await leer(await base());
      expect(inspeccionarZip).toHaveBeenCalledWith(expect.any(Buffer), { maxDescomprimido: 10 * 1024 * 1024, maxEntradas: 100 });
    });
  });

  describe('valores que nadie escribió', () => {
    test('una celda combinada que no es la principal', async () => {
      const buf = await modificado((ws) => { ws.mergeCells('D4:E4'); });
      const r = await leer(buf);
      expect(r.errores).toEqual([{ fila: 4, columna: 'E (Bóvedas)', mensaje: 'No combines celdas' }]);
      expect(r.filas.map((f) => f.usr_id)).toEqual([8]);
    });

    test('una fórmula sin resultado guardado', async () => {
      const buf = await modificado((ws) => { ws.getCell('D4').value = { formula: '1+1' }; });
      expect((await leer(buf)).errores).toEqual([{ fila: 4, columna: 'D (Osarios)', mensaje: 'Abre el archivo en Excel y guárdalo de nuevo' }]);
    });
  });

  describe('números', () => {
    test.each([
      ['ruido decimal de un cálculo', 14000000.0000001, 14000000],
      ['fórmula con ruido decimal', { formula: '1/3*42000000', result: 13999999.9999999 }, 14000000],
      ['texto con puntos', '1.000.000', 1000000],
      ['cero', '0', 0]
    ])('acepta %s', async (_n, valor, esperado) => {
      const buf = await modificado((ws) => { ws.getCell('D4').value = valor; });
      const r = await leer(buf);
      expect(r.errores).toEqual([]);
      expect(r.filas[0].valores.Osarios).toBe(esperado);
    });

    test.each([
      ['decimal de verdad', 14000000.01], ['medio', 0.5], ['separadores mezclados', '1.234,567'],
      ['separadores mezclados 2', '1,234.567'], ['empieza en 0', '007'], ['miles mal agrupados', '1.00.000'],
      ['miles con cero al inicio', '0.100'], ['dos puntos seguidos', '1..000']
    ])('rechaza %s', async (_n, valor) => {
      const buf = await modificado((ws) => { ws.getCell('D4').value = valor; });
      expect((await leer(buf)).errores).toHaveLength(1);
    });
  });

  describe('qué es una celda', () => {
    test('fórmula compartida: su resultado guardado', async () => {
      const buf = await modificado((ws) => {
        ws.getCell('D4').value = { formula: '1+1', result: 5 };
        ws.getCell('D5').value = { sharedFormula: 'D4', result: 6 };
      });
      const r = await leer(buf);
      expect(r.errores).toEqual([]);
      expect(r.filas.map((f) => f.valores.Osarios)).toEqual([5, 6]);
    });

    test('texto enriquecido', async () => {
      const buf = await modificado((ws) => { ws.getCell('D4').value = { richText: [{ text: '14.' }, { text: '000.000', font: { bold: true } }] }; });
      expect((await leer(buf)).filas[0].valores.Osarios).toBe(14000000);
    });

    test('hipervínculo: el texto visible, nunca el destino', async () => {
      const buf = await modificado((ws) => { ws.getCell('D4').value = { text: '2500', hyperlink: 'https://ejemplo.com/9999' }; });
      expect((await leer(buf)).filas[0].valores.Osarios).toBe(2500);
    });

    test('una fecha no es un valor', async () => {
      const buf = await modificado((ws) => { ws.getCell('D4').value = new Date('2026-01-01T00:00:00Z'); ws.getCell('D4').style = { numFmt: 'yyyy-mm-dd' }; });
      expect((await leer(buf)).errores).toEqual([{ fila: 4, columna: 'D (Osarios)', mensaje: expect.any(String) }]);
    });

    test('una fila con valores pero sin ID', async () => {
      const buf = await modificado((ws) => { ws.getCell('A9').value = null; ws.getCell('D9').value = 5; });
      expect((await leer(buf)).errores).toEqual([{ fila: 9, columna: 'A (ID)', mensaje: 'Falta el ID del asesor' }]);
    });

    test('el nombre debe ser el del ID, sin importar mayúsculas, tildes ni espacios', async () => {
      const ok = await modificado((ws) => { ws.getCell('C4').value = '  ANA   PEREZ '; });
      expect((await leer(ok)).errores).toEqual([]);
      const mal = await modificado((ws) => { ws.getCell('C4').value = 'Beto Ruiz'; });
      const r = await leer(mal);
      expect(r.errores).toEqual([{ fila: 4, columna: 'A (ID)', mensaje: 'El ID no corresponde a ese asesor: descarga la plantilla de nuevo' }]);
      expect(r.filas.map((f) => f.usr_id)).toEqual([8]);
      const vacio = await modificado((ws) => { ws.getCell('C4').value = null; });
      expect((await leer(vacio)).errores).toHaveLength(1);
    });
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

  describe('segunda tanda', () => {
    test('N2: una fórmula que da 0 se lee como 0 (normal y compartida)', async () => {
      const buf = await conXml((xml) => xml
        .replace(/(<c r="D4"[^>]*>)<v>14000000<\/v>/, '$1<f>1-1</f><v>0</v>')
        .replace(/(<c r="D5"[^>]*>)<v>0<\/v>/, '$1<f t="shared" ref="D5:D6" si="0">1-1</f><v>0</v>'));
      const r = await leer(buf);
      expect(r.errores).toEqual([]);
      expect(r.filas.map((f) => f.valores.Osarios)).toEqual([0, 0]);
    });

    test('N2: una fórmula sin resultado guardado sigue dando error', async () => {
      const buf = await conXml((xml) => xml.replace(/(<c r="D4"[^>]*>)<v>14000000<\/v>/, '$1<f>1-1</f>'));
      expect((await leer(buf)).errores).toEqual([{ fila: 4, columna: 'D (Osarios)', mensaje: 'Abre el archivo en Excel y guárdalo de nuevo' }]);
    });

    test('un ID en una celda combinada da error', async () => {
      const buf = await modificado((ws) => { ws.mergeCells('A4:A5'); });
      const r = await leer(buf);
      expect(r.errores).toEqual([{ fila: 5, columna: 'A (ID)', mensaje: 'No combines celdas' }]);
      expect(r.filas.map((f) => f.usr_id)).toEqual([7]);
    });

    test('una fila que solo trae banderas no cuenta como vacía', async () => {
      const buf = await modificado((ws) => { ws.mergeCells('D9:D10'); });
      const r = await leer(buf);
      expect(r.errores).toContainEqual({ fila: 10, columna: 'D (Osarios)', mensaje: 'No combines celdas' });
    });

    // inspeccionarZip está simulado: aquí actúa la cuenta propia del proceso hijo.
    test.each([
      ['una entrada de más de 10 MB', [11]],
      ['varias entradas que juntas pasan de 10 MB', [4, 4, 4]]
    ])('b1: %s se rechaza', async (_n, tamanos) => {
      const zip = await JSZip.loadAsync(await base());
      tamanos.forEach((mb, i) => zip.file(`xl/relleno${i}.bin`, Buffer.alloc(mb * 1024 * 1024), { compression: 'DEFLATE' }));
      const buf = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
      expect(buf.length).toBeLessThan(200000);
      expect(await error(leer(buf))).toMatchObject({ code: 'VALIDATION_ERROR', message: 'El archivo no es un Excel válido o es demasiado grande' });
      expect((await leer(await base())).filas).toHaveLength(2);
    }, 30000);

    // Dos directorios seguidos: la cuenta leería el primero y exceljs el segundo, que puede decir otra cosa.
    test('b1: un segundo directorio escondido antes del final se rechaza', async () => {
      const buf = await base();
      const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
      const ini = buf.readUInt32LE(fin + 16);
      const largo = buf.readUInt32LE(fin + 12);
      const directorio = (corrido) => {
        const d = Buffer.from(buf.subarray(ini, ini + largo));
        for (let p = 0; p < largo; p += 46 + d.readUInt16LE(p + 28) + d.readUInt16LE(p + 30) + d.readUInt16LE(p + 32)) {
          d.writeUInt32LE(d.readUInt32LE(p + 42) + corrido, p + 42);
        }
        return d;
      };
      const final = Buffer.from(buf.subarray(fin));
      final.writeUInt32LE(ini + largo, 16);
      const doble = Buffer.concat([Buffer.alloc(largo), buf.subarray(0, ini), directorio(largo), directorio(0), final]);
      expect(await error(leer(doble))).toMatchObject({ code: 'VALIDATION_ERROR', message: 'El archivo no es un Excel válido o es demasiado grande' });
      expect((await leer(buf)).filas).toHaveLength(2);
    });

    test('el hijo termina solo al cortarse el canal', async () => {
      const hijo = childProcess.fork(path.join(__dirname, '../src/sv/services/presupuestosExcel.lector.js'), [], {
        execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc']
      });
      const salida = new Promise((resolve) => hijo.once('exit', (codigo) => resolve(codigo)));
      hijo.disconnect();
      expect(await salida).toBe(0);
    });
  });
