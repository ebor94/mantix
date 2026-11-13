// Pruebas de integración de Duelo contra MySQL de prueba (npm run duelo:db:test).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/duelo/**/*.int.test.js'],
  setupFiles: ['<rootDir>/src/duelo/testing/env.js'],
  globalSetup: '<rootDir>/src/duelo/testing/globalSetup.js',
  testTimeout: 30000,
};
