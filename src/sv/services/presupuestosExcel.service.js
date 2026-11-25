/**
 * sv/services/presupuestosExcel.service.js
 * Escribe y lee el libro de presupuesto. No toca la base de datos.
 *  - Antes de abrir un archivo se inspecciona el zip (zip bomb) y las fórmulas se toman por su
 *    resultado guardado: nunca se evalúan.
 *  - Los mensajes dicen fila y columna, pero no repiten el valor de la celda.
 */
const path = require('path');
const { Worker } = require('worker_threads');
const ExcelJS = require('exceljs');
const { inspeccionarZip } = require('../../masajes/utils/zipSeguro');
const { VALOR_MAXIMO, MAX_FILAS } = require('../validations/presupuestos.validation');

const HOJA = 'Presupuesto';
const HOJA_DATOS = '_datos';
const MARCA = 'presupuesto-genflow';
const FILA_ENCABEZADO = 3;
const PRIMERA_FILA = 4;
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

const MAX_BYTES_DESCOMPRIMIDOS = 10 * 1024 * 1024;
const MAX_ENTRADAS = 100;
const TIEMPO_MAXIMO_MS = 15000;
const MEMORIA_MAXIMA_MB = 256;
const FORMULA_SIN_RESULTADO = 2;
const COMBINADA = 4;
const RUIDO = 1e-6; // los cálculos de Excel dejan restos como 14000000.0000000002

let leyendo = false;

const demasiado = () => error('El archivo no es un Excel válido o es demasiado grande');

/**
 * Lee el libro en un hilo propio (ver presupuestosExcel.worker.js), de uno en uno, con memoria y
 * tiempo limitados. Devuelve { datos, hoja, celdas } o lanza VALIDATION_ERROR / CONFLICT.
 */
function leerEnHilo(buffer, maxColumna) {
  if (leyendo) throw Object.assign(new Error('Se está revisando otro archivo. Intenta en unos segundos'), { code: 'CONFLICT' });
  leyendo = true;
  return new Promise((resolve, reject) => {
    let fin = false;
    const worker = new Worker(path.join(__dirname, 'presupuestosExcel.worker.js'), {
      workerData: { buffer, maxColumna, maxFilas: MAX_FILAS },
      resourceLimits: { maxOldGenerationSizeMb: MEMORIA_MAXIMA_MB }
    });
    const terminar = (accion, valor) => {
      if (fin) return;
      fin = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {}).then(() => { leyendo = false; accion(valor); });
    };
    const timer = setTimeout(() => terminar(reject, demasiado()), TIEMPO_MAXIMO_MS);
    worker.once('message', (m) => (m.ok ? terminar(resolve, m) : terminar(reject, demasiado())));
    worker.once('error', () => terminar(reject, demasiado()));
    worker.once('exit', () => terminar(reject, demasiado()));
  });
}

const vacia = (v) => v === '' || (typeof v === 'string' && v.trim() === '');

/** Entero de 0 a VALOR_MAXIMO, o null si la celda no lo es. Acepta '14.000.000' y '14,000,000'. */
function entero(v) {
  let n;
  if (typeof v === 'number') {
    n = Math.abs(v - Math.round(v)) < RUIDO ? Math.round(v) : v;
  } else if (typeof v === 'string') {
    const t = v.trim().replace(/^\$\s*/, '');
    if (/^(0|[1-9]\d*)$/.test(t)) n = Number(t);
    else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t) || /^[1-9]\d{0,2}(,\d{3})+$/.test(t)) n = Number(t.replace(/[.,]/g, ''));
    else return null;
  } else return null;
  return Number.isInteger(n) && n >= 0 && n <= VALOR_MAXIMO ? n : null;
}

function validarMarca(d, { areaId, anio, mes }) {
  if (!d || d[0] !== MARCA) throw error('Este archivo no es la plantilla de presupuesto de GenFlow. Descarga la plantilla del mes');
  if (Number(d[1]) !== Number(areaId)) throw error('Esta plantilla es de otra área. Descarga la plantilla del área');
  if (Number(d[2]) !== Number(anio) || Number(d[3]) !== Number(mes)) {
    throw error(`Esta plantilla no es de ${nombreMes(mes)} de ${anio}. Descarga la plantilla de ese mes`);
  }
}

