// Errores de carga masiva (CSV real con csv-parse) y de los filtros de archivo: deben
// llegar como 422 con su mensaje, no como "Error interno".
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../src/sv/models', () => ({
  SvLista: { create: jest.fn() }, SvPersona: {}, SvUsuario: {},
  SvProspecto: { findOne: jest.fn(), create: jest.fn() }, SvEstado: { findOne: jest.fn() }
}));
jest.mock('../src/sv/services/personas.service', () => ({ crear: jest.fn() }));
jest.mock('../src/sv/services/fidelizacion.service', () => ({}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const M = require('../src/sv/models');
const personas = require('../src/sv/services/personas.service');
const listas = require('../src/sv/services/listas.service');
const { capturarAsync } = require('../src/sv/utils/capturarAsync');
const { svErrorHandler } = require('../src/sv/middleware/svErrorHandler');
const { escuchar, cerrarTodos } = require('./helpers/servidorLocal');

let dir;
let lista;

beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-listas-')); });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  jest.resetAllMocks();
  lista = { lista_id: 1, update: jest.fn(async () => {}) };
  M.SvLista.create.mockResolvedValue(lista);
  M.SvEstado.findOne.mockResolvedValue({ estado_id: 11 });
  M.SvProspecto.findOne.mockResolvedValue(null);
  personas.crear.mockResolvedValue({ persona_id: 500 });
});
afterEach(cerrarTodos);

function cargar(csv) {
  const filePath = path.join(dir, `lista-${Date.now()}-${Math.random()}.csv`);
  fs.writeFileSync(filePath, csv);
  return listas.cargarDesdeArchivo({
    filePath, originalName: 'lista.csv', areaId: 1, grupoId: 1, fuenteId: 1, asesorId: 7, nombreLista: 'L', usuarioId: 7
  });
}

describe('carga masiva', () => {
  test.each([
    ['una fila con más columnas', 'nombre,telefono\nAna,3001234567\nLuis,3007654321,Cúcuta', 3],
    ['una comilla sin cerrar', 'nombre,telefono\n"Ana,3001234567', 2]
  ])('%s: VALIDATION_ERROR con la línea y la lista fallida', async (_caso, csv, linea) => {
    const e = await cargar(csv).then(() => null, (err) => err);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.message).toBe(`El archivo CSV no es válido (línea ${linea}). Revisa que todas las filas tengan las mismas columnas y que no falten comillas.`);
    expect(lista.update).toHaveBeenCalledWith(expect.objectContaining({
      lista_estado: 'fallida', lista_log: { error: expect.stringContaining('CSV inválido: ') }
    }));
    expect(M.SvProspecto.create).not.toHaveBeenCalled();
  });

  test('un grupo sin estados: VALIDATION_ERROR con su mensaje', async () => {
    M.SvEstado.findOne.mockResolvedValue(null);
    const e = await cargar('nombre,telefono\nAna,3001234567').then(() => null, (err) => err);
    expect(e.code).toBe('VALIDATION_ERROR');
    expect(e.message).toBe('No hay estados activos configurados para el grupo');
  });

  test('un CSV correcto se sigue cargando', async () => {
    await cargar('nombre,telefono\nAna,3001234567');
    expect(M.SvProspecto.create).toHaveBeenCalledTimes(1);
    expect(lista.update).toHaveBeenLastCalledWith(expect.objectContaining({ lista_importadas: 1, lista_estado: 'completada' }));
  });
});

describe('filtros de archivo', () => {
  function app(subir) {
    const router = express.Router();
    router.post('/subir', subir, (req, res) => res.json({ ok: 1 }));
    capturarAsync(router);
    router.use(svErrorHandler);
    const a = express();
    a.use('/api/sv', router);
    return escuchar(a);
  }

  test('la lista masiva rechaza lo que no es CSV', async () => {
    const { uploadMiddleware } = require('../src/sv/controllers/listas.controller');
    const r = await request(await app(uploadMiddleware)).post('/api/sv/subir')
      .attach('archivo', Buffer.from('x'), { filename: 'lista.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ success: false, error: 'VALIDATION_ERROR', message: 'Solo se aceptan archivos CSV' });
  });

  test('la evidencia de fidelización rechaza lo que no es imagen', async () => {
    const { uploadFotoMiddleware } = require('../src/sv/controllers/fidelizacion.controller');
    const r = await request(await app(uploadFotoMiddleware)).post('/api/sv/subir')
      .attach('foto', Buffer.from('x'), { filename: 'foto.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ success: false, error: 'VALIDATION_ERROR', message: 'Solo se aceptan imágenes (jpg/png/webp)' });
  });
});
