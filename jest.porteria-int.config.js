// Pruebas de integración de Portería contra MySQL de prueba (npm run porteria:db:test).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/porteria/**/*.int.test.js'],
  setupFiles: ['<rootDir>/src/porteria/testing/env.js'],
  globalSetup: '<rootDir>/src/porteria/testing/globalSetup.js',
  testTimeout: 30000,
};
