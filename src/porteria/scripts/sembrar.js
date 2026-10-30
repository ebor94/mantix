// npm run porteria:sembrar -- --sede <id> [--placas ABC123,XYZ789]
// Puesta en marcha: marca como dentro de la sede a los propios activos sin estado. Se puede correr varias veces
// (por ejemplo, una por sede con --placas) sin duplicar ni pisar estados.
const { normalizarPlaca } = require('../utils/placa');

const USO = 'Uso: npm run porteria:sembrar -- --sede <id> [--placas ABC123,XYZ789]';

function leerArgumentos(argv) {
  const valor = (nombre) => {
    const i = argv.indexOf(nombre);
    return i === -1 ? undefined : argv[i + 1];
  };
  const sede = valor('--sede');
  if (typeof sede !== 'string' || !/^\d{1,9}$/.test(sede) || Number(sede) <= 0) throw new Error(USO);
  const lista = valor('--placas');
  if (argv.includes('--placas') && typeof lista !== 'string') throw new Error(USO);
  const placas = lista === undefined ? null : lista.split(',').map(normalizarPlaca).filter(Boolean);
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
