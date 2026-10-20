// Valores por defecto para pruebas TRK. No pisa variables ya definidas.
const os = require('os');
const path = require('path');

const DEFAULTS = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3307',
  DB_NAME: 'serfuweb_test',
  DB_USER: 'root',
  DB_PASSWORD: 'trk_test',
  JWT_SECRET: 'test-jwt-mantix',
  TRK_JWT_SECRET: 'test-jwt-trk',
  TRK_FOTOS_PATH: path.join(os.tmpdir(), 'trk-fotos-test'),
  LOG_LEVEL: 'error'
};

for (const [clave, valor] of Object.entries(DEFAULTS)) {
  if (!process.env[clave]) process.env[clave] = valor;
}

module.exports = DEFAULTS;
