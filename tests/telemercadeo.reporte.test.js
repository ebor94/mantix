const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const { rutaReporte, escribirReporte } = require('../src/sv/services/telemercadeo.reporte');

describe('rutaReporte', () => {
  it('lo nombra junto al libro, según el modo y la hora', () => {
    const ahora = new Date(2026, 10, 27, 9, 5);
    expect(rutaReporte('/home/x/migracion-telemercadeo/11. NOVIEMBRE 2026 TELEMERCADEO.xlsx', false, ahora))
      .toBe('/home/x/migracion-telemercadeo/11. NOVIEMBRE 2026 TELEMERCADEO - reporte simulacion 20261127-0905.xlsx');
    expect(rutaReporte('/a/libro.xlsx', true, ahora)).toBe('/a/libro - reporte carga 20261127-0905.xlsx');
  });
});

describe('escribirReporte', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tele-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('escribe las hojas Clientes e Incidencias', async () => {
    const ruta = path.join(dir, 'r.xlsx');
    const plan = {
      persona: { nombre: 'Ana', telefono: '3001234567', alterno: null }, estado: 'INTERESADO', prioridad: 2,
      fuente: 'REFERIDO', punto: null, productos: ['PRE-OSR'], proxima: '2026-11-28', gestion: { fecha: '2026-11-24' }
    };
    await escribirReporte(ruta, {
      resultados: [
        { fila: { hoja: '28 DE NOVIEMBRE', fila: 6, nombre: 'Ana', telefonoOriginal: '3001234567' }, plan, resultado: 'se crearía', detalle: 'persona nueva' },
        { fila: { hoja: '28 DE NOVIEMBRE', fila: 8, nombre: 'Caro', telefonoOriginal: '12' }, plan: null, resultado: 'error', detalle: 'teléfono inválido' }
      ],
      incidencias: [{ hoja: '28 DE NOVIEMBRE', fila: null, tipo: 'aviso', mensaje: 'falta la columna HORA' }],
      catalogos: { productos: new Map([['PRE-OSR', { prod_id: 70, nombre: 'Osarios', precio: null }]]) }
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(ruta);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Clientes', 'Incidencias']);
    const clientes = wb.getWorksheet('Clientes');
    expect(clientes.getRow(1).values.slice(1)).toEqual(['Hoja', 'Fila', 'Nombre', 'Teléfono', 'Teléfono alterno', 'Estado',
      'Prioridad', 'Fuente', 'Punto', 'Productos', 'Próxima gestión', 'Fecha de la gestión', 'Resultado', 'Detalle']);
    expect(clientes.getRow(2).values.slice(1)).toEqual(['28 DE NOVIEMBRE', 6, 'Ana', '3001234567', undefined, 'INTERESADO',
      2, 'REFERIDO', undefined, 'PRE-OSR Osarios', '2026-11-28', '2026-11-24', 'se crearía', 'persona nueva']);
    expect(clientes.getRow(3).values.slice(1)).toEqual(['28 DE NOVIEMBRE', 8, 'Caro', '12', undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, 'error', 'teléfono inválido']);
    const incidencias = wb.getWorksheet('Incidencias');
    expect(incidencias.getRow(1).values.slice(1)).toEqual(['Hoja', 'Fila', 'Tipo', 'Mensaje']);
    expect(incidencias.getRow(2).values.slice(1)).toEqual(['28 DE NOVIEMBRE', undefined, 'aviso', 'falta la columna HORA']);
  });

  it('deja el archivo solo para el usuario (permiso 600)', async () => {
    const ruta = path.join(dir, 'p.xlsx');
    await escribirReporte(ruta, { resultados: [], incidencias: [], catalogos: { productos: new Map() } });
    expect(fs.statSync(ruta).mode & 0o777).toBe(0o600);
  });
});
