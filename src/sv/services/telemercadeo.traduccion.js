/**
 * sv/services/telemercadeo.traduccion.js
 * Convierte una fila leída del libro de telemercadeo en el plan de GenFlow:
 * estado, prioridad, fuente, punto, productos, persona y gestión.
 * Funciones puras. Reglas aprobadas con el usuario el 2026-11-27.
 */
const { plano, clave, fechaIso } = require('./telemercadeo.lector');

const CODIGOS_ESTADO = ['INTERESADO', 'CONTACTADO', 'DESCARTADO'];
const CODIGOS_FUENTE = ['LISTA_TELE', 'REFERIDO', 'ENCUESTA', 'TITULO', 'BASE_EXHUMACIONES', 'OTROS'];
const CODIGOS_PUNTO = ['GC', 'PARQUE', 'SJ'];
const CODIGOS_PRODUCTO = ['PRE-SCR-01', 'PRE-SOL-01', 'PRE-CRR', 'PRE-CRT', 'PRE-CLM', 'PRE-CNZ',
  'PRE-OSR', 'PRE-EXL', 'PRE-INL', 'PRE-PRR', 'PRE-UT', 'PRE-LOT'];

const TELE = 'LISTA_TELE';
const soloFuente = (fuente) => ({ fuente, punto: null });
const sede = (punto) => ({ fuente: TELE, punto });
// Lo que trae PUNTO DE ATENCION, pasado por clave(). La columna mezcla fuentes y sedes.
const PUNTOS_DE_ATENCION = new Map([
  ['telemercadeo', soloFuente(TELE)],
  ['referido', soloFuente('REFERIDO')],
  ['encuesta', soloFuente('ENCUESTA')],
  ['titulo', soloFuente('TITULO')],
  ['base de exhumacion', soloFuente('BASE_EXHUMACIONES')],
  ['otro', soloFuente('OTROS')],
  ['gran colombia', sede('GC')],
  ['parque', sede('PARQUE')],
  ['san jose', sede('SJ')]
]);
const VENTA = /\bventas?\b/;

function fuenteYPunto(textoPunto) {
  const k = clave(textoPunto);
  if (!k) return { fuente: TELE, punto: null, aviso: 'sin punto de atención' };
  const regla = PUNTOS_DE_ATENCION.get(k);
  if (regla) return { ...regla, aviso: null };
  return { fuente: TELE, punto: null, aviso: `punto de atención no reconocido: ${textoPunto}` };
}

// Palabras clave → productos, en el orden en que aparecen en el texto (el primero es el principal).
function productosDeTexto(textoProducto) {
  const t = plano(textoProducto);
  const hallados = [];
  const buscar = (re, codigo) => {
    const m = re.exec(t);
    if (m) hallados.push([m.index, codigo]);
  };
  const servicio = /servic/.test(t);
  const cremacion = /crem/.test(t);
  const exhumacion = /exhum/.test(t);
  if (servicio) buscar(/servic/, cremacion ? 'PRE-SCR-01' : 'PRE-SOL-01');
  else if (cremacion) buscar(/crem/, exhumacion ? 'PRE-CRR' : 'PRE-CRT');
  buscar(/columb/, 'PRE-CLM');
  buscar(/ceniz/, 'PRE-CNZ');
  buscar(/osa(r|ir)i?o/, 'PRE-OSR');
  buscar(/exhum/, 'PRE-EXL');
  buscar(/inhum/, 'PRE-INL');
  buscar(/pror+og/, 'PRE-PRR');
  buscar(/lote/, /arr?iend|arrend/.test(t) ? 'PRE-UT' : 'PRE-LOT');
  return [...new Set(hallados.sort((a, b) => a[0] - b[0]).map(([, codigo]) => codigo))];
}

function estadoDe(interes, proxima) {
  if (interes === 'S') return { codigo: 'INTERESADO', proxima, avisos: proxima ? [] : ['interesado sin próxima gestión'] };
  if (interes === 'N') return proxima ? { codigo: 'CONTACTADO', proxima, avisos: [] } : { codigo: 'DESCARTADO', proxima: null, avisos: [] };
  if (interes === 'SN') return { codigo: 'CONTACTADO', proxima, avisos: ['marcado S y N a la vez'] };
  return { codigo: 'CONTACTADO', proxima, avisos: [] };
}

function prioridadDe(hora) {
  return VENTA.test(plano(hora)) ? 2 : 3;
}

// La fecha dd/mm/aaaa más reciente del comentario que no sea futura; si no hay, la de
// la hoja si no es futura; si no, el día de la carga.
function fechaGestion(comentario, fechaHoja, hoy) {
  let masNueva = null;
  for (const m of String(comentario ?? '').matchAll(/\d{1,2}\/\d{1,2}\/\d{4}/g)) {
    const iso = fechaIso(m[0]);
    if (iso && iso >= '2000-01-01' && iso <= hoy && (!masNueva || iso > masNueva)) masNueva = iso;
  }
  if (masNueva) return masNueva;
  if (fechaHoja && fechaHoja <= hoy) return fechaHoja;
  return hoy;
}

function comentarioGestion({ hora, comentario, archivo, hoja, fila }) {
  const partes = [];
  if (hora && !['venta', 'ventas'].includes(clave(hora))) partes.push(`HORA: ${hora}`);
  if (comentario) partes.push(comentario);
  const origen = `Cargado del Excel «${archivo}», hoja ${hoja}, fila ${fila}.`;
  return partes.length ? `${partes.join('\n')}\n\n${origen}` : origen;
}

function traducirFila(fila, { archivo, hoy }) {
  const avisos = [];
  // Hoja de agenda (hoy o futura) sin PROXIMA GESTION: la próxima es el día de la hoja.
  const proxima = fila.proxima ?? (fila.fechaHoja && fila.fechaHoja >= hoy ? fila.fechaHoja : null);
  const estado = estadoDe(fila.interes, proxima);
  avisos.push(...estado.avisos);
  const fp = fuenteYPunto(fila.punto);
  if (fp.aviso) avisos.push(fp.aviso);
  const productos = productosDeTexto(fila.producto);
  if (fila.producto && !productos.length) avisos.push(`producto no reconocido: ${fila.producto}`);
  if (!fila.nombre) avisos.push('sin nombre');
  return {
    persona: {
      nombre: fila.nombre ? fila.nombre.slice(0, 100) : '(sin nombre)',
      telefono: fila.telefonos[0],
      alterno: fila.telefonos[1] ?? null
    },
    estado: estado.codigo,
    proxima: estado.proxima,
    prioridad: prioridadDe(fila.hora),
    fuente: fp.fuente,
    punto: fp.punto,
    productos,
    notaInicial: fila.producto ? `Producto en el Excel: ${fila.producto}` : null,
    gestion: {
      fecha: fechaGestion(fila.comentario, fila.fechaHoja, hoy),
      comentario: comentarioGestion({ hora: fila.hora, comentario: fila.comentario, archivo, hoja: fila.hoja, fila: fila.fila })
    },
    avisos
  };
}

module.exports = {
  traducirFila, productosDeTexto, estadoDe, prioridadDe, fuenteYPunto, fechaGestion, comentarioGestion,
  CODIGOS_ESTADO, CODIGOS_FUENTE, CODIGOS_PUNTO, CODIGOS_PRODUCTO
};
