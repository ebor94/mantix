// Valores por defecto para las pruebas de integración de Masajes. No pisa variables ya definidas.
const DEFAULTS = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3309',
  DB_NAME: 'masajes_test',
  DB_USER: 'root',
  DB_PASSWORD: 'msj_test',
  JWT_SECRET: 'test-jwt-mantix',
  PORTERIA_JWT_SECRET: 'test-jwt-porteria-0123456789abcdef0123',
  MASAJES_JWT_SECRET: 'test-jwt-masajes-0123456789abcdef01234567',
  MSJ_GRUPO_ADMIN_DN: 'CN=GG-Masajes-Admin,OU=Grupos,DC=olivos,DC=local',
  LOG_LEVEL: 'error',
};

for (const [clave, valor] of Object.entries(DEFAULTS)) {
  if (!process.env[clave]) process.env[clave] = valor;
}

module.exports = DEFAULTS;
