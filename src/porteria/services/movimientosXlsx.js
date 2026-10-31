// src/porteria/services/movimientosXlsx.js
// Escribe el reporte de movimientos en Excel directamente sobre el stream de la respuesta.
const ExcelJS = require('exceljs');

const SENTIDO = { INGRESO: 'Ingreso', SALIDA: 'Salida' };
const TIPO = { PROPIO: 'Propio', PROVEEDOR_ASISTENCIA: 'Proveedor de asistencia', PROVEEDOR: 'Proveedor' };
const INCONSISTENCIA = {
  INGRESO_ESTANDO_DENTRO: 'Ingreso estando dentro',
  SALIDA_ESTANDO_FUERA: 'Salida estando fuera',
  SALIDA_OTRA_SEDE: 'Salida por otra sede',
};

const COLUMNAS_MOVIMIENTOS = [
  { header: 'Fecha', key: 'fecha', width: 17 },
  { header: 'Sede', key: 'sede', width: 20 },
  { header: 'Sentido', key: 'sentido', width: 9 },
  { header: 'Tipo', key: 'tipo', width: 22 },
  { header: 'Placa', key: 'placa', width: 10 },
  { header: 'Vehículo', key: 'vehiculo', width: 20 },
  { header: 'Empresa', key: 'empresa', width: 22 },
  { header: 'Conductor', key: 'conductor', width: 26 },
  { header: 'Motivo', key: 'motivo', width: 26 },
  { header: 'Referencia', key: 'referencia', width: 22 },
  { header: 'Kilometraje', key: 'kilometraje', width: 12 },
  { header: 'Duración del viaje (min)', key: 'duracion_min', width: 14 },
  { header: 'Km recorridos', key: 'km_recorridos', width: 12 },
  { header: 'Inconsistente', key: 'inconsistente', width: 12 },
  { header: 'Observaciones', key: 'observaciones', width: 40 },
  { header: 'Registrado por', key: 'registrado_por', width: 18 },
];
const COLUMNAS_INCONSISTENCIAS = [
  { header: 'Fecha', key: 'fecha', width: 17 },
  { header: 'Sede', key: 'sede', width: 20 },
  { header: 'Placa', key: 'placa', width: 10 },
  { header: 'Sentido', key: 'sentido', width: 9 },
  { header: 'Tipo de inconsistencia', key: 'tipo_inconsistencia', width: 24 },
  { header: 'Observaciones', key: 'observaciones', width: 40 },
  { header: 'Registrado por', key: 'registrado_por', width: 18 },
];

function legible(f) {
  return {
    fecha: f.fecha,
    sede: f.sede_nombre,
    sentido: SENTIDO[f.sentido] || f.sentido,
    tipo: TIPO[f.tipo_vehiculo] || f.tipo_vehiculo,
    placa: f.placa,
    vehiculo: [f.vehiculo_marca, f.vehiculo_modelo].filter(Boolean).join(' ') || null,
    empresa: f.empresa,
    conductor: f.conductor_nombre ? `${f.conductor_nombre}${f.conductor_otro ? ' (otro)' : ''}` : null,
    motivo: f.motivo_nombre,
    referencia: f.referencia_codigo || f.referencia_texto || null,
    kilometraje: f.kilometraje,
    duracion_min: f.duracion_min,
    km_recorridos: f.km_recorridos,
    inconsistente: f.inconsistente ? 'Sí' : '',
    tipo_inconsistencia: INCONSISTENCIA[f.inconsistencia_tipo] || f.inconsistencia_tipo,
    observaciones: f.observaciones,
    registrado_por: f.registrado_por,
  };
}

function hoja(libro, nombre, columnas, filas) {
  const h = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  h.columns = columnas;
  h.getRow(1).font = { bold: true };
  for (const f of filas) h.addRow(legible(f)).commit();
  h.commit();
}

async function escribirMovimientosXlsx(stream, filas) {
  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  hoja(libro, 'Movimientos', COLUMNAS_MOVIMIENTOS, filas);
  hoja(libro, 'Inconsistencias', COLUMNAS_INCONSISTENCIAS, filas.filter((f) => f.inconsistente));
  await libro.commit();
}

module.exports = { escribirMovimientosXlsx };
