/**
 * sv/services/telemercadeo.reporte.js
 * Reporte .xlsx de una corrida de la migración de telemercadeo: hoja Clientes (qué
 * pasa con cada cliente) e Incidencias. Tiene datos personales: vive solo junto al
 * libro, fuera de www y del repositorio, y se borra con él.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const dos = (n) => String(n).padStart(2, '0');

const COLUMNAS_CLIENTES = [
  ['Hoja', 'hoja', 18], ['Fila', 'fila', 6], ['Nombre', 'nombre', 32], ['Teléfono', 'telefono', 14],
  ['Teléfono alterno', 'alterno', 14], ['Estado', 'estado', 12], ['Prioridad', 'prioridad', 9],
  ['Fuente', 'fuente', 18], ['Punto', 'punto', 8], ['Productos', 'productos', 48],
  ['Próxima gestión', 'proxima', 14], ['Fecha de la gestión', 'fechaGestion', 14],
  ['Resultado', 'resultado', 12], ['Detalle', 'detalle', 60]
];
const COLUMNAS_INCIDENCIAS = [['Hoja', 'hoja', 18], ['Fila', 'fila', 6], ['Tipo', 'tipo', 8], ['Mensaje', 'mensaje', 80]];

function rutaReporte(rutaLibro, aplicar, ahora = new Date()) {
  const base = path.basename(rutaLibro, path.extname(rutaLibro));
  const sello = `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}`;
  return path.join(path.dirname(rutaLibro), `${base} - reporte ${aplicar ? 'carga' : 'simulacion'} ${sello}.xlsx`);
}

function hoja(wb, nombre, columnas) {
  const ws = wb.addWorksheet(nombre);
  ws.columns = columnas.map(([header, key, width]) => ({ header, key, width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

async function escribirReporte(ruta, { resultados, incidencias, catalogos }) {
  const wb = new ExcelJS.Workbook();
  const clientes = hoja(wb, 'Clientes', COLUMNAS_CLIENTES);
  for (const { fila, plan, resultado, detalle } of resultados) {
    clientes.addRow({
      hoja: fila.hoja,
      fila: fila.fila,
      nombre: fila.nombre,
      telefono: plan ? plan.persona.telefono : fila.telefonoOriginal,
      alterno: plan?.persona.alterno ?? null,
      estado: plan?.estado ?? null,
      prioridad: plan?.prioridad ?? null,
      fuente: plan?.fuente ?? null,
      punto: plan?.punto ?? null,
      productos: plan
        ? plan.productos.map((c) => `${c} ${catalogos.productos.get(c)?.nombre ?? ''}`.trim()).join('; ') || null
        : null,
      proxima: plan?.proxima ?? null,
      fechaGestion: plan?.gestion.fecha ?? null,
      resultado,
      detalle
    });
  }
  const inc = hoja(wb, 'Incidencias', COLUMNAS_INCIDENCIAS);
  for (const i of incidencias) inc.addRow(i);
  await wb.xlsx.writeFile(ruta);
  fs.chmodSync(ruta, 0o600); // tiene datos personales: solo para el usuario
}

module.exports = { rutaReporte, escribirReporte };
