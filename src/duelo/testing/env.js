// Valores por defecto para las pruebas de integración de Duelo. No pisa variables ya definidas.
const DEFAULTS = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3310',
  DB_NAME: 'duelo_test',
  DB_USER: 'root',
  DB_PASSWORD: 'duelo_test',
  DUELO_PANEL_USUARIO: 'panel',
  DUELO_PANEL_CLAVE: 'clave-de-prueba',
  DUELO_JWT_SECRET: 'secreto-de-prueba-duelo-0123456789abcdef',
  DUELO_VERSION_POLITICA: 'borrador',
  LOG_LEVEL: 'error',
};

for (const [clave, valor] of Object.entries(DEFAULTS)) {
  if (!process.env[clave]) process.env[clave] = valor;
}

module.exports = DEFAULTS;
