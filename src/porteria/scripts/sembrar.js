// npm run porteria:sembrar -- --sede <id> (--placas ABC123,XYZ789 | --todos) [--simular]
// Exactamente uno de --placas o --todos: sembrar toda la flota se pide de forma explícita.
// Puesta en marcha: marca como dentro de la sede a los propios activos sin estado. Se puede correr varias veces
// (por ejemplo, una por sede con --placas) sin duplicar ni pisar estados.
// --simular no escribe: muestra lo que se sembraría y lo que se omitiría. Sale con código 2 si alguna placa pedida
// con --placas no es un vehículo activo de la empresa.
const os = require('os');
const { normalizarPlaca } = require('../utils/placa');

const USO = 'Uso: npm run porteria:sembrar -- --sede <id> (--placas ABC123,XYZ789 | --todos) [--simular]';

function leerArgumentos(argv) {
  const valores = {};
  let todos = false;
  let simular = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--todos') {
      if (todos) throw new Error(USO);
      todos = true;
    } else if (token === '--simular') {
      if (simular) throw new Error(USO);
      simular = true;
    } else if (token === '--sede' || token === '--placas') {
      const valor = argv[i + 1];
      if (token in valores || typeof valor !== 'string' || valor.startsWith('--')) throw new Error(USO);
      valores[token] = valor;
      i += 1;
    } else {
      throw new Error(USO);
    }
  }
  const sede = valores['--sede'];
  if (typeof sede !== 'string' || !/^\d{1,9}$/.test(sede) || Number(sede) <= 0) throw new Error(USO);
  const lista = valores['--placas'];
  if (todos === (lista !== undefined)) throw new Error(USO); // exactamente uno de los dos
  if (todos) return { sedeId: Number(sede), placas: null, simular };
  const placas = lista.split(',').map(normalizarPlaca).filter(Boolean);
  if (!placas.length) throw new Error(USO);
  return { sedeId: Number(sede), placas, simular };
}

const NO_ACTIVO = 'no es un vehículo activo de la empresa';

/** 2 si alguna placa pedida explícitamente quedó omitida por no ser un vehículo activo; si no, 0. */
function codigoSalida(placas, omitidos) {
  return placas && omitidos.some((o) => o.razon === NO_ACTIVO) ? 2 : 0;
}

/** Quién corrió la carga, para la auditoría. */
function usuarioDeCarga() {
  try {
    const { username } = os.userInfo();
    return username ? `carga-inicial:${username}` : 'carga-inicial';
  } catch (_) {
    return 'carga-inicial';
  }
}

async function main() {
  require('dotenv').config();
  const { leerConexion } = require('../config/entorno');
  const { crearBdPerezosa } = require('../db');
  const { crearH360Lectura } = require('../services/h360Lectura.service');
  const { crearServicioSiembra } = require('../services/siembra.service');

  const { sedeId, placas, simular } = leerArgumentos(process.argv.slice(2));
  const conexion = leerConexion();
  if (!conexion.ok) throw new Error(conexion.motivo);
  console.log(`Base: ${conexion.db.host}/${conexion.db.database}`);
  const bd = crearBdPerezosa(() => conexion.db);
  try {
    const { sembrados, omitidos } = await crearServicioSiembra({ bd, h360: crearH360Lectura(bd) })
      .sembrarPropios({
        sedeId, placas, simular, usuario: usuarioDeCarga(), alResolverSede: (s) => console.log(`Sede: ${s.id} — ${s.nombre}`),
      });
    if (simular) console.log('Simulación: no se escribió nada.');
    const verbo = simular ? 'Se sembrarían' : 'Sembrados';
    console.log(`${verbo} en la sede ${sedeId}: ${sembrados.length}${sembrados.length ? ` (${sembrados.join(', ')})` : ''}`);
    for (const { placa, razon } of omitidos) console.log(`Omitido ${placa}: ${razon}`);
    process.exitCode = codigoSalida(placas, omitidos);
  } finally {
    await bd.cerrar();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`porteria:sembrar — ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { leerArgumentos, codigoSalida, usuarioDeCarga };
