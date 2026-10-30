// npm run porteria:sembrar -- --sede <id> (--placas ABC123,XYZ789 | --todos)
// Exactamente uno de --placas o --todos: sembrar toda la flota se pide de forma explícita.
// Puesta en marcha: marca como dentro de la sede a los propios activos sin estado. Se puede correr varias veces
// (por ejemplo, una por sede con --placas) sin duplicar ni pisar estados.
const { normalizarPlaca } = require('../utils/placa');

const USO = 'Uso: npm run porteria:sembrar -- --sede <id> (--placas ABC123,XYZ789 | --todos)';

function leerArgumentos(argv) {
  const valores = {};
  let todos = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--todos') {
      if (todos) throw new Error(USO);
      todos = true;
    } else if (token === '--sede' || token === '--placas') {
      const valor = argv[i + 1];
      if (token in valores || typeof valor !== 'string') throw new Error(USO);
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
  if (todos) return { sedeId: Number(sede), placas: null };
  const placas = lista.split(',').map(normalizarPlaca).filter(Boolean);
  if (!placas.length) throw new Error(USO);
  return { sedeId: Number(sede), placas };
}

async function main() {
  require('dotenv').config();
  const { leerConexion } = require('../config/entorno');
  const { crearBdPerezosa } = require('../db');
  const { crearH360Lectura } = require('../services/h360Lectura.service');
  const { crearServicioSiembra } = require('../services/siembra.service');

  const { sedeId, placas } = leerArgumentos(process.argv.slice(2));
  const conexion = leerConexion();
  if (!conexion.ok) throw new Error(conexion.motivo);
  const bd = crearBdPerezosa(() => conexion.db);
  try {
    const { sembrados, omitidos } = await crearServicioSiembra({ bd, h360: crearH360Lectura(bd) })
      .sembrarPropios({ sedeId, placas, usuario: 'carga-inicial' });
    console.log(`Sembrados en la sede ${sedeId}: ${sembrados.length}${sembrados.length ? ` (${sembrados.join(', ')})` : ''}`);
    for (const { placa, razon } of omitidos) console.log(`Omitido ${placa}: ${razon}`);
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

module.exports = { leerArgumentos };
