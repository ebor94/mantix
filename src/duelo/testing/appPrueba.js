// App Express mínima con el router de Duelo y dependencias falsas (jest.fn), reemplazables por prueba.
const express = require('express');
const { crearRouterDuelo } = require('../routes');

const ORIGEN = 'https://losolivoscucuta.com';
const CONFIG = Object.freeze({
  abiertas: true,
  versionPolitica: 'borrador',
  origenes: [ORIGEN],
  fotosPath: '/tmp/duelo-no-usado',
  contacto: '300 000 0000',
  panel: { usuario: 'panel', clave: 'clave-de-prueba' },
  jwtSecret: 'secreto-de-prueba-duelo-0123456789abcdef',
  jwtExpires: '2h',
  correo: { canal: 'ninguno' },
  cupoMaximo: null,
  limiteInscripciones: 30,
  turnstileSecret: null,
});

// opciones.sinJson: no monta express.json() (simula una petición no multipart sin parser de cuerpo).
function crearAppPrueba(deps = {}, opciones = {}) {
  const todas = {
    bd: { ping: async () => {} },
    obtenerConfig: () => CONFIG,
    http: { post: jest.fn(async () => ({ data: { success: true } })) },
    repo: {
      contar: jest.fn(async () => 0),
      listar: jest.fn(async () => ({ inscripciones: [], totales: { inscritos: 0, honran: 0, fotos: 0 } })),
      companeroPorId: jest.fn(async () => null),
      fotosParaZip: jest.fn(async () => []),
    },
    fotos: { ruta: jest.fn(() => null) },
    servicio: {
      inscribir: jest.fn(async () => ({ id: 1, datos: {} })),
      notificarInscripcion: jest.fn(async () => {}),
    },
    ...deps,
  };
  const app = express();
  app.set('trust proxy', 1);
  if (!opciones.sinJson) app.use(express.json());
  app.use('/api/duelo/v1', crearRouterDuelo(todas));
  return { app, deps: todas };
}

module.exports = { crearAppPrueba, CONFIG, ORIGEN };
