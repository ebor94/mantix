/**
 * Servidor para pruebas E2E (Playwright). Recrea la BD serfuweb_e2e_test, siembra datos
 * ficticios y sirve /api/trk/v1 + fotos en TRK_E2E_PORT (3021).
 * Requiere MySQL de prueba: npm run trk:db:test
 */
process.env.DB_NAME = process.env.DB_NAME || 'serfuweb_e2e_test';
require('../testing/env');
const http = require('http');

(async () => {
  await require('../testing/globalSetup')();
  const { semillaE2E } = require('../testing/semillaE2E');
  const { crearAppTrk } = require('../testing/app');
  await semillaE2E();
  const server = http.createServer(crearAppTrk({ estaticos: true }));
  require('../sockets').attach(server);
  const puerto = Number(process.env.TRK_E2E_PORT || 3021);
  server.listen(puerto, () => console.log(`TRK E2E escuchando en ${puerto}`));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
