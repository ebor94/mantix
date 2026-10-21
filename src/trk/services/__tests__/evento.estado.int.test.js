const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const logger = require('../../../utils/logger');
const TrkError = require('../../utils/TrkError');
const rankingDatos = require('../rankingDatos.service');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, categoria } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
let admin;

beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
});
afterEach(() => jest.restoreAllMocks());
afterAll(cerrar);

// Deja el evento en modo RANKING sobre una categoría con ranking publicado.
// Se hace antes de instalar el spy: cambiarPantalla también llama a estadoPublico.
async function enModoRanking() {
  const cat = await categoria('PEQ_MED');
  await cat.update({ ranking_publicado: true });
  await request(servidor).put('/api/trk/v1/evento/pantalla')
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ modo: 'RANKING', categoria_id: cat.id })
    .expect(200);
}

test('error inesperado al cargar el ranking: 200 con ranking null y se registra como error', async () => {
  await enModoRanking();
  const errorHijo = jest.fn();
  // El middleware apiCodigo también usa logger.child (con info), por eso el hijo falso expone ambos.
  jest.spyOn(logger, 'child').mockReturnValue({ info: jest.fn(), error: errorHijo });
  jest.spyOn(rankingDatos, 'rankingPublicado').mockRejectedValueOnce(new Error('db caida'));

  const r = await request(servidor).get('/api/trk/v1/evento/estado');

  expect(r.status).toBe(200);
  expect(r.body.data).toMatchObject({ modo_pantalla: 'RANKING', ranking: null });
  expect(logger.child).toHaveBeenCalledWith(expect.objectContaining({ modulo: 'trk' }));
  expect(errorHijo).toHaveBeenCalledWith(
    'estadoPublico: fallo al cargar ranking publicado',
    expect.objectContaining({ name: 'Error', stack: expect.any(String) })
  );
  // El mensaje del error puede traer datos personales: nunca se registra.
  expect(JSON.stringify(errorHijo.mock.calls)).not.toContain('db caida');
});

test('RANKING_NO_PUBLICADO: 200 con ranking null y NO se registra como error', async () => {
  await enModoRanking();
  const errorHijo = jest.fn();
  jest.spyOn(logger, 'child').mockReturnValue({ info: jest.fn(), error: errorHijo });
  jest.spyOn(rankingDatos, 'rankingPublicado').mockRejectedValueOnce(new TrkError(404, 'RANKING_NO_PUBLICADO', 'x'));

  const r = await request(servidor).get('/api/trk/v1/evento/estado');

  expect(r.status).toBe(200);
  expect(r.body.data.ranking).toBeNull();
  expect(errorHijo).not.toHaveBeenCalled();
});
