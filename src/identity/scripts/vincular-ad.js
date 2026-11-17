/**
 * src/identity/scripts/vincular-ad.js
 *
 * Prepara el corte al login con directorio activo:
 *   1. Crea la identidad que les falta a los usuarios activos de GenFlow
 *      (sv_org_usuarios.usr_id_identidad NULL) y la enlaza.
 *   2. Empareja las identidades activas sin ad_usuario con las cuentas del AD:
 *      seguras (mail exacto y único) / revisar / sin coincidencia.
 *
 * Por defecto SOLO SIMULA. Con --aplicar escribe y vincula las seguras.
 *
 * Uso:
 *   node src/identity/scripts/vincular-ad.js
 *   node src/identity/scripts/vincular-ad.js --aplicar
 */
require('dotenv').config();
const { Op } = require('sequelize');
const ldap = require('../../h360/services/ldap.service');
const { sequelize, OrgIdentidad } = require('../models');
const { SvUsuario } = require('../../sv/models');
const { asegurarIdentidad, vincularAdUsuario } = require('../services/vinculoAd.service');
const { proponerVinculos } = require('../services/proponerVinculosAd');

const APLICAR = process.argv.includes('--aplicar');

async function crearIdentidadesFaltantes() {
  const sinIdentidad = await SvUsuario.findAll({
    where: { usr_activo: 1, usr_id_identidad: null },
    attributes: ['usr_id', 'usr_email', 'usr_nombre', 'usr_apellido', 'usr_telefono', 'usr_id_identidad']
  });
  console.log(`\n1) USUARIOS DE GENFLOW SIN IDENTIDAD (${sinIdentidad.length})${APLICAR ? '' : ' — se crearía su identidad con --aplicar'}:`);
  for (const u of sinIdentidad) {
    console.log(`  #${u.usr_id}  ${u.usr_email}`);
    if (!APLICAR || !u.usr_email) continue;
    const identidad = await asegurarIdentidad({
      email: u.usr_email, nombre: u.usr_nombre, apellido: u.usr_apellido, telefono: u.usr_telefono
    });
    await u.update({ usr_id_identidad: identidad.id_identidad });
  }
}

async function emparejar() {
  const identidades = await OrgIdentidad.findAll({
    where: { activo: 1, ad_usuario: null },
    attributes: ['id_identidad', 'email_norm'],
    raw: true
  });
  const usados = new Set((await OrgIdentidad.findAll({
    where: { ad_usuario: { [Op.ne]: null } },
    attributes: ['ad_usuario'],
    raw: true
  })).map(r => r.ad_usuario));

  const directorio = await ldap.listarUsuariosDirectorio();
  console.log(`\nDirectorio activo: ${directorio.length} cuentas. Identidades sin vincular: ${identidades.length}.`);

  const { seguras, revisar, sinCoincidencia } = proponerVinculos(identidades, directorio, usados);

  console.log(`\n2) COINCIDENCIAS SEGURAS (${seguras.length})${APLICAR ? '' : ' — se vincularían con --aplicar'}:`);
  for (const s of seguras) console.log(`  #${s.id_identidad}  ${s.email}  →  ${s.usuario}  (AD: ${s.nombreAd})`);

  console.log(`\n3) REVISAR A MANO (${revisar.length}):`);
  for (const r of revisar) {
    console.log(`  #${r.id_identidad}  ${r.email}  →  ${r.candidatos.map(c => `${c.usuario} (${c.nombre}${c.mail ? `, ${c.mail}` : ''})`).join(' | ')}`);
  }

  console.log(`\n4) SIN COINCIDENCIA EN EL AD (${sinCoincidencia.length}):`);
  for (const s of sinCoincidencia) console.log(`  #${s.id_identidad}  ${s.email}`);

  if (APLICAR) {
    for (const s of seguras) {
      const identidad = await OrgIdentidad.findByPk(s.id_identidad);
      await vincularAdUsuario(identidad, s.usuario);
    }
    console.log(`\nVinculadas: ${seguras.length}.`);
  }
}

(async () => {
  console.log(APLICAR ? '=== MODO APLICAR ===' : '=== SIMULACIÓN (no escribe nada) ===');
  try {
    await crearIdentidadesFaltantes();
    await emparejar();
    if (!APLICAR) console.log('\nNota: en simulación, las identidades del paso 1 aún no existen y no aparecen en el emparejamiento.');
    process.exitCode = 0;
  } catch (e) {
    console.error('\nERROR:', e.codigo || e.code || '', e.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
