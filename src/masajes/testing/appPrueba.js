// App Express con el router real de Masajes contra la BD de pruebas; el directorio activo es falso.
require('./env');
const express = require('express');
const { crearRouterMasajes } = require('../routes');
const { leerEntorno } = require('../config/entorno');
const { montarParsersMasajes } = require('../middleware/parsers');

function configDePrueba() {
  const e = leerEntorno(process.env);
  if (!e.ok) throw new Error(`Config de prueba inválida: ${e.motivo}`);
  return e.config;
}

/** Cada llamada crea routers nuevos (y con ellos limitadores de intentos nuevos). */
function crearAppPrueba({ bd, directorio, config = configDePrueba(), reloj, limites }) {
  const app = express();
  app.set('trust proxy', 1);
  montarParsersMasajes(app);
  app.use(express.json({ limit: '10mb' })); // como el global de Mantix: el de Masajes (10 KB) debe ganar
  app.use('/api/masajes/v1', crearRouterMasajes({ bd, obtenerConfig: () => config, directorio, reloj, ...(limites ? { limites } : {}) }));
  return app;
}

module.exports = { crearAppPrueba, configDePrueba };
