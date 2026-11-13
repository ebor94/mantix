// Conexión a la base de pruebas (la crea globalSetup). Solo se permite una base *_test en MySQL local.
require('./env');
const mysql = require('mysql2/promise');
const { crearBdPerezosa } = require('../db');

const HOSTS_LOCALES = ['127.0.0.1', 'localhost', '::1'];

/** Guarda del setup destructivo (DROP DATABASE): solo bases *_test y solo MySQL local. */
function validarBdPrueba(env) {
  const bd = env.DB_NAME;
  if (!/_test$/.test(bd)) throw new Error(`Por seguridad, la BD de pruebas debe terminar en _test (recibido: ${bd})`);
  if (!HOSTS_LOCALES.includes(env.DB_HOST)) {
    throw new Error(`Por seguridad, las pruebas de Duelo solo corren contra MySQL local (recibido: ${env.DB_HOST})`);
  }
}

const conexionDePrueba = () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function abrirConexion() {
  validarBdPrueba(process.env);
  const conn = await mysql.createConnection({
    ...conexionDePrueba(), charset: 'utf8mb4', timezone: '-05:00', multipleStatements: true,
  });
  await conn.query("SET time_zone = '-05:00'");
  return conn;
}

/** Pool perezoso del módulo contra la base de pruebas (cerrar con bd.cerrar()). */
function crearBdDePrueba() {
  validarBdPrueba(process.env);
  return crearBdPerezosa(conexionDePrueba);
}

module.exports = { abrirConexion, validarBdPrueba, crearBdDePrueba };
