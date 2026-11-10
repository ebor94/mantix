// Celulares de los beneficiarios (spec §4 y §10.3). Háblame recibe 573XXXXXXXXX: móviles colombianos.

const MOVIL_CO = /^573\d{9}$/;
const SOLO_FORMATO = /^\+?[\d\s\-().]+$/; // dígitos y separadores comunes; un "+" opcional al inicio
const MAX_ENTRADA = 30;

/** Normaliza a 573XXXXXXXXX o devuelve null. Acepta texto o un entero (exceljs puede leer la celda como número). */
function normalizarCelular(entrada) {
  let s;
  if (typeof entrada === 'number') {
    if (!Number.isSafeInteger(entrada) || entrada <= 0) return null;
    s = String(entrada);
  } else if (typeof entrada === 'string') {
    s = entrada.trim();
  } else {
    return null;
  }
  if (s === '' || s.length > MAX_ENTRADA || !SOLO_FORMATO.test(s)) return null;

  let digitos = s.replace(/\D/g, '');
  if (digitos.length === 14 && digitos.startsWith('00')) digitos = digitos.slice(2); // 0057…
  if (digitos.length === 10 && digitos.startsWith('3')) digitos = `57${digitos}`;
  return MOVIL_CO.test(digitos) ? digitos : null;
}

/** Para logs y tablas: 57315****079. Lo que no es un celular normalizado se oculta completo. */
function enmascararCelular(celular) {
  if (typeof celular !== 'string' || !MOVIL_CO.test(celular)) return '****';
  return `${celular.slice(0, 5)}****${celular.slice(-3)}`;
}

module.exports = { normalizarCelular, enmascararCelular };
