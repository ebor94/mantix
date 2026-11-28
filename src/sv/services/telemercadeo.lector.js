/**
 * sv/services/telemercadeo.lector.js
 * Lee un libro de telemercadeo de Prenecesidad (una hoja por día) y devuelve las
 * filas de clientes limpias, más las incidencias de lectura. No toca la base.
 * Diseño: crm-frontend docs/superpowers/specs/2026-11-27-migracion-telemercadeo-design.md
 */
const ExcelJS = require('exceljs');
const { normalizar, esValido } = require('../utils/telefono');

const FILAS_BUSQUEDA_ENCABEZADO = 15;
const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};
// Títulos de columna, ya pasados por clave().
const TITULOS = [
  ['numero', /^(n|no|nro|numero)$/],
  ['hora', /^hora$/],
  ['nombre', /^nombres?$/],
  ['telefono', /^(telefonos?|celular(es)?)$/],
  ['comentario', /^comentarios?$/],
  ['producto', /^productos?$/],
  ['inter', /^inter(es|esado)?$/],
  ['punto', /^punto( de atencion)?$/],
  ['proxima', /^proxima gestion$/]
];
// Columnas que pueden faltar: la hoja se carga igual, con un aviso.
const OPCIONALES = [
  ['hora', 'HORA'], ['comentario', 'COMENTARIO'], ['producto', 'PRODUCTO'],
  ['punto', 'PUNTO DE ATENCION'], ['proxima', 'PROXIMA GESTION']
];
// Una casilla puede traer dos números («3001234567 - 3101234567»). Un guion sin
// espacios alrededor («607-5712345») no separa: es parte de un fijo.
const SEPARADORES_TELEFONO = /\s*[/,;]\s*|\s+y\s+|\s+-\s*|\s*-\s+/i;

// Sin tildes, en minúsculas y con los espacios juntados.
function plano(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Como plano(), y además sin signos: «N°» → «n», «OBSERVACIONES:» → «observaciones».
function clave(s) {
  return plano(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

const dos = (n) => String(n).padStart(2, '0');
const isoDeUtc = (f) => `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`;

function isoValida(a, m, d) {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

// Fecha de Excel (Date), número de serie o texto dd/mm/aaaa → 'AAAA-MM-DD', o null.
function fechaIso(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoDeUtc(v);
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    return isoDeUtc(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000));
  }
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return isoValida(a, mes, d) ? `${a}-${dos(mes)}-${dos(d)}` : null;
}

function valor(cell) {
  let v = cell.value;
  // En una fórmula, cell.result conserva un 0 que value.result pierde.
  if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) v = cell.result;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if (Array.isArray(v.richText)) v = v.richText.map((r) => r.text).join('');
    else if (typeof v.text === 'string') v = v.text;
    else v = null; // error de Excel u objeto desconocido
  }
  return v ?? null;
}

function texto(v) {
  if (v == null) return '';
  if (v instanceof Date) return isoDeUtc(v);
  return String(v).trim();
}

function telefonos(v) {
  const crudo = typeof v === 'number' ? String(Math.round(v)) : texto(v);
  const validos = [];
  for (const parte of crudo.split(SEPARADORES_TELEFONO)) {
    const n = normalizar(parte);
    if (!n) continue;
    // Dos celulares pegados sin separador.
    const candidatos = /^\d{20}$/.test(n) ? [n.slice(0, 10), n.slice(10)] : [n];
    for (const c of candidatos) if (esValido(c) && !validos.includes(c)) validos.push(c);
  }
  return { crudo, validos };
}

function buscarEncabezado(ws) {
  const tope = Math.min(FILAS_BUSQUEDA_ENCABEZADO, ws.rowCount);
  for (let r = 1; r <= tope; r++) {
    const cols = {};
    const inter = [];
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
      const k = clave(texto(valor(cell)));
      if (!k) return;
      for (const [campo, re] of TITULOS) {
        if (!re.test(k)) continue;
        if (campo === 'inter') inter.push(c);
        else if (cols[campo] == null) cols[campo] = c;
      }
    });
    if (cols.nombre == null || cols.telefono == null) continue;
    // INTER combinado en dos columnas, con «S» y «N» en la fila siguiente.
    const sub = ws.getRow(r + 1);
    const marca = (letra) => inter.find((c) => clave(texto(valor(sub.getCell(c)))) === letra) ?? null;
    const dosColumnas = inter.length >= 2 && (marca('s') != null || marca('n') != null);
    return {
      fila: r,
      desde: dosColumnas ? r + 2 : r + 1,
      // La casilla FECHA se busca solo hasta aquí: más a la derecha está la lista del desplegable.
      ultima: Math.max(...Object.values(cols), ...inter),
      cols: {
        ...cols,
        interS: dosColumnas ? marca('s') : null,
        interN: dosColumnas ? marca('n') : null,
        interUnica: dosColumnas ? null : (inter[0] ?? null)
      }
    };
  }
  return null;
}

