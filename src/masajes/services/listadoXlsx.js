/**
 * Lectura del listado de beneficiarios (xlsx de Talento Humano). Solo lee: no toca la BD.
 *
 * - Errores: la fila no se puede importar (bloquean toda la importación).
 * - Advertencias: la fila se importa sin ese dato (celular o correo inválido, cargo recortado).
 * Ninguno repite el valor de la celda: pueden ser datos personales.
 *
 * Seguridad (spec §17.7): se inspecciona el zip antes de abrirlo, las fórmulas se toman por su resultado
 * guardado (nunca se evalúan) y solo se leen las columnas reconocidas.
 */
const ExcelJS = require('exceljs');
const { E } = require('../utils/MasajesError');
const { inspeccionarZip } = require('../utils/zipSeguro');
const { normalizarCelular } = require('../dominio/telefono');
const { limpiar } = require('../utils/texto');

const MAX_FILAS = 500;
const FILAS_BUSQUEDA_ENCABEZADO = 10;
const MAX_NOMBRE = 150;
const MAX_CARGO = 150;
const MAX_CORREO = 150;

// Encabezados normalizados (sin tildes, mayúsculas, solo letras y números) → campo. Incluye el "NUEMRO" del archivo real.
const ENCABEZADOS = {
  NOMBRE: 'nombre', NOMBRES: 'nombre', NOMBRECOMPLETO: 'nombre', NOMBREYAPELLIDO: 'nombre', NOMBRESYAPELLIDOS: 'nombre',
  CARGO: 'cargo',
  NUEMRODECELULAR: 'celular', NUMERODECELULAR: 'celular', NUMEROCELULAR: 'celular', CELULAR: 'celular', MOVIL: 'celular', TELEFONO: 'celular',
  CORREOELECTRONICO: 'correo', CORREO: 'correo', EMAIL: 'correo', EMAILCORPORATIVO: 'correo',
};
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
const CORREO = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

const errorArchivo = (motivo) => E.VALIDACION([{ campo: 'archivo', motivo }]);

const sinTildes = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
const normalizarEncabezado = (s) => sinTildes(limpiar(s)).toUpperCase().replace(/[^A-Z0-9]/g, '');

const capitalizar = (w) => w.split('-').map((p) => p.charAt(0).toLocaleUpperCase('es') + p.slice(1)).join('-');
function formatearNombre(s) {
  return limpiar(s).toLocaleLowerCase('es').split(' ')
    .map((w, i) => (i > 0 && PARTICULAS.has(w) ? w : capitalizar(w))).join(' ');
}
const claveNombre = (s) => sinTildes(limpiar(s)).toLocaleLowerCase('es');

/** Valor de una celda de exceljs como texto. Fórmulas → su resultado guardado; jamás se evalúan. */
function textoDeCelda(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return '';
  if (typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) return textoDeCelda(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => (t && typeof t.text === 'string' ? t.text : '')).join('');
    if ('text' in v) return textoDeCelda(v.text); // hipervínculo: el texto visible, nunca el destino
  }
  return ''; // errores (#N/A), tipos desconocidos
}

/** Para el celular: si la celda es numérica se pasa el número (exceljs lee 3152884079 como number). */
function crudoDeCelda(v) {
  if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) return crudoDeCelda(v.result);
  return typeof v === 'number' ? v : textoDeCelda(v);
}

function mapearEncabezados(row) {
  const cols = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const campo = ENCABEZADOS[normalizarEncabezado(textoDeCelda(cell.value))];
    if (campo && !cols[campo]) cols[campo] = col;
  });
  return cols;
}

function buscarListado(wb) {
  for (const ws of wb.worksheets) {
    const hasta = Math.min(FILAS_BUSQUEDA_ENCABEZADO, ws.rowCount);
    for (let r = 1; r <= hasta; r++) {
      const cols = mapearEncabezados(ws.getRow(r));
      if (cols.nombre && cols.celular) return { ws, filaEncabezado: r, cols };
    }
  }
  return null;
}

async function leerListado(buffer, { maxFilas = MAX_FILAS } = {}) {
  inspeccionarZip(buffer);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw errorArchivo('ARCHIVO_INVALIDO');
  }
  if (wb.worksheets.length === 0) throw errorArchivo('ARCHIVO_INVALIDO');

  const listado = buscarListado(wb);
  if (!listado) throw errorArchivo('SIN_ENCABEZADOS');
  const { ws, filaEncabezado, cols } = listado;

  const filas = [];
  const errores = [];
  const advertencias = [];
  const vistas = new Set();
  let conDatos = 0;

  for (let r = filaEncabezado + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const celda = (campo) => (cols[campo] ? row.getCell(cols[campo]).value : null);
    const nombreTexto = limpiar(textoDeCelda(celda('nombre')));
    const celularCrudo = crudoDeCelda(celda('celular'));
    const otros = ['cargo', 'correo'].some((c) => limpiar(textoDeCelda(celda(c))) !== '');
    if (nombreTexto === '' && limpiar(textoDeCelda(celularCrudo)) === '' && !otros) continue; // fila vacía

    conDatos += 1;
    if (conDatos > maxFilas) throw errorArchivo('DEMASIADAS_FILAS');
    if (nombreTexto === '') { advertencias.push({ fila: r, motivo: 'FILA_SIN_NOMBRE' }); continue; }

    const nombre = formatearNombre(nombreTexto);
    if (nombre.length > MAX_NOMBRE) { errores.push({ fila: r, motivo: 'NOMBRE_MUY_LARGO' }); continue; }

    let celular = null;
    if (limpiar(textoDeCelda(celularCrudo)) !== '') {
      celular = normalizarCelular(typeof celularCrudo === 'number' ? celularCrudo : limpiar(celularCrudo));
      if (!celular) advertencias.push({ fila: r, motivo: 'CELULAR_INVALIDO' });
    }

    let correo = limpiar(textoDeCelda(celda('correo'))).toLowerCase() || null;
    if (correo && (correo.length > MAX_CORREO || !CORREO.test(correo))) {
      advertencias.push({ fila: r, motivo: 'CORREO_INVALIDO' });
      correo = null;
    }

    let cargo = limpiar(textoDeCelda(celda('cargo'))) || null;
    if (cargo && cargo.length > MAX_CARGO) {
      advertencias.push({ fila: r, motivo: 'CARGO_RECORTADO' });
      cargo = cargo.slice(0, MAX_CARGO);
    }

    const clave = `${claveNombre(nombre)}|${celular || ''}`;
    if (vistas.has(clave)) { errores.push({ fila: r, motivo: 'DUPLICADA_EN_ARCHIVO' }); continue; }
    vistas.add(clave);

    filas.push({ fila: r, nombre, clave, cargo, celular, correo });
  }

  if (conDatos === 0) throw errorArchivo('SIN_FILAS');
  return { filas, errores, advertencias };
}

module.exports = { leerListado, formatearNombre, claveNombre, limpiar, PARTICULAS, MAX_FILAS };
