/**
 * sv/services/presupuestosExcel.service.js
 * Escribe y lee el libro de presupuesto. No toca la base de datos.
 *  - Antes de abrir un archivo se inspecciona el zip (zip bomb) y las fórmulas se toman por su
 *    resultado guardado: nunca se evalúan.
 *  - Los mensajes dicen fila y columna, pero no repiten el valor de la celda.
 */
const ExcelJS = require('exceljs');
const { inspeccionarZip } = require('../../masajes/utils/zipSeguro');
const { VALOR_MAXIMO, MAX_FILAS } = require('../validations/presupuestos.validation');

const HOJA = 'Presupuesto';
const HOJA_DATOS = '_datos';
const MARCA = 'presupuesto-genflow';
const FILA_ENCABEZADO = 3;
const PRIMERA_FILA = 4;
const MAX_VACIAS_SEGUIDAS = 200;
const COLUMNAS_FIJAS = 3; // ID, Usuario de red, Asesor
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function error(mensaje) { return Object.assign(new Error(mensaje), { code: 'VALIDATION_ERROR' }); }
const noEsExcel = () => error('El archivo no es un Excel válido');

const sinTildes = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '');

function nombreArchivo({ areaNombre, anio, mes }) {
  const area = sinTildes(areaNombre).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `presupuesto-${area}-${anio}-${String(mes).padStart(2, '0')}.xlsx`;
}

const nombreMes = (mes) => MESES[mes - 1];

// 1 → A, 27 → AA
function letra(n) {
  let s = '';
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s;
  return s;
}

/**
 * filas: [{ usr_id, usuario_red, nombre, valores: { <categoría>: número } }]
 */
async function escribir({ titulo, areaId, anio, mes, categorias, filas }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(HOJA, { views: [{ state: 'frozen', xSplit: 2, ySplit: FILA_ENCABEZADO, topLeftCell: `C${PRIMERA_FILA}` }] });
  const ultima = COLUMNAS_FIJAS + categorias.length; // última columna de categoría
  const colTotal = ultima + 1;

  ws.getCell('A1').value = titulo;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = 'Cambia solo los valores. No agregues filas ni columnas.';
  const encabezados = ['ID', 'Usuario de red', 'Asesor', ...categorias, 'Total'];
  encabezados.forEach((t, i) => {
    const c = ws.getCell(FILA_ENCABEZADO, i + 1);
    c.value = t;
    c.font = { bold: true };
  });
  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 32;
  for (let c = COLUMNAS_FIJAS + 1; c <= colTotal; c++) ws.getColumn(c).width = 18;

  filas.forEach((f, i) => {
    const r = PRIMERA_FILA + i;
    ws.getCell(r, 1).value = f.usr_id;
    ws.getCell(r, 2).value = f.usuario_red || '';
    ws.getCell(r, 3).value = f.nombre;
    let suma = 0;
    categorias.forEach((cat, j) => {
      const v = Number(f.valores?.[cat]) || 0;
      suma += v;
      const c = ws.getCell(r, COLUMNAS_FIJAS + 1 + j);
      c.value = v;
      c.numFmt = '#,##0';
    });
    const t = ws.getCell(r, colTotal);
    t.value = { formula: `SUM(${letra(COLUMNAS_FIJAS + 1)}${r}:${letra(ultima)}${r})`, result: suma };
    t.numFmt = '#,##0';
  });

  const datos = wb.addWorksheet(HOJA_DATOS, { state: 'veryHidden' });
  datos.getCell('A1').value = MARCA;
  datos.getCell('A2').value = areaId;
  datos.getCell('A3').value = anio;
  datos.getCell('A4').value = mes;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Texto de una celda; fórmulas por su resultado guardado.
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

const vacia = (v) => v === '' || (typeof v === 'string' && v.trim() === '');

/** Entero de 0 a VALOR_MAXIMO, o null si la celda no lo es. Acepta '14.000.000' y '14,000,000'. */
function entero(v) {
  let n;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const t = v.trim().replace(/^\$\s*/, '');
    if (/^\d+$/.test(t)) n = Number(t);
    else if (/^\d{1,3}([.,]\d{3})+$/.test(t)) n = Number(t.replace(/[.,]/g, ''));
    else return null;
  } else return null;
  return Number.isInteger(n) && n >= 0 && n <= VALOR_MAXIMO ? n : null;
}

