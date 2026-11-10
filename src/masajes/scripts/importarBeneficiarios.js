// npm run masajes:importar -- <ruta.xlsx> --actor <usuario> [--simular]
// Carga inicial del listado (spec §15). Mismo servicio que usará el endpoint de admin (Tarea 11).
// Imprime solo conteos y números de fila: nunca nombres, celulares ni correos.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { leerConexion } = require('../config/entorno');
const { crearBdPerezosa } = require('../db');
const { crearServicioBeneficiarios } = require('../services/beneficiarios.service');

const MAX_BYTES = 2 * 1024 * 1024; // mismo límite que la subida por la API (spec §17.7)
const USO = 'Uso: npm run masajes:importar -- <ruta.xlsx> --actor <usuario> [--simular]';

function leerArgumentos(argv) {
  const args = { ruta: null, actor: null, simular: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--simular') args.simular = true;
    else if (a === '--actor') args.actor = argv[++i] || null;
    else if (a.startsWith('--')) return { error: `Opción desconocida: ${a}` };
    else if (!args.ruta) args.ruta = a;
    else return { error: 'Solo se acepta una ruta' };
  }
  if (!args.ruta) return { error: 'Falta la ruta del xlsx' };
  if (!args.actor || !/^[a-z0-9._-]{2,80}$/i.test(args.actor)) return { error: 'Falta --actor (usuario AD de quien importa)' };
  if (path.extname(args.ruta).toLowerCase() !== '.xlsx') return { error: 'El archivo debe ser .xlsx' };
  return { args };
}

function leerArchivo(ruta) {
  const st = fs.statSync(ruta);
  if (!st.isFile()) throw new Error('La ruta no es un archivo');
  if (st.size > MAX_BYTES) throw new Error('El archivo supera 2 MB');
  return fs.readFileSync(ruta);
}

function imprimirResumen(r, simular) {
  console.log(simular ? 'SIMULACIÓN (no se escribió nada)' : (r.aplicado ? 'Importación aplicada' : 'Importación NO aplicada'));
  console.log(`  creados: ${r.creados}  actualizados: ${r.actualizados}  sin cambios: ${r.sinCambios}`);
  for (const e of r.errores) console.log(`  ERROR fila ${e.fila}: ${e.motivo}`);
  for (const a of r.advertencias) console.log(`  aviso fila ${a.fila}: ${a.motivo}`);
}

async function main(argv = process.argv.slice(2)) {
  const { args, error } = leerArgumentos(argv);
  if (error) { console.error(`${error}\n${USO}`); return 1; }
  const conexion = leerConexion(process.env);
  if (!conexion.ok) { console.error(`masajes:importar — ${conexion.motivo}`); return 1; }

  const bd = crearBdPerezosa(() => conexion.db);
  try {
    const r = await crearServicioBeneficiarios({ bd }).importar({ buffer: leerArchivo(args.ruta), actor: args.actor, simular: args.simular });
    imprimirResumen(r, args.simular);
    return r.errores.length ? 1 : 0;
  } catch (err) {
    // El archivo inválido trae su motivo; cualquier otra cosa, solo el código (el mensaje de MySQL puede traer datos).
    const motivo = err.errors ? err.errors.map((x) => x.motivo).join(', ') : (err.code || err.message);
    console.error(`masajes:importar falló: ${motivo}`);
    return 1;
  } finally {
    await bd.cerrar();
  }
}

if (require.main === module) main().then((code) => { process.exitCode = code; });

module.exports = { leerArgumentos, main, MAX_BYTES };
