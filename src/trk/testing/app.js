// App Express mínima con solo el router TRK, para Supertest.
const express = require('express');

function crearAppTrk() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/trk/v1', require('../routes').router);
  return app;
}

module.exports = { crearAppTrk };