function leerMarca(wb, { areaId, anio, mes }) {
  const datos = wb.getWorksheet(HOJA_DATOS);
  const celda = (a) => crudo(datos?.getCell(a).value);
  if (!datos || celda('A1') !== MARCA) throw error('Este archivo no es la plantilla de presupuesto de GenFlow. Descarga la plantilla del mes');
  if (Number(celda('A2')) !== Number(areaId)) throw error('Esta plantilla es de otra área. Descarga la plantilla del área');
  if (Number(celda('A3')) !== Number(anio) || Number(celda('A4')) !== Number(mes)) {
    throw error(`Esta plantilla no es de ${nombreMes(mes)} de ${anio}. Descarga la plantilla de ese mes`);
  }
}

// Columna de cada categoría, por su encabezado.
function columnasDe(ws, categorias) {
  const porNombre = new Map();
  const esperado = (t) => ['id', 'usuario de red', 'asesor', 'total'].includes(String(t).trim().toLowerCase());
  const fila = ws.getRow(FILA_ENCABEZADO);
  const hasta = Math.min(ws.columnCount, COLUMNAS_FIJAS + categorias.length + 1);
  for (let c = COLUMNAS_FIJAS + 1; c <= hasta; c++) {
    const t = String(crudo(fila.getCell(c).value)).trim();
    if (!t || esperado(t)) continue;
    if (!categorias.includes(t)) throw error(`La columna ${letra(c)} tiene una categoría desconocida. Descarga la plantilla del mes`);
    if (porNombre.has(t)) throw error(`La categoría "${t}" está repetida. Descarga la plantilla del mes`);
    porNombre.set(t, c);
  }
  for (const cat of categorias) {
    if (!porNombre.has(cat)) throw error(`Falta la columna de la categoría "${cat}". Descarga la plantilla del mes`);
  }
  return porNombre;
}

/**
 * asesores: [{ usr_id, nombre }] los que se pueden cargar.
 * Devuelve las filas válidas y los errores { fila, columna, mensaje }. Un error del libro entero
 * (otro mes, otra área, columnas) lanza VALIDATION_ERROR.
 */
async function leer(buffer, { areaId, anio, mes, categorias, asesores }) {
  try { inspeccionarZip(buffer); } catch { throw noEsExcel(); }
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw noEsExcel(); }

  leerMarca(wb, { areaId, anio, mes });
  const ws = wb.getWorksheet(HOJA);
  if (!ws) throw error('El archivo no tiene la hoja "Presupuesto". Descarga la plantilla del mes');
  const columnas = columnasDe(ws, categorias);
  const porId = new Map(asesores.map((a) => [Number(a.usr_id), a]));

  const filas = [];
  const errores = [];
  const vistos = new Set();
  let conDatos = 0;
  let vaciasSeguidas = 0;

  for (let r = PRIMERA_FILA; r <= ws.rowCount && vaciasSeguidas < MAX_VACIAS_SEGUIDAS; r++) {
    const row = ws.getRow(r);
    const id = crudo(row.getCell(1).value);
    const texto = (c) => crudo(row.getCell(c).value);
    const celdas = categorias.map((cat) => [cat, columnas.get(cat), texto(columnas.get(cat))]);
    const sinNada = vacia(id) && vacia(texto(2)) && vacia(texto(3)) && celdas.every(([, , v]) => vacia(v));
    if (sinNada) { vaciasSeguidas += 1; continue; }
    vaciasSeguidas = 0;

    conDatos += 1;
    if (conDatos > MAX_FILAS) throw error(`El archivo tiene más de ${MAX_FILAS} filas`);

    const antes = errores.length;
    const falla = (columna, mensaje) => errores.push({ fila: r, columna, mensaje });

    const usrId = typeof id === 'number' ? id : (/^\d+$/.test(String(id).trim()) ? Number(String(id).trim()) : NaN);
    let asesor = null;
    if (vacia(id)) falla('A (ID)', 'Falta el ID del asesor');
    else if (!Number.isInteger(usrId)) falla('A (ID)', 'El ID del asesor no es válido');
    else if (vistos.has(usrId)) falla('A (ID)', 'Este asesor está repetido en el archivo');
    else {
      vistos.add(usrId);
      asesor = porId.get(usrId);
      if (!asesor) falla('A (ID)', 'Este asesor no está activo o no está a tu alcance');
    }

    const valores = {};
    for (const [cat, col, v] of celdas) {
      if (vacia(v)) { valores[cat] = 0; continue; }
      const n = entero(v);
      if (n === null) falla(`${letra(col)} (${cat})`, `Escribe un número entero de 0 a ${VALOR_MAXIMO.toLocaleString('es-CO')}`);
      else valores[cat] = n;
    }
    if (errores.length === antes && asesor) filas.push({ usr_id: Number(asesor.usr_id), nombre: asesor.nombre, valores });
  }
  return { filas, errores };
}

module.exports = { escribir, leer, nombreArchivo, nombreMes, HOJA, FILA_ENCABEZADO, PRIMERA_FILA };
