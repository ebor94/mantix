// Pruebas de integración de bigday contra un MySQL 8 efímero (npm run test:bigday:int).
// Estas pruebas hacen DROP/DELETE: solo corren si BIGDAY_TEST_DB_HOST es 127.0.0.1 o localhost y se indica
// BIGDAY_TEST_DB_NAME (sin valor por defecto, para no tocar nunca serfuweb por descuido).
// Variables: BIGDAY_TEST_DB_HOST, BIGDAY_TEST_DB_NAME (obligatorias), BIGDAY_TEST_DB_PORT, _USER, _PASSWORD. Ejemplo:
//   docker run -d --name bigday-int-test -p 33307:3306 -e MYSQL_ROOT_PASSWORD=test -e MYSQL_DATABASE=bigday_test mysql:8 --default-time-zone=-05:00
//   BIGDAY_TEST_DB_HOST=127.0.0.1 BIGDAY_TEST_DB_PORT=33307 BIGDAY_TEST_DB_PASSWORD=test BIGDAY_TEST_DB_NAME=bigday_test npm run test:bigday:int
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/bigday/**/*.int.test.js'],
  testTimeout: 30000
};
