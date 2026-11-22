// App Express mínima con el router del horno y dependencias falsas (jest.fn), reemplazables por prueba.
const express = require('express');
const { crearRouterHorno } = require('../routes');
const { firmarToken } = require('../services/auth.service');

const CONFIG = Object.freeze({ jwtSecret: 'secreto-de-prueba-horno-0123456789abcdef', jwtExpires: '8h', grupo: 'INCOL_APP' });

function crearAppPrueba(deps = {}) {
  const todas = {
    bd: { ping: async () => {} },
    obtenerConfig: () => CONFIG,
    directorio: { validarCredenciales: jest.fn() },
    ...deps,
  };
  const app = express();
  app.use(express.json());
  app.use('/api/horno/v1', crearRouterHorno(todas));
  return { app, deps: todas };
}

const tokenDe = ({ usuario = 'operador1', nombre = 'Operador Uno', email = 'op@olivos.local' } = {}) =>
  firmarToken({ usuario, nombre, email }, CONFIG);

module.exports = { crearAppPrueba, tokenDe, CONFIG };
