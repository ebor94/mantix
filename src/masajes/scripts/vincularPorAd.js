// npm run masajes:vincular-ad -- --actor <usuario> [--aplicar]
// Vincula en bloque a los beneficiarios sin vincular con su usuario del AD, emparejando por nombre.
// Sin --aplicar solo SIMULA: imprime la propuesta para revisarla. Con --aplicar vincula SOLO las coincidencias
// seguras, por el mismo camino que la pantalla de admin (historial 'vinculacion' con el actor).
// Las dudosas y las sin coincidencia se vinculan a mano en Beneficiarios.
require('dotenv').config();
const { leerConexion } = require('../config/entorno');
const { crearBdPerezosa } = require('../db');
const { crearServicioBeneficiarios } = require('../services/beneficiarios.service');
const { proponerVinculos } = require('../services/vinculacionMasiva');

const USO = 'Uso: npm run masajes:vincular-ad -- --actor <usuario AD de quien vincula> [--aplicar]';

function leerArgumentos(argv) {
  const args = { actor: null, aplicar: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--aplicar') args.aplicar = true;
    else if (argv[i] === '--actor') args.actor = argv[++i] || null;
    else return { error: `Opción desconocida: ${argv[i]}` };
  }
  if (!args.actor || !/^[a-z0-9._-]{2,80}$/i.test(args.actor)) return { error: 'Falta --actor (usuario AD de quien vincula)' };
  return { args };
}

function imprimir({ seguros, revisar, sinCoincidencia }, aplicar) {
  console.log(`\nCOINCIDENCIAS SEGURAS (${seguros.length})${aplicar ? '' : ' — se vincularían con --aplicar'}:`);
  for (const s of seguros) console.log(`  #${s.id}  ${s.nombre}  →  ${s.usuario}  (AD: ${s.nombreAd})`);
  console.log(`\nREVISAR A MANO (${revisar.length}) — varios candidatos o nombre parecido:`);
  for (const r of revisar) console.log(`  #${r.id}  ${r.nombre}  →  ${r.candidatos.map((c) => `${c.usuario} (${c.nombreAd})`).join(' | ')}`);
  console.log(`\nSIN COINCIDENCIA EN EL AD (${sinCoincidencia.length}):`);
  for (const n of sinCoincidencia) console.log(`  #${n.id}  ${n.nombre}`);
}

async function main(argv = process.argv.slice(2), { listarUsuarios = () => require('../../h360/services/ldap.service').listarUsuariosDirectorio(), bd: bdExterna } = {}) {
  const { args, error } = leerArgumentos(argv);
  if (error) { console.error(`${error}\n${USO}`); return 1; }
  let bd = bdExterna;
  if (!bd) {
    const conexion = leerConexion(process.env);
    if (!conexion.ok) { console.error(`masajes:vincular-ad — ${conexion.motivo}`); return 1; }
    bd = crearBdPerezosa(() => conexion.db);
  }
  try {
    const [pendientes] = await bd.obtener().query('SELECT id, nombre FROM msj_beneficiarios WHERE ad_usuario IS NULL AND activo = 1 ORDER BY nombre');
    const [vinculados] = await bd.obtener().query('SELECT ad_usuario FROM msj_beneficiarios WHERE ad_usuario IS NOT NULL');
    if (!pendientes.length) { console.log('No hay beneficiarios activos sin vincular.'); return 0; }
    const usuarios = await listarUsuarios();
    console.log(`${pendientes.length} beneficiario(s) sin vincular · ${usuarios.length} usuario(s) activos en el AD`);
    const p = proponerVinculos(pendientes, usuarios, vinculados.map((v) => v.ad_usuario));
    imprimir(p, args.aplicar);
    if (!args.aplicar) { console.log('\nSIMULACIÓN: no se vinculó a nadie. Revisa la lista y repite con --aplicar.'); return 0; }

    const servicio = crearServicioBeneficiarios({ bd });
    let hechos = 0;
    for (const s of p.seguros) {
      try {
        await servicio.actualizar({ id: s.id, datos: { adUsuario: s.usuario }, actor: args.actor, auditoria: { origen: 'masajes:vincular-ad' } });
        hechos += 1;
      } catch (err) {
        console.error(`  no se vinculó #${s.id}: ${err.codigo || err.code || err.message}`);
      }
    }
    console.log(`\nVinculados: ${hechos} de ${p.seguros.length}. Los demás, a mano en Beneficiarios.`);
    return hechos === p.seguros.length ? 0 : 1;
  } catch (err) {
    console.error(`masajes:vincular-ad falló: ${err.code || err.message}`);
    return 1;
  } finally {
    if (!bdExterna) await bd.cerrar();
  }
}

if (require.main === module) main().then((code) => { process.exitCode = code; });

module.exports = { leerArgumentos, main };
