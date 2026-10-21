// Pruebas de integración de bigday contra un MySQL 8 efímero (npm run test:bigday:int).
// Variables: BIGDAY_TEST_DB_HOST (obligatoria; sin ella las pruebas se omiten), BIGDAY_TEST_DB_PORT,
// BIGDAY_TEST_DB_USER, BIGDAY_TEST_DB_PASSWORD, BIGDAY_TEST_DB_NAME. Ejemplo:
//   docker run -d --name bigday-int-test -p 33307:3306 -e MYSQL_ROOT_PASSWORD=test -e MYSQL_DATABASE=serfuweb mysql:8
//   BIGDAY_TEST_DB_HOST=127.0.0.1 BIGDAY_TEST_DB_PORT=33307 BIGDAY_TEST_DB_PASSWORD=test npm run test:bigday:int
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/bigday/**/*.int.test.js'],
  testTimeout: 30000
};
