// App Express mínima con solo el router TRK, para Supertest y E2E.
const express = require('express');
const { dirFotos } = require('../services/fotos.service');

function crearAppTrk({ estaticos = false } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  if (estaticos) app.use('/uploads/trk/fotos', express.static(dirFotos()));
  app.use('/api/trk/v1', require('../routes').router);
  return app;
}

module.exports = { crearAppTrk };
