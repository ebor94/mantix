const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearAppPrueba, CONFIG, ORIGEN } = require('../testing/appPrueba');
const { firmarToken } = require('../middleware/autenticacion');

afterEach(cerrarServidores);

const BASE = '/api/duelo/v1/panel';
const token = () => `Bearer ${firmarToken(CONFIG)}`;
const login = async (app, cuerpo) =>
  request(await servir(app)).post(`${BASE}/login`).set('Origin', ORIGEN).send(cuerpo);

test('login correcto devuelve un token que abre el listado', async () => {
  const { app, deps } = crearAppPrueba();
  const r = await login(app, { usuario: 'panel', clave: 'clave-de-prueba' });
  expect(r.status).toBe(200);
  const listado = await request(await servir(app)).get(`${BASE}/inscripciones`)
    .set('Authorization', `Bearer ${r.body.data.token}`);
  expect(listado.status).toBe(200);
  expect(listado.body.data.totales).toEqual({ inscritos: 0, honran: 0, fotos: 0 });
  expect(deps.repo.listar).toHaveBeenCalledWith('');
});

test('login con clave o usuario incorrectos: 401 sin pistas', async () => {
  const { app } = crearAppPrueba();
  for (const cuerpo of [{ usuario: 'panel', clave: 'x' }, { usuario: 'otro', clave: 'clave-de-prueba' }, {}]) {
    const r = await login(app, cuerpo);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, motivo: 'CREDENCIALES', message: 'Usuario o clave incorrectos' });
  }
});

test('seis intentos de login seguidos: 429', async () => {
  const { app } = crearAppPrueba();
  for (let i = 0; i < 5; i += 1) await login(app, {});
  expect((await login(app, {})).status).toBe(429);
});

test('sin token, con token inválido o de otro rol: 401', async () => {
  const jwt = require('jsonwebtoken');
  const { app } = crearAppPrueba();
  const servidor = await servir(app);
  expect((await request(servidor).get(`${BASE}/inscripciones`)).status).toBe(401);
  expect((await request(servidor).get(`${BASE}/inscripciones`).set('Authorization', 'Bearer basura')).status).toBe(401);
  const ajeno = jwt.sign({ rol: 'otro' }, CONFIG.jwtSecret);
  expect((await request(servidor).get(`${BASE}/inscripciones`).set('Authorization', `Bearer ${ajeno}`)).status).toBe(401);
});

test('el listado pasa el término de búsqueda al repositorio', async () => {
  const { app, deps } = crearAppPrueba();
  await request(await servir(app)).get(`${BASE}/inscripciones?q=ana`).set('Authorization', token());
  expect(deps.repo.listar).toHaveBeenCalledWith('ana');
});

test('sirve la foto de un compañero sin caché compartida', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duelo-panel-'));
  const archivo = path.join(dir, 'foto.jpg');
  fs.writeFileSync(archivo, 'contenido-jpg');
  const { app, deps } = crearAppPrueba();
  deps.repo.companeroPorId.mockResolvedValue({ id: 5, foto_ruta: 'uuid.jpg' });
  deps.fotos.ruta.mockReturnValue(archivo);
  const r = await request(await servir(app)).get(`${BASE}/fotos/5`).set('Authorization', token());
  expect(r.status).toBe(200);
  expect(r.headers['content-type']).toBe('image/jpeg');
  expect(r.headers['cache-control']).toBe('private, no-store');
  expect(r.body.toString()).toBe('contenido-jpg');
  expect(deps.fotos.ruta).toHaveBeenCalledWith('uuid.jpg');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('foto inexistente o id no numérico: 404', async () => {
  const { app } = crearAppPrueba();
  const servidor = await servir(app);
  expect((await request(servidor).get(`${BASE}/fotos/5`).set('Authorization', token())).status).toBe(404);
  expect((await request(servidor).get(`${BASE}/fotos/abc`).set('Authorization', token())).status).toBe(404);
});
