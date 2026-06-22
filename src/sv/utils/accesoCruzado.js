/**
 * sv/utils/accesoCruzado.js
 *
 * Regla de negocio: un ASESOR con grupo EMPRESARIALES o PAP puede operar
 * AMBOS módulos (Empresariales B2B y PAP puerta a puerta). Se mantiene el
 * aislamiento por asesor — solo ve sus propios prospectos en cada uno —
 * pero la navegación, el SelectorArea y los endpoints aceptan ambas áreas.
 *
 * Esto se logra mutando las asociaciones `gruposExtra` y `areasExtra` del
 * objeto usuario JUSTO después de cargarlo de BD. Todos los consumidores
 * (acceso.js, publicUser, queries con scope) lo ven transparente.
 *
 * Se invoca desde:
 *   - middleware/svAuth.js  (cada request autenticado)
 *   - controllers/auth.controller.js → login (al emitir sesión nueva)
 */

const { ROLES } = require('../config/constants');
const { SvGrupo, SvArea } = require('../models');

const GRUPO_EMP = 'EMPRESARIALES';
const GRUPO_PAP = 'PAP';
const AREA_EMP  = 'PREV-EMP';
const AREA_PAP  = 'PREV-PAP';

let cache = null;

async function cargarCatalogos() {
  if (cache) return cache;
  const [gEmp, gPap, aEmp, aPap] = await Promise.all([
    SvGrupo.findOne({ where: { grupo_codigo: GRUPO_EMP } }),
    SvGrupo.findOne({ where: { grupo_codigo: GRUPO_PAP } }),
    SvArea.findOne({ where: { area_codigo: AREA_EMP } }),
    SvArea.findOne({ where: { area_codigo: AREA_PAP } })
  ]);
  cache = { gEmp, gPap, aEmp, aPap };
  return cache;
}

/**
 * Muta `usuario.gruposExtra` y `usuario.areasExtra` para inyectar el grupo/área
 * espejo cuando aplique la regla. Idempotente: no agrega duplicados.
 */
async function enriquecerAccesoCruzado(usuario) {
  if (!usuario || !usuario.rol) return usuario;
  if (usuario.rol.rol_codigo !== ROLES.ASESOR) return usuario;
  const codGrupo = usuario.grupo?.grupo_codigo;
  if (codGrupo !== GRUPO_EMP && codGrupo !== GRUPO_PAP) return usuario;

  const { gEmp, gPap, aEmp, aPap } = await cargarCatalogos();
  if (!gEmp || !gPap || !aEmp || !aPap) return usuario;

  const grupoEspejo = codGrupo === GRUPO_EMP ? gPap : gEmp;
  const areaEspejo  = codGrupo === GRUPO_EMP ? aPap : aEmp;

  const gruposExtra = Array.isArray(usuario.gruposExtra) ? usuario.gruposExtra : [];
  const areasExtra  = Array.isArray(usuario.areasExtra)  ? usuario.areasExtra  : [];

  if (!gruposExtra.some(g => g.grupo_id === grupoEspejo.grupo_id)) {
    gruposExtra.push(grupoEspejo);
  }
  if (!areasExtra.some(a => a.area_id === areaEspejo.area_id)) {
    areasExtra.push(areaEspejo);
  }

  usuario.gruposExtra = gruposExtra;
  usuario.areasExtra  = areasExtra;
  return usuario;
}

module.exports = { enriquecerAccesoCruzado };
