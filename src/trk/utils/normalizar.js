// Normalización de datos de la hoja TRIKIPELUDOS (§7) y utilidades de texto.
const { RAZAS_PEQUENAS, RAZAS_GRANDES } = require('../config/constantes');

function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(valor) {
  return normalizarTexto(valor).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'usuario';
}

const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

function normalizarEspecie(valor) {
  const original = String(valor ?? '').trim();
  const n = normalizarTexto(original);
  let especie = null;
  if (/^(perr|canin)/.test(n)) especie = 'PERRO';
  else if (/^(gat|fel)/.test(n)) especie = 'GATO';
  const resto = original.replace(/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+/, '').trim();
  return { especie, extra: especie && resto ? resto : null };
}

function normalizarSexo(valor) {
  const n = normalizarTexto(valor);
  if (n.startsWith('mach')) return 'MACHO';
  if (n.startsWith('hemb')) return 'HEMBRA';
  return null;
}

function mapearCategoria(valor) {
  const n = normalizarTexto(valor).replace(/\.+$/, '').trim();
  if (n.startsWith('perros pequenos') || n.includes('pequenos y medianos')) return 'PEQ_MED';
  if (n.startsWith('perros grandes') || n === 'grandes') return 'GRANDES';
  if (n.startsWith('gatico') || n.startsWith('gato') || n.startsWith('felino')) return 'FELINOS';
  if (n.startsWith('disfraz familiar') || n.startsWith('familiar')) return 'FAMILIAR';
  return null;
}

const telefonoValido = (digitos) => /^\d{10}$/.test(String(digitos ?? ''));

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};
const dosDigitos = (n) => String(n).padStart(2, '0');

// Solo acepta fechas que existen en el calendario (p. ej. no 31/02 ni 29/02 de año no bisiesto).
function fechaExiste(anio, mes, dia) {
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia;
}

function parsearFechaInscripcion(valor) {
  const n = normalizarTexto(valor);
  let m = n.match(/^([a-z]+) (\d{1,2}), (\d{4})/);
  if (m && Object.hasOwn(MESES, m[1])) {
    const mes = MESES[m[1]];
    return fechaExiste(Number(m[3]), mes, Number(m[2]))
      ? `${m[3]}-${dosDigitos(mes)}-${dosDigitos(m[2])}`
      : null;
  }
  m = n.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m && fechaExiste(Number(m[3]), Number(m[2]), Number(m[1]))) {
    return `${m[3]}-${dosDigitos(m[2])}-${dosDigitos(m[1])}`;
  }
  return null;
}

const parsearAutorizacion = (valor) => ['on', 'si', 'true', 'acepto', 'x', '1'].includes(normalizarTexto(valor));

function primerNombre(nombre) {
  const primero = String(nombre ?? '').trim().split(/\s+/)[0] || '';
  return primero ? primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase() : '';
}

const ENCABEZADOS = {
  'nombre del responsable': 'responsable_nombre',
  'documento de identidad': 'responsable_documento',
  telefono: 'responsable_telefono',
  'correo electronico': 'responsable_correo',
  'nombre de la mascota': 'mascota_nombre',
  especie: 'especie',
  raza: 'raza',
  'edad de la mascota': 'edad_texto',
  sexo: 'sexo',
  'cateogoria de participacion': 'categoria',
  'categoria de participacion': 'categoria',
  'autorizacion de datos': 'autoriza_datos',
  'autorizacion de reglamento': 'autoriza_reglamento',
  'fecha inscripcion': 'fecha_inscripcion',
  'fecha de inscripcion': 'fecha_inscripcion',
  'nombre del disfraz': 'disfraz_nombre',
  'fotografia participante': 'foto_inscripcion_url'
};

function campoDeEncabezado(encabezado) {
  const n = normalizarTexto(encabezado);
  if (!n) return 'notas';
  return Object.hasOwn(ENCABEZADOS, n) ? ENCABEZADOS[n] : null;
}

const contieneAlguna = (raza, lista) => {
  const n = normalizarTexto(raza);
  return Boolean(n) && lista.some((r) => n.includes(r));
};
const esRazaGrande = (raza) => contieneAlguna(raza, RAZAS_GRANDES);
const esRazaPequena = (raza) => !esRazaGrande(raza) && contieneAlguna(raza, RAZAS_PEQUENAS);

module.exports = {
  normalizarTexto, slug, soloDigitos, normalizarEspecie, normalizarSexo, mapearCategoria, telefonoValido,
  parsearFechaInscripcion, parsearAutorizacion, primerNombre, campoDeEncabezado, esRazaPequena, esRazaGrande
};