function fechaDeHoja(ws, enc, nombreArchivo, incidencias) {
  for (let r = 1; r < enc.fila; r++) {
    const fila = ws.getRow(r);
    let etiqueta = null;
    for (let c = 1; c <= enc.ultima && etiqueta == null; c++) {
      if (clave(texto(valor(fila.getCell(c)))).startsWith('fecha')) etiqueta = c;
    }
    if (etiqueta == null) continue;
    for (let c = etiqueta + 1; c <= enc.ultima; c++) {
      const v = valor(fila.getCell(c));
      const t = texto(v);
      if (!t || clave(t).startsWith('fecha')) continue; // vacía, o la misma etiqueta combinada
      const iso = fechaIso(v);
      if (iso) return iso;
      incidencias.push({ hoja: ws.name, fila: r, tipo: 'aviso', mensaje: `la casilla FECHA no trae una fecha válida: ${t}` });
      break;
    }
  }
  const m = /^(\d{1,2})\s*de\s*([a-z]+)/.exec(plano(ws.name));
  const anio = /(20\d{2})/.exec(nombreArchivo || '');
  if (m && MESES[m[2]] && anio) {
    const [d, mes, a] = [Number(m[1]), MESES[m[2]], Number(anio[1])];
    if (isoValida(a, mes, d)) return `${a}-${dos(mes)}-${dos(d)}`;
  }
  return null;
}

function interesDe(celda, cols) {
  if (cols.interS != null || cols.interN != null) {
    const s = texto(celda(cols.interS)) !== '';
    const n = texto(celda(cols.interN)) !== '';
    if (s && n) return 'SN';
    if (s) return 'S';
    return n ? 'N' : '';
  }
  const k = clave(texto(celda(cols.interUnica)));
  if (k === 's' || k === 'si') return 'S';
  if (k === 'n' || k === 'no') return 'N';
  return '';
}

function leerFila(ws, r, enc, fechaHoja, incidencias) {
  const { cols } = enc;
  const fila = ws.getRow(r);
  const celda = (c) => (c == null ? null : valor(fila.getCell(c)));
  const corto = (c) => texto(celda(c)).replace(/\s+/g, ' ');
  const nombre = corto(cols.nombre);
  const tel = celda(cols.telefono);
  if (!nombre && texto(tel) === '') return null; // filas con solo N°
  const aviso = (mensaje) => incidencias.push({ hoja: ws.name, fila: r, tipo: 'aviso', mensaje });

  const { crudo, validos } = telefonos(tel);
  if (validos.length > 2) aviso(`trae ${validos.length} teléfonos; se usan los dos primeros`);

  let proxima = null;
  const vProxima = celda(cols.proxima);
  if (texto(vProxima)) {
    proxima = fechaIso(vProxima);
    if (!proxima) aviso(`próxima gestión no se pudo leer: ${texto(vProxima)}`);
  }

  const salida = {
    hoja: ws.name,
    fechaHoja,
    fila: r,
    nombre,
    telefonoOriginal: crudo,
    telefonos: validos.slice(0, 2),
    hora: corto(cols.hora),
    comentario: texto(celda(cols.comentario)), // tal como viene: solo recortado
    producto: corto(cols.producto),
    interes: interesDe(celda, cols),
    punto: corto(cols.punto),
    proxima,
    descarte: null
  };
  if (!validos.length) {
    salida.descarte = { resultado: 'error', detalle: 'teléfono inválido' };
    incidencias.push({ hoja: ws.name, fila: r, tipo: 'error', mensaje: `teléfono inválido: ${crudo || '(vacío)'}` });
  }
  return salida;
}

// Mismo teléfono principal en varias filas: gana la hoja con fecha más reciente y,
// con la misma fecha, la fila leída después.
function marcarRepetidos(filas) {
  const ganadora = new Map();
  const reemplazo = (g) => ({ resultado: 'omitido', detalle: `reemplazada por ${g.hoja} fila ${g.fila}` });
  for (const f of filas) {
    if (f.descarte) continue;
    const previa = ganadora.get(f.telefonos[0]);
    if (!previa) {
      ganadora.set(f.telefonos[0], f);
    } else if (f.fechaHoja >= previa.fechaHoja) {
      previa.descarte = reemplazo(f);
      ganadora.set(f.telefonos[0], f);
    } else {
      f.descarte = reemplazo(previa);
    }
  }
}

async function leerLibro(origen, nombreArchivo) {
  const wb = new ExcelJS.Workbook();
  // Las validaciones de columnas enteras ocupan mucha memoria y no se usan.
  const opciones = { ignoreNodes: ['dataValidations'] };
  if (Buffer.isBuffer(origen)) await wb.xlsx.load(origen, opciones);
  else await wb.xlsx.readFile(origen, opciones);

  const filas = [];
  const incidencias = [];
  for (const ws of wb.worksheets) {
    const deHoja = (tipo, mensaje) => incidencias.push({ hoja: ws.name, fila: null, tipo, mensaje });
    const enc = buscarEncabezado(ws);
    if (!enc) {
      deHoja('error', 'no se encontró el encabezado con NOMBRE y TELEFONO; la hoja no se carga');
      continue;
    }
    const fechaHoja = fechaDeHoja(ws, enc, nombreArchivo, incidencias);
    if (!fechaHoja) {
      deHoja('error', 'no se pudo saber la fecha de la hoja: llena la casilla FECHA o pon el año en el nombre del archivo; la hoja no se carga');
      continue;
    }
    for (const [campo, titulo] of OPCIONALES) if (enc.cols[campo] == null) deHoja('aviso', `falta la columna ${titulo}`);
    if (enc.cols.interS == null && enc.cols.interN == null && enc.cols.interUnica == null) deHoja('aviso', 'falta la columna INTER');
    for (let r = enc.desde; r <= ws.rowCount; r++) {
      const fila = leerFila(ws, r, enc, fechaHoja, incidencias);
      if (fila) filas.push(fila);
    }
  }
  marcarRepetidos(filas);
  return { filas, incidencias };
}

module.exports = { leerLibro, plano, clave, fechaIso, telefonos };
