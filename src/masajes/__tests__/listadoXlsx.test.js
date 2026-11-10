const { leerListado, formatearNombre, claveNombre } = require('../services/listadoXlsx');
const { crearXlsx, fila } = require('../testing/xlsx');
const { zipFalso } = require('../testing/zip');

const motivoDe = async (p) => { try { await p; } catch (e) { return e.errors ? e.errors[0].motivo : e.message; } return 'NO_LANZO'; };

describe('formatearNombre y claveNombre', () => {
  test('título con partículas en minúscula, sin espacios de sobra', () => {
    expect(formatearNombre('  EDWIN   BRANDON ortega RAMIREZ ')).toBe('Edwin Brandon Ortega Ramirez');
    expect(formatearNombre('MARIA DE LOS ANGELES DEL RIO')).toBe('Maria de los Angeles del Rio');
    expect(formatearNombre('DE LA CRUZ ANA')).toBe('De la Cruz Ana');
    expect(formatearNombre('JOSÉ ÁLVAREZ ÑÚÑEZ')).toBe('José Álvarez Ñúñez');
  });

  test('la clave ignora mayúsculas, tildes y espacios', () => {
    expect(claveNombre('José  Álvarez')).toBe(claveNombre('JOSE ALVAREZ'));
    expect(claveNombre('José Álvarez')).toBe('jose alvarez');
  });
});

describe('leerListado — formato real (título + encabezados con "NUEMRODECELULAR")', () => {
  test('lee las filas, normaliza y no toca ad_usuario', async () => {
    const buf = await crearXlsx({
      filas: [
        fila(1, 'EDWIN BRANDON ORTEGA RAMIREZ', 'Coordinador TIC', '3152884079', 'EOrtega@LosOlivos.co'),
        fila(2, 'ANA MARIA PEREZ', 'Asesora', '+57 300 123 4567', 'coordcomercialcucuta@losolivos.co'),
      ],
    });
    const r = await leerListado(buf);
    expect(r.errores).toEqual([]);
    expect(r.advertencias).toEqual([]);
    expect(r.filas).toEqual([
      { fila: 3, nombre: 'Edwin Brandon Ortega Ramirez', clave: 'edwin brandon ortega ramirez|573152884079', cargo: 'Coordinador TIC', celular: '573152884079', correo: 'eortega@losolivos.co' },
      { fila: 4, nombre: 'Ana Maria Perez', clave: 'ana maria perez|573001234567', cargo: 'Asesora', celular: '573001234567', correo: 'coordcomercialcucuta@losolivos.co' },
    ]);
  });

  test('encabezados con variantes, tildes, otro orden y columnas extra; sin fila de título', async () => {
    const buf = await crearXlsx({
      titulo: null,
      encabezados: ['Correo Electrónico', 'Observaciones', 'Celular', 'Nombre', 'Cargo'],
      filas: [['ana@losolivos.co', 'no leer esto', 3152884079, 'Ana', 'Guía']],
    });
    const r = await leerListado(buf);
    expect(r.filas).toEqual([{ fila: 2, nombre: 'Ana', clave: 'ana|573152884079', cargo: 'Guía', celular: '573152884079', correo: 'ana@losolivos.co' }]);
  });

  test('busca el listado en la hoja que tenga los encabezados, no solo en la primera', async () => {
    const buf = await crearXlsx({ hojaPrevia: true, filas: [fila(1, 'Ana', 'Guía', '3152884079', 'ana@x.co')] });
    expect((await leerListado(buf)).filas).toHaveLength(1);
  });

  test('salta filas vacías y filas sin nombre (totales, notas)', async () => {
    const buf = await crearXlsx({
      filas: [fila(1, 'Ana', 'Guía', '3152884079', ''), [], fila(null, null, null, null, null), ['', '', '', '', ''], fila(2, 'Luis', 'Asesor', '3001234567', '')],
    });
    const r = await leerListado(buf);
    expect(r.filas.map((f) => f.nombre)).toEqual(['Ana', 'Luis']);
    expect(r.errores).toEqual([]);
  });
});

describe('leerListado — tipos de celda de exceljs', () => {
  test('fórmula: toma el resultado como texto y nunca la fórmula', async () => {
    const buf = await crearXlsx({ filas: [fila(1, { formula: 'UPPER("ana")', result: 'ANA' }, { formula: 'HYPERLINK("http://x","y")', result: 'Guía' }, '3152884079', '')] });
    const r = await leerListado(buf);
    expect(r.filas[0]).toMatchObject({ nombre: 'Ana', cargo: 'Guía' });
    expect(JSON.stringify(r)).not.toMatch(/UPPER|HYPERLINK|http/);
  });

  test('fórmula sin resultado guardado → celda vacía (no se evalúa)', async () => {
    const buf = await crearXlsx({ filas: [fila(1, 'Ana', { formula: 'A1&B1' }, '3152884079', '')] });
    expect((await leerListado(buf)).filas[0].cargo).toBeNull();
  });

  test('correo como hipervínculo (mailto) → su texto', async () => {
    const buf = await crearXlsx({ filas: [fila(1, 'Ana', 'Guía', '3152884079', { text: 'Ana@LosOlivos.co', hyperlink: 'mailto:otro@evil.co' })] });
    expect((await leerListado(buf)).filas[0].correo).toBe('ana@losolivos.co');
  });

  test('texto enriquecido → texto plano', async () => {
    const buf = await crearXlsx({ filas: [fila(1, { richText: [{ text: 'ANA ', font: { bold: true } }, { text: 'PEREZ' }] }, 'Guía', '3152884079', '')] });
    expect((await leerListado(buf)).filas[0].nombre).toBe('Ana Perez');
  });

  test('caracteres de control y de ancho cero se eliminan', async () => {
    const buf = await crearXlsx({ filas: [fila(1, 'Ana\u0000\u200B Perez\u0007', 'Guía\r\nTIC', '3152884079', '')] });
    expect((await leerListado(buf)).filas[0]).toMatchObject({ nombre: 'Ana Perez', cargo: 'Guía TIC' });
  });

  test('HTML en el nombre se guarda tal cual: se escapa al mostrarlo, no al guardarlo', async () => {
    const buf = await crearXlsx({ filas: [fila(1, '<b>Ana</b> Perez', 'Guía', '3152884079', '')] });
    const { nombre } = (await leerListado(buf)).filas[0];
    expect(nombre).toContain('<b>');
    expect(nombre).not.toContain('&lt;');
  });
});

