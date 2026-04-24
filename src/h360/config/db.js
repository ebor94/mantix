/**
 * h360/config/db.js
 * Conexión raw mysql2 para las tablas H360 (asistencias, etapas, etc.)
 * Usa las mismas variables de entorno que el resto de mantix (DB_HOST, etc.)
 */
const mysql = require('mysql2/promise')

const pool = mysql.createPool({
  host:            process.env.DB_HOST,
  port:            parseInt(process.env.DB_PORT || '3306'),
  user:            process.env.DB_USER,
  password:        process.env.DB_PASSWORD,   // mantix usa DB_PASSWORD
  database:        process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
})

module.exports = pool
