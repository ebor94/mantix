/**
 * Lee el libro de presupuesto en un hilo aparte, con la memoria limitada por quien lo lanza.
 * exceljs expande rangos enormes (celdas combinadas, columnas, validaciones) y un xlsx pequeño
 * puede agotar la memoria: aquí solo se pierde este hilo. Devuelve datos planos, sin validar nada.
 */
const { parentPort, workerData } = require('worker_threads');
const ExcelJS = require('exceljs');

const HOJA = 'Presupuesto';
const HOJA_DATOS = '_datos';
const FILA_ENCABEZADO = 3;
const PRIMERA_FILA = 4;
const MAX_VACIAS_SEGUIDAS = 200;
const FORMULA = 1;
const SIN_RESULTADO = 2;
const COMBINADA = 4; // combinada y no es la celda principal

// Valor de una celda como dato plano; las fórmulas por su resultado guardado, sin evaluarlas.
function crudo(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('formula' in v || 'sharedFormula' in v) return crudo(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => (t && typeof t.text === 'string' ? t.text : '')).join('');
    if ('text' in v) return crudo(v.text);
    return { invalido: true }; // errores (#N/A) y tipos desconocidos
  }
  return v;
}

function celda(cell) {
  if (cell.type === ExcelJS.ValueType.Merge) return { v: '', flags: COMBINADA };
  const raw = cell.value;
  let flags = 0;
  if (raw && typeof raw === 'object' && ('formula' in raw || 'sharedFormula' in raw)) {
    flags |= FORMULA;
    if (raw.result === undefined || raw.result === null) flags |= SIN_RESULTADO;
  }
  return { v: crudo(raw), flags };
}

const vacio = (v) => v === '' || (typeof v === 'string' && v.trim() === '');

async function leer({ buffer, maxColumna, maxFilas }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer));
  const datosHoja = wb.getWorksheet(HOJA_DATOS);
  const datos = datosHoja ? [1, 2, 3, 4].map((r) => celda(datosHoja.getCell(`A${r}`)).v) : null;
  const ws = wb.getWorksheet(HOJA);
  if (!ws) return { datos, hoja: false, celdas: [] };

  const celdas = []; // [fila, columna, valor, flags]
  const recoger = (r) => {
    const row = ws.getRow(r);
    let alguna = false;
    for (let c = 1; c <= maxColumna; c++) {
      const { v, flags } = celda(row.getCell(c));
      if (vacio(v) && !flags) continue;
      alguna = true;
      celdas.push([r, c, v, flags]);
    }
    return alguna;
  };
  recoger(FILA_ENCABEZADO);
  let vacias = 0;
  let conDatos = 0;
  for (let r = PRIMERA_FILA; r <= ws.rowCount && vacias < MAX_VACIAS_SEGUIDAS && conDatos <= maxFilas; r++) {
    if (recoger(r)) { vacias = 0; conDatos += 1; } else vacias += 1;
  }
  return { datos, hoja: true, celdas };
}

leer(workerData)
  .then((r) => parentPort.postMessage({ ok: true, ...r }))
  .catch(() => parentPort.postMessage({ ok: false }));
