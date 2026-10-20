const { PERMISOS_TRK } = require('../config/constantes');

function leerPermisosRol(rol) {
  const p = rol && rol.permisos;
  if (!p) return {};
  return typeof p === 'string' ? JSON.parse(p) : p;
}

// Permisos TRK efectivos: super admin = todos; si no, roles.permisos.trk filtrado a PERMISOS_TRK.
function permisosTrk(usuario) {
  if (!usuario) return {};
  if (usuario.es_super_admin) return Object.fromEntries(PERMISOS_TRK.map((p) => [p, true]));
  const trk = leerPermisosRol(usuario.rol).trk || {};
  return Object.fromEntries(PERMISOS_TRK.filter((p) => trk[p] === true).map((p) => [p, true]));
}

const tienePermiso = (usuario, accion) => permisosTrk(usuario)[accion] === true;

// COMPLETO: ve documento/teléfono/correo (admin y cabina, spec RNF-5). PUBLICO: el resto.
function nivelDatos(usuario) {
  const p = permisosTrk(usuario);
  return p.cabina || p.administrar || p.editar ? 'COMPLETO' : 'PUBLICO';
}

module.exports = { permisosTrk, tienePermiso, nivelDatos };
