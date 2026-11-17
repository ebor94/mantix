/**
 * identity/services/vinculoAd.service.js
 * Crea identidades y las vincula con su cuenta del directorio activo
 * (org_identidad.ad_usuario = sAMAccountName en minúsculas).
 * Lo usan el login (vinculación automática), el script vincular-ad.js y el
 * alta/edición de usuarios de GenFlow.
 */
const { OrgIdentidad } = require('../models');

class VinculoAdError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function normalizarAdUsuario(raw) {
  let u = String(raw ?? '').trim().toLowerCase();
  if (u.includes('\\')) u = u.split('\\').pop();
  if (u.includes('@')) u = u.split('@')[0];
  return u.trim();
}

async function asegurarIdentidad({ email, nombre, apellido, telefono }) {
  const emailNorm = String(email || '').trim().toLowerCase();
  const existente = await OrgIdentidad.findOne({ where: { email_norm: emailNorm } });
  if (existente) return existente;
  return OrgIdentidad.create({
    email_norm:    emailNorm,
    nombre:        nombre || null,
    apellido:      apellido || null,
    telefono:      telefono || null,
    password_hash: null,
    activo:        1
  });
}

async function vincularAdUsuario(identidad, adUsuarioRaw, { permitirCambio = false } = {}) {
  const ad = normalizarAdUsuario(adUsuarioRaw);
  if (!ad) throw new VinculoAdError('AD_USUARIO_INVALIDO', 'El usuario de red es requerido.');
  if (identidad.ad_usuario === ad) return identidad;

  const otra = await OrgIdentidad.findOne({ where: { ad_usuario: ad } });
  if (otra && otra.id_identidad !== identidad.id_identidad) {
    throw new VinculoAdError('AD_USUARIO_TOMADO',
      `El usuario de red ${ad} ya está vinculado a ${otra.email_norm}.`);
  }
  if (identidad.ad_usuario && !permitirCambio) {
    throw new VinculoAdError('CORREO_CON_OTRO_AD',
      `El correo ${identidad.email_norm} ya está vinculado al usuario de red ${identidad.ad_usuario}.`);
  }
  await identidad.update({ ad_usuario: ad });
  return identidad;
}

module.exports = { normalizarAdUsuario, asegurarIdentidad, vincularAdUsuario, VinculoAdError };