// Columna de cada categoría, por su encabezado.
function columnasDe(encabezado, categorias) {
  const porNombre = new Map();
  const esperado = (t) => ['id', 'usuario de red', 'asesor', 'total'].includes(String(t).trim().toLowerCase());
  const hasta = COLUMNAS_FIJAS + categorias.length + 1;
  for (let c = COLUMNAS_FIJAS + 1; c <= hasta; c++) {
    const t = String(encabezado.get(c)?.v ?? '').trim();
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

// Sin mayúsculas, tildes ni espacios.
const clave = (s) => sinTildes(String(s ?? '')).toLowerCase().replace(/\s+/g, '');

/**
 * asesores: [{ usr_id, nombre }] los que se pueden cargar.
 * Devuelve las filas válidas y los errores { fila, columna, mensaje }. Un error del libro entero
 * (otro mes, otra área, columnas) lanza VALIDATION_ERROR; otra lectura en curso, CONFLICT.
 */
async function leer(buffer, { areaId, anio, mes, categorias, asesores }) {
  try { inspeccionarZip(buffer, { maxDescomprimido: MAX_BYTES_DESCOMPRIMIDOS, maxEntradas: MAX_ENTRADAS }); } catch { throw noEsExcel(); }
  const maxColumna = COLUMNAS_FIJAS + categorias.length + 1;
  const { datos, hoja, celdas } = await leerEnHilo(buffer, maxColumna);

  validarMarca(datos, { areaId, anio, mes });
  if (!hoja) throw error('El archivo no tiene la hoja "Presupuesto". Descarga la plantilla del mes');

  const encabezado = new Map();
  const porFila = new Map(); // fila → Map(columna → { v, flags })
  for (const [f, c, v, flags] of celdas) {
    if (f === FILA_ENCABEZADO) { encabezado.set(c, { v, flags }); continue; }
    if (!porFila.has(f)) porFila.set(f, new Map());
    porFila.get(f).set(c, { v, flags });
  }
  const columnas = columnasDe(encabezado, categorias);
  const porId = new Map(asesores.map((a) => [Number(a.usr_id), a]));

  const filas = [];
  const errores = [];
  const vistos = new Set();
  let conDatos = 0;

  for (const r of [...porFila.keys()].sort((a, b) => a - b)) {
    const row = porFila.get(r);
    const dato = (c) => row.get(c) || { v: '', flags: 0 };
    const celdasCat = categorias.map((cat) => [cat, columnas.get(cat), dato(columnas.get(cat))]);
    const sinNada = [1, 2, 3].every((c) => vacia(dato(c).v) && !dato(c).flags)
      && celdasCat.every(([, , d]) => vacia(d.v) && !d.flags);
    if (sinNada) continue;

    conDatos += 1;
    if (conDatos > MAX_FILAS) throw error(`El archivo tiene más de ${MAX_FILAS} filas`);

    const antes = errores.length;
    const falla = (columna, mensaje) => errores.push({ fila: r, columna, mensaje });
    const id = dato(1).v;

    const usrId = typeof id === 'number' ? id : (/^\d+$/.test(String(id).trim()) ? Number(String(id).trim()) : NaN);
    let asesor = null;
    if (dato(1).flags & COMBINADA) falla('A (ID)', 'No combines celdas');
    else if (vacia(id)) falla('A (ID)', 'Falta el ID del asesor');
    else if (!Number.isInteger(usrId)) falla('A (ID)', 'El ID del asesor no es válido');
    else if (vistos.has(usrId)) falla('A (ID)', 'Este asesor está repetido en el archivo');
    else {
      vistos.add(usrId);
      asesor = porId.get(usrId);
      if (!asesor) falla('A (ID)', 'Este asesor no está activo o no está a tu alcance');
      else if (clave(dato(3).v) !== clave(asesor.nombre)) {
        falla('A (ID)', 'El ID no corresponde a ese asesor: descarga la plantilla de nuevo');
      }
    }

    const valores = {};
    for (const [cat, col, d] of celdasCat) {
      const donde = `${letra(col)} (${cat})`;
      if (d.flags & COMBINADA) { falla(donde, 'No combines celdas'); continue; }
      if (d.flags & FORMULA_SIN_RESULTADO) { falla(donde, 'Abre el archivo en Excel y guárdalo de nuevo'); continue; }
      if (vacia(d.v)) { valores[cat] = 0; continue; }
      const n = entero(d.v);
      if (n === null) falla(donde, `Escribe un número entero de 0 a ${VALOR_MAXIMO.toLocaleString('es-CO')}`);
      else valores[cat] = n;
    }
    if (errores.length === antes && asesor) filas.push({ usr_id: Number(asesor.usr_id), nombre: asesor.nombre, valores });
  }
  return { filas, errores };
}

module.exports = { escribir, leer, nombreArchivo, nombreMes, HOJA, FILA_ENCABEZADO, PRIMERA_FILA };
