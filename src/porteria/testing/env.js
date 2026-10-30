// Valores por defecto para las pruebas de integración de Portería. No pisa variables ya definidas.
const DEFAULTS = {
  DB_HOST: '127.0.0.1',
  DB_PORT: '3308',
  DB_NAME: 'porteria_test',
  DB_USER: 'root',
  DB_PASSWORD: 'por_test',
  JWT_SECRET: 'test-jwt-mantix',
  PORTERIA_JWT_SECRET: 'test-jwt-porteria-0123456789abcdef0123',
  LDAP_GROUP_PORTERIA_GUARDA: 'PorteriaGuardas',
  LDAP_GROUP_PORTERIA_ADMIN: 'PorteriaAdmins',
  LOG_LEVEL: 'error',
};

for (const [clave, valor] of Object.entries(DEFAULTS)) {
  if (!process.env[clave]) process.env[clave] = valor;
}

module.exports = DEFAULTS;
