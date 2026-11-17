/**
 * sv/services/usuariosAd.service.js
 * Vincula los usuarios de GenFlow con su identidad y su cuenta del directorio
 * activo (alta/edición desde Gestión de usuarios).
 */
const { Op } = require('sequelize');
const { OrgIdentidad } = require('../../identity/models');
const { SvUsuario } = require('../models');
const ldap = require('../../h360/services/ldap.service');
const {
  normalizarAdUsuario, asegurarIdentidad, vincularAdUsuario
} = require('../../identity/services/vinculoAd.service');

class UsuarioAdError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function resolverIdentidad({
  adUsuario, email, nombre, apellido, telefono, idIdentidadActual = null, permitirCambio = false,
  usrIdActual = null, actorUsrId = null
}) {
  const ad = normalizarAdUsuario(adUsuario);
  const enDirectorio = ad ? await ldap.buscarUsuarioPorSam(ad) : null;
  if (!enDirectorio) {
    throw new UsuarioAdError('AD_USUARIO_NO_EXISTE', 'No se encontró ese usuario de red en el directorio activo.');
  }
  let identidad = idIdentidadActual ? await OrgIdentidad.findByPk(idIdentidadActual) : null;
  if (!identidad) identidad = await asegurarIdentidad({ email, nombre, apellido, telefono });

  // Otra persona de GenFlow ya usa esta identidad: no se puede apropiar.
  const where = { usr_id_identidad: identidad.id_identidad };
  if (usrIdActual != null) where.usr_id = { [Op.ne]: usrIdActual };
  if (await SvUsuario.count({ where }) > 0) {
    throw new UsuarioAdError('IDENTIDAD_EN_USO',
      `La identidad de ${identidad.email_norm} ya pertenece a otro usuario de GenFlow.`);
  }

  const adAnterior = identidad.ad_usuario ?? null;
  await vincularAdUsuario(identidad, ad, { permitirCambio });
  if (adAnterior !== ad) {
    console.log(JSON.stringify({
      tag: 'ADMIN_AD_VINCULO', actor_usr_id: actorUsrId, usr_id: usrIdActual,
      id_identidad: identidad.id_identidad, ad_anterior: adAnterior, ad_nuevo: ad
    }));
  }
  return identidad.id_identidad;
}

async function adUsuariosPorIdentidad(ids) {
  const unicos = [...new Set((ids || []).filter(Boolean))];
  if (!unicos.length) return new Map();
  const rows = await OrgIdentidad.findAll({
    where: { id_identidad: { [Op.in]: unicos } },
    attributes: ['id_identidad', 'ad_usuario'],
    raw: true
  });
  return new Map(rows.map(r => [r.id_identidad, r.ad_usuario]));
}

module.exports = { resolverIdentidad, adUsuariosPorIdentidad, UsuarioAdError };
