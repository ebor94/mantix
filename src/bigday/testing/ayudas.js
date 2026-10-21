// Ayudas de prueba del módulo bigday (no es un archivo de pruebas: no termina en .test.js).
const express = require('express');
const { crearRouterBigday } = require('../routes');
const { bigdayErrorHandler } = require('../middleware/errorHandler');

/** Repositorio en memoria: misma interfaz que el de MySQL. */
function repoEnMemoria() {
  const filas = new Map();
  const repo = {
    async guardar(fila) {
      if (filas.has(fila.uuid)) return 'duplicada';
      filas.set(fila.uuid, fila);
      return 'creada';
    },
    async listar() {
      // Como el de MySQL: sin ip_hash ni ua_hash.
      return [...filas.values()].map(({ ip_hash, ua_hash, uuid, ...resto }) => resto);
    },
    async ping() {},
  };
  return { repo, filas };
}

/** App mínima que replica el montaje de Mantix: trust proxy, parser de 10 KB y manejador de errores. */
function crearAppPrueba({ repositorio, config }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use('/api/bigday', express.json({ limit: '10kb' }));
  app.use('/api/bigday', express.urlencoded({ limit: '10kb', extended: false }));
  app.use('/api/bigday/v1', crearRouterBigday({ repositorio, config }));
  app.use('/api/bigday', bigdayErrorHandler);
  return app;
}

module.exports = { repoEnMemoria, crearAppPrueba };
