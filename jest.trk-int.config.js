// Pruebas de integración TRK contra MySQL de prueba (npm run trk:db:test).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/trk/**/*.int.test.js'],
  setupFiles: ['<rootDir>/src/trk/testing/env.js'],
  globalSetup: '<rootDir>/src/trk/testing/globalSetup.js',
  testTimeout: 30000
};
