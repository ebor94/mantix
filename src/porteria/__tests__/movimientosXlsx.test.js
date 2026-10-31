// src/porteria/__tests__/movimientosXlsx.test.js
const { PassThrough } = require('stream');
const ExcelJS = require('exceljs');
const { escribirMovimientosXlsx } = require('../services/movimientosXlsx');

const fila = (cambios = {}) => ({
  id: 1, fecha: '2026-10-20 09:30', sede_nombre: 'Norte', sentido: 'INGRESO', tipo_vehiculo: 'PROPIO', placa: 'ABC123',
  vehiculo_marca: 'Ford', vehiculo_modelo: 'Transit', empresa: null, conductor_nombre: 'Juan', conductor_otro: false,
  motivo_nombre: 'Tanqueo', referencia_codigo: null, referencia_texto: null, kilometraje: 1042, duracion_min: 90, km_recorridos: 42,
  inconsistente: false, inconsistencia_tipo: null, observaciones: null, registrado_por: 'guarda1', ...cambios,
});

async function generar(filas) {
  const salida = new PassThrough();
  const partes = [];
  salida.on('data', (p) => partes.push(p));
  await escribirMovimientosXlsx(salida, filas);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.concat(partes));
  return libro;
}
const valores = (hoja, n) => hoja.getRow(n).values.slice(1);

test('hoja Movimientos con encabezados y valores legibles', async () => {
  const libro = await generar([fila(), fila({ id: 2, sentido: 'SALIDA', tipo_vehiculo: 'PROVEEDOR', conductor_otro: true, referencia_texto: 'Factura 9', vehiculo_marca: null, vehiculo_modelo: null })]);
  expect(libro.worksheets.map((h) => h.name)).toEqual(['Movimientos', 'Inconsistencias']);
  const hoja = libro.getWorksheet('Movimientos');
  expect(valores(hoja, 1)).toEqual([
    'Fecha', 'Sede', 'Sentido', 'Tipo', 'Placa', 'Vehículo', 'Empresa', 'Conductor', 'Motivo', 'Referencia',
    'Kilometraje', 'Duración del viaje (min)', 'Km recorridos', 'Inconsistente', 'Observaciones', 'Registrado por',
  ]);
  expect(hoja.getRow(2).getCell(1).value).toBe('2026-10-20 09:30');
  expect(hoja.getRow(2).getCell(3).value).toBe('Ingreso');
  expect(hoja.getRow(2).getCell(4).value).toBe('Propio');
  expect(hoja.getRow(2).getCell(6).value).toBe('Ford Transit');
  expect(hoja.getRow(2).getCell(12).value).toBe(90);
  expect(hoja.getRow(3).getCell(4).value).toBe('Proveedor');
  expect(hoja.getRow(3).getCell(8).value).toBe('Juan (otro)');
  expect(hoja.getRow(3).getCell(10).value).toBe('Factura 9');
  expect(hoja.rowCount).toBe(3);
});

test('hoja Inconsistencias solo con las inconsistentes', async () => {
  const libro = await generar([fila(), fila({ id: 2, inconsistente: true, inconsistencia_tipo: 'SALIDA_OTRA_SEDE', observaciones: 'Salió por Sur' })]);
  const hoja = libro.getWorksheet('Inconsistencias');
  expect(valores(hoja, 1)).toEqual(['Fecha', 'Sede', 'Placa', 'Sentido', 'Tipo de inconsistencia', 'Observaciones', 'Registrado por']);
  expect(valores(hoja, 2)).toEqual(['2026-10-20 09:30', 'Norte', 'ABC123', 'Ingreso', 'Salida por otra sede', 'Salió por Sur', 'guarda1']);
  expect(hoja.rowCount).toBe(2);
  expect(libro.getWorksheet('Movimientos').getRow(3).getCell(14).value).toBe('Sí');
});

test('sin filas genera solo los encabezados', async () => {
  const libro = await generar([]);
  expect(libro.getWorksheet('Movimientos').rowCount).toBe(1);
  expect(libro.getWorksheet('Inconsistencias').rowCount).toBe(1);
});
