// App Express mínima con el router de Portería y dependencias falsas (jest.fn), reemplazables por prueba.
const express = require('express');
const { crearRouterPorteria } = require('../routes');
const { firmarToken } = require('../services/auth.service');

const CONFIG = Object.freeze({
  jwtSecret: 'secreto-de-prueba-porteria-0123456789abcdef',
  jwtExpires: '12h',
  grupos: { guarda: 'PorteriaGuardas', admin: 'PorteriaAdmins', adminGeneral: 'Admins' },
});

function crearAppPrueba(deps = {}) {
  const todas = {
    bd: { ping: async () => {} },
    obtenerConfig: () => CONFIG,
    directorio: { validarCredenciales: jest.fn() },
    conductores: { listar: jest.fn(async () => []), existe: jest.fn(async () => false) },
    h360: {
      listarSedes: jest.fn(async () => []),
      obtenerSede: jest.fn(async () => null),
      buscarVehiculosPropios: jest.fn(async () => []),
      buscarAsistencias: jest.fn(async () => []),
      buscarExequias: jest.fn(async () => []),
      obtenerVehiculoPropioPorPlaca: jest.fn(async () => null),
    },
    motivos: { listarActivos: jest.fn(async () => []) },
    vehiculosExternos: {
      buscar: jest.fn(async () => []),
      obtenerPorId: jest.fn(async () => null),
      crear: jest.fn(async () => 1),
      actualizar: jest.fn(async () => true),
    },
    eventos: {
      registrar: jest.fn(async () => ({})),
      listar: jest.fn(async () => ({ items: [], total: 0, pagina: 1, por_pagina: 50 })),
      obtener: jest.fn(async () => null),
      corregir: jest.fn(async () => ({})),
      anular: jest.fn(async () => ({})),
    },
    estado: {
      sugerir: jest.fn(async () => ({})),
      dentro: jest.fn(async () => []),
      fuera: jest.fn(async () => []),
    },
    ...deps,
  };
  const app = express();
  app.use(express.json());
  app.use('/api/porteria/v1', crearRouterPorteria(todas));
  return { app, deps: todas };
}

const tokenDe = ({ usuario = 'guarda1', nombre = 'Guarda Uno', rol = 'guarda', sede = null } = {}) =>
  firmarToken({ usuario, nombre, rol, sede }, CONFIG);

module.exports = { crearAppPrueba, tokenDe, CONFIG };
