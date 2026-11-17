/**
 * identity/services/proponerVinculosAd.js
 * Empareja identidades sin ad_usuario con cuentas del directorio activo.
 * Solo es "segura" la coincidencia exacta y única del mail; el resto se revisa a mano.
 */
function normalizar(s) {
  return String(s || '').trim().toLowerCase();
}

function proponerVinculos(identidades, directorio, usados = new Set()) {
  const libres = directorio
    .map(d => ({ usuario: normalizar(d.usuario), nombre: d.nombre || '', mail: normalizar(d.mail) }))
    .filter(d => d.usuario && !usados.has(d.usuario));

  const seguras = [];
  const revisar = [];
  const sinCoincidencia = [];

  for (const i of identidades) {
    const email = normalizar(i.email_norm);
    const porMail = libres.filter(d => d.mail && d.mail === email);
    if (porMail.length === 1) {
      seguras.push({ id_identidad: i.id_identidad, email, usuario: porMail[0].usuario, nombreAd: porMail[0].nombre });
      continue;
    }
    const prefijo = email.split('@')[0];
    const candidatos = porMail.length > 1 ? porMail : libres.filter(d => d.usuario === prefijo);
    if (candidatos.length) {
      revisar.push({
        id_identidad: i.id_identidad,
        email,
        candidatos: candidatos.map(c => ({ usuario: c.usuario, nombre: c.nombre, mail: c.mail }))
      });
    } else {
      sinCoincidencia.push({ id_identidad: i.id_identidad, email });
    }
  }
  return { seguras, revisar, sinCoincidencia };
}

module.exports = { proponerVinculos };
