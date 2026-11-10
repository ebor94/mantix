// Pruebas de integración de Masajes contra MySQL de prueba (npm run masajes:db:test).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/masajes/**/*.int.test.js'],
  setupFiles: ['<rootDir>/src/masajes/testing/env.js'],
  globalSetup: '<rootDir>/src/masajes/testing/globalSetup.js',
  testTimeout: 30000,
};
