// src/porteria/routes/catalogos.routes.js
// Listas que el guarda usa para registrar. Solo lectura; exigen sesión pero no sede.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const PorteriaError = require('../utils/PorteriaError');
const aw = require('../utils/aw');
const { TIPOS_VEHICULO, SENTIDOS } = require('../repositorios/motivos');

/** Texto opcional de la query: recortado, vacío → undefined, máximo 50 caracteres. */
function textoOpcional(valor) {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string') throw new PorteriaError(400, 'VALIDACION', 'La búsqueda es demasiado larga');
  const texto = valor.trim();
  if (texto.length > 50) throw new PorteriaError(400, 'VALIDACION', 'La búsqueda es demasiado larga');
  return texto === '' ? undefined : texto;
}

function crearRouterCatalogos({ autenticar, h360, conductores, motivos }) {
  const router = express.Router();
  const ruta = (path, codigo, obtener) => router.get(path, apiCodigo(codigo), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await obtener(req) });
  }));

  ruta('/sedes', 'POR-CAT-001', () => h360.listarSedes());
  ruta('/vehiculos-propios', 'POR-CAT-002', (req) => h360.buscarVehiculosPropios(textoOpcional(req.query.q)));
  ruta('/conductores', 'POR-CAT-003', () => conductores.listar());
  ruta('/asistencias', 'POR-CAT-004', (req) => h360.buscarAsistencias(textoOpcional(req.query.q)));
  ruta('/exequias', 'POR-CAT-005', (req) => h360.buscarExequias({
    q: textoOpcional(req.query.q), placa: textoOpcional(req.query.placa),
  }));
  ruta('/motivos', 'POR-CAT-006', (req) => {
    const tipoVehiculo = textoOpcional(req.query.tipo_vehiculo);
    const sentido = textoOpcional(req.query.sentido);
    if ((tipoVehiculo && !TIPOS_VEHICULO.includes(tipoVehiculo)) || (sentido && !SENTIDOS.includes(sentido))) {
      throw new PorteriaError(400, 'VALIDACION', 'Tipo de vehículo o sentido inválido');
    }
    return motivos.listarActivos({ tipoVehiculo, sentido });
  });

  return router;
}

module.exports = { crearRouterCatalogos };
