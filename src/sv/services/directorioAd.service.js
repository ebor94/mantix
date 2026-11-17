/**
 * sv/services/directorioAd.service.js
 * Búsqueda de cuentas del directorio activo para el alta de usuarios.
 * listarUsuariosDirectorio() trae el dominio completo (paginado, hasta 60 s),
 * así que la lista se cachea en memoria 10 minutos y se filtra aquí.
 */
const ldap = require('../../h360/services/ldap.service');

const TTL_MS = 10 * 60 * 1000;
const MIN_CARACTERES = 3;
const MAX_RESULTADOS = 20;

let cache = null; // { cargadoEn, lista }

function error(code, message) { const e = new Error(message); e.code = code; return e; }
function plano(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function obtenerLista() {
  if (cache && Date.now() - cache.cargadoEn < TTL_MS) return cache.lista;
  let lista;
  try {
    lista = await ldap.listarUsuariosDirectorio();
  } catch (_) {
    throw error('AD_NO_DISPONIBLE', 'No hay conexión con el directorio activo, intenta en unos minutos.');
  }
  cache = { cargadoEn: Date.now(), lista };
  return lista;
}

async function buscar(q) {
  const termino = plano(String(q || '').trim());
  if (termino.length < MIN_CARACTERES) {
    throw error('VALIDATION_ERROR', `Escribe al menos ${MIN_CARACTERES} caracteres`);
  }
  const lista = await obtenerLista();
  return lista
    .filter(u => plano(`${u.usuario} ${u.nombre} ${u.mail}`).includes(termino))
    .slice(0, MAX_RESULTADOS)
    .map(u => ({ usuario: u.usuario, nombre: u.nombre, mail: u.mail }));
}

module.exports = { buscar };
