/**
 * sv/config/db.js
 * Pool mysql2 para consultas RAW del módulo SerVentas.
 * Usa las mismas variables DB_* del backend mantix; apunta a serfuweb.
 * Para acceso vía Sequelize se usa el sequelize central (src/models).
 */
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  timezone: '-05:00'
});

module.exports = pool;