describe('leerListado — errores (bloquean la importación) y advertencias (no la bloquean)', () => {
  test('celular o correo inválido → advertencia y se importa sin ese dato', async () => {
    const buf = await crearXlsx({ filas: [fila(1, 'Ana', 'Guía', '6075551234', 'ana@'), fila(2, 'Luis', 'Asesor', '3001234567', 'a@x.co; b@y.co')] });
    const r = await leerListado(buf);
    expect(r.errores).toEqual([]);
    expect(r.filas.map((f) => [f.celular, f.correo])).toEqual([[null, null], ['573001234567', null]]);
    expect(r.advertencias).toEqual([
      { fila: 3, motivo: 'CELULAR_INVALIDO' }, { fila: 3, motivo: 'CORREO_INVALIDO' }, { fila: 4, motivo: 'CORREO_INVALIDO' },
    ]);
  });

  test('las advertencias no repiten el valor (pueden ser datos personales)', async () => {
    const buf = await crearXlsx({ filas: [fila(1, 'Ana', 'Guía', '6075551234', 'ana@')] });
    expect(JSON.stringify((await leerListado(buf)).advertencias)).not.toMatch(/6075551234|ana@/);
  });

  test('cargo de más de 150 caracteres → se recorta con advertencia', async () => {
    const buf = await crearXlsx({ filas: [fila(1, 'Ana', 'x'.repeat(200), '3152884079', '')] });
    const r = await leerListado(buf);
    expect(r.filas[0].cargo).toHaveLength(150);
    expect(r.advertencias).toEqual([{ fila: 3, motivo: 'CARGO_RECORTADO' }]);
  });

  test('nombre de más de 150 caracteres → error', async () => {
    const buf = await crearXlsx({ filas: [fila(1, 'A'.repeat(151), 'Guía', '3152884079', '')] });
    expect((await leerListado(buf)).errores).toEqual([{ fila: 3, motivo: 'NOMBRE_MUY_LARGO' }]);
  });

  test('persona repetida en el archivo (mismo nombre y celular) → error en la segunda', async () => {
    const buf = await crearXlsx({ filas: [fila(1, 'Ana Perez', 'Guía', '3152884079', ''), fila(2, 'ANA PÉREZ', 'Guía', '315 288 4079', '')] });
    expect((await leerListado(buf)).errores).toEqual([{ fila: 4, motivo: 'DUPLICADA_EN_ARCHIVO' }]);
  });

  test('mismo correo para dos personas es válido (buzones compartidos, spec §4)', async () => {
    const buf = await crearXlsx({ filas: [fila(1, 'Ana', 'Guía', '3152884079', 'homenajes@losolivos.co'), fila(2, 'Luis', 'Guía', '3001234567', 'homenajes@losolivos.co')] });
    const r = await leerListado(buf);
    expect(r.errores).toEqual([]);
    expect(r.advertencias).toEqual([]);
  });
});

describe('leerListado — archivo completo inválido', () => {
  test('sin encabezados reconocibles → SIN_ENCABEZADOS', async () => {
    const buf = await crearXlsx({ titulo: null, encabezados: ['Columna A', 'Columna B'], filas: [['x', 'y']] });
    expect(await motivoDe(leerListado(buf))).toBe('SIN_ENCABEZADOS');
  });

  test('sin columna de celular → SIN_ENCABEZADOS', async () => {
    const buf = await crearXlsx({ encabezados: ['NOMBRE', 'CARGO'], filas: [['Ana', 'Guía']] });
    expect(await motivoDe(leerListado(buf))).toBe('SIN_ENCABEZADOS');
  });

  test('sin filas de datos → SIN_FILAS', async () => {
    expect(await motivoDe(leerListado(await crearXlsx({ filas: [] })))).toBe('SIN_FILAS');
  });

  test('más filas que el máximo → DEMASIADAS_FILAS', async () => {
    const filas = Array.from({ length: 6 }, (_, i) => fila(i + 1, `Persona ${i}`, 'Guía', `30012345${String(i).padStart(2, '0')}`, ''));
    expect(await motivoDe(leerListado(await crearXlsx({ filas }), { maxFilas: 5 }))).toBe('DEMASIADAS_FILAS');
    expect((await leerListado(await crearXlsx({ filas }), { maxFilas: 6 })).filas).toHaveLength(6);
  });

  test('un archivo que no es xlsx → ARCHIVO_INVALIDO antes de abrirlo con exceljs', async () => {
    expect(await motivoDe(leerListado(Buffer.from('NOMBRE,CELULAR\nAna,3152884079')))).toBe('ARCHIVO_INVALIDO');
  });

  test('un zip que no es un libro de Excel → ARCHIVO_INVALIDO', async () => {
    const z = zipFalso([{ nombre: 'hola.txt', datos: Buffer.from('no soy un xlsx') }]);
    expect(await motivoDe(leerListado(z))).toBe('ARCHIVO_INVALIDO');
  });
});
