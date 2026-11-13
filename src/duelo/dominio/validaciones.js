// Validación pura de una inscripción. El frontend tiene una copia equivalente; aquí se decide.
const MENSAJES = {
  nombre: 'Escribe tus nombres y apellidos, tal como aparecen en tu cédula.',
  cedula: 'Escribe tu número de cédula solo con números, entre 5 y 10 dígitos.',
  celular: 'Escribe un celular de 10 dígitos que empiece por 3.',
  correo: 'Revisa tu correo electrónico; parece que le falta algo.',
  honra: 'Elige una opción para continuar.',
  companerosCantidad: 'Comparte entre 1 y 3 compañeros.',
  companeroNombre: 'Escribe el nombre de tu compañero.',
  companeroFoto: 'Elige una foto de tu compañero.',
  politica: 'Para inscribirte necesitamos tu autorización de tratamiento de datos.',
  politicaVersion: 'La política de datos se actualizó. Recarga la página para leer la versión vigente.',
};

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid'];

const texto = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

function leerCompaneros(crudo) {
  try {
    const lista = JSON.parse(typeof crudo === 'string' ? crudo : '[]');
    return Array.isArray(lista) ? lista : null;
  } catch {
    return null;
  }
}

function validarInscripcion(cuerpo, { versionPolitica, ordenesConFoto }) {
  const c = cuerpo || {};
  const errores = {};

  const nombre = texto(c.nombre_completo);
  if (nombre.split(' ').length < 2 || nombre.length > 120) errores.nombre_completo = MENSAJES.nombre;

  const cedula = texto(c.cedula);
  if (!/^\d{5,10}$/.test(cedula)) errores.cedula = MENSAJES.cedula;

  const celular = texto(c.celular);
  if (!/^3\d{9}$/.test(celular)) errores.celular = MENSAJES.celular;

  const correo = texto(c.correo).toLowerCase();
  if (!CORREO.test(correo) || correo.length > 150) errores.correo = MENSAJES.correo;

  const honra = texto(c.honra_companero);
  if (honra !== 'si' && honra !== 'no') errores.honra_companero = MENSAJES.honra;

  const companeros = [];
  if (honra === 'si') {
    const lista = leerCompaneros(c.companeros);
    if (!lista || lista.length < 1 || lista.length > 3) {
      errores.companeros = MENSAJES.companerosCantidad;
    } else {
      lista.forEach((item, i) => {
        const orden = i + 1;
        const nombreCompanero = texto(item && item.nombre);
        if (!nombreCompanero || nombreCompanero.length > 60) errores[`companero_${orden}_nombre`] = MENSAJES.companeroNombre;
        if (!ordenesConFoto.has(orden)) errores[`companero_${orden}_foto`] = MENSAJES.companeroFoto;
        companeros.push({ orden, nombre: nombreCompanero });
      });
    }
  }

  if (texto(c.acepta_politica) !== 'true') errores.acepta_politica = MENSAJES.politica;
  else if (texto(c.version_politica) !== versionPolitica) errores.acepta_politica = MENSAJES.politicaVersion;

  const utm = {};
  for (const clave of UTM) utm[clave] = texto(c[clave]).slice(0, 255) || null;

  return {
    ok: Object.keys(errores).length === 0,
    errores,
    datos: {
      nombre_completo: nombre, cedula, celular, correo,
      honra_companero: honra === 'si',
      version_politica: versionPolitica,
      companeros,
      utm,
    },
  };
}

module.exports = { validarInscripcion, MENSAJES };
