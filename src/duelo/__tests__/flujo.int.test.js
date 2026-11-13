// Recorrido completo contra MySQL de prueba y disco real: inscribir, duplicado, panel y exportaciones.
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const JSZip = require('jszip');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { crearBdDePrueba, abrirConexion } = require('../testing/bd');
const { crearRouterDuelo } = require('../routes');
const { leerEntorno } = require('../config/entorno');
const { crearRepositorioInscripciones } = require('../repositorios/inscripciones');
const { crearDisponibilidad } = require('../services/disponibilidad');
const { jpg, png } = require('../testing/imagenes');
const logger = require('../../utils/logger');

const ORIGEN = 'https://losolivoscucuta.com';
const BASE = '/api/duelo/v1';
const bd = crearBdDePrueba();
const http = { post: jest.fn(async () => ({ status: 200, data: {} })) };
let dir; let app; let conn;

beforeAll(async () => {
  conn = await abrirConexion();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duelo-flujo-'));
  const config = {
    ...leerEntorno().config, fotosPath: dir, contacto: '300 000 0000',
    correo: { canal: 'n8n', url: 'https://n8n.prueba/hook', secreto: 's' },
  };
  app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(BASE, crearRouterDuelo({ bd, obtenerConfig: () => config, http }));
});
beforeEach(async () => { await conn.query('DELETE FROM duelo_inscripciones'); http.post.mockClear(); });
afterEach(cerrarServidores);
afterAll(async () => {
  await conn.end(); await bd.cerrar(); fs.rmSync(dir, { recursive: true, force: true });
});

const inscribir = async (campos, fotos = {}) => {
  let p = request(await servir(app)).post(`${BASE}/inscripciones`).set('Origin', ORIGEN)
    .field('nombre_completo', 'Ana Pérez').field('celular', '3001234567').field('correo', 'ana@correo.com')
    .field('acepta_politica', 'true').field('version_politica', 'borrador').field('utm_source', 'instagram');
  for (const [k, v] of Object.entries(campos)) p = p.field(k, v);
  for (const [k, v] of Object.entries(fotos)) p = p.attach(k, v, { filename: `${k}.bin` });
  return p;
};
const esperarCorreo = async () => {
  for (let i = 0; i < 50 && http.post.mock.calls.length === 0; i += 1) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 50)); // deja terminar marcarCorreo
};
const binario = (res, fin) => {
  const t = []; res.on('data', (x) => t.push(x)); res.on('end', () => fin(null, Buffer.concat(t)));
};

test('rama Sí con dos compañeros: guarda, notifica y aparece en el panel y en las exportaciones', async () => {
  const r = await inscribir(
    { cedula: '1090000001', honra_companero: 'si', companeros: JSON.stringify([{ nombre: 'Luna' }, { nombre: 'Máx' }]) },
    { foto_1: await jpg(3000, 1500), foto_2: await png() },
  );
  expect(r.status).toBe(201);
  await esperarCorreo();

  expect(http.post).toHaveBeenCalledWith('https://n8n.prueba/hook',
    expect.objectContaining({ correo: 'ana@correo.com', companeros: ['Luna', 'Máx'] }), expect.any(Object));
  expect(JSON.stringify(http.post.mock.calls[0][1])).not.toContain('1090000001');
  expect(fs.readdirSync(dir)).toHaveLength(2);

  const servidor = await servir(app);
  const login = await request(servidor).post(`${BASE}/panel/login`).set('Origin', ORIGEN)
    .send({ usuario: 'panel', clave: 'clave-de-prueba' });
  const auth = { Authorization: `Bearer ${login.body.data.token}` };

  const listado = await request(servidor).get(`${BASE}/panel/inscripciones`).set(auth);
  expect(listado.body.data.totales).toEqual({ inscritos: 1, honran: 1, fotos: 2 });
  const [inscrito] = listado.body.data.inscripciones;
  expect(inscrito).toMatchObject({ cedula: '1090000001', utm_source: 'instagram', correo_enviado: true });

  const foto = await request(servidor).get(`${BASE}/panel/fotos/${inscrito.companeros[0].id}`).set(auth);
  expect(foto.headers['content-type']).toBe('image/jpeg');

  const zip = await request(servidor).get(`${BASE}/panel/fotos.zip`).set(auth).buffer().parse(binario);
  expect(Object.keys((await JSZip.loadAsync(zip.body)).files).sort())
    .toEqual(['1090000001_1_luna.jpg', '1090000001_2_max.jpg']);

  expect((await request(servidor).get(`${BASE}/panel/exportar.xlsx`).set(auth)).status).toBe(200);
});

test.each([
  ['un compañero', '1090000011', ['Luna']],
  ['tres compañeros', '1090000013', ['Luna', 'Max', 'Kira']],
])('rama Sí con %s: guarda cada compañero con su foto en orden', async (_caso, cedula, nombres) => {
  const antes = fs.readdirSync(dir).length;
  const fotos = {};
  nombres.forEach((_n, i) => { fotos[`foto_${i + 1}`] = i % 2 ? png() : jpg(); });
  for (const k of Object.keys(fotos)) fotos[k] = await fotos[k];
  const r = await inscribir(
    { cedula, honra_companero: 'si', companeros: JSON.stringify(nombres.map((nombre) => ({ nombre }))) }, fotos,
  );
  expect(r.status).toBe(201);
  await esperarCorreo();

  const [filas] = await conn.query(
    `SELECT c.orden, c.nombre, c.foto_ruta, c.foto_mime FROM duelo_companeros c
     JOIN duelo_inscripciones i ON i.id = c.inscripcion_id WHERE i.cedula = ? ORDER BY c.orden`, [cedula],
  );
  expect(filas.map((f) => [f.orden, f.nombre, f.foto_mime])).toEqual(nombres.map((n, i) => [i + 1, n, 'image/jpeg']));
  expect(fs.readdirSync(dir)).toHaveLength(antes + nombres.length);
  for (const f of filas) expect(fs.existsSync(path.join(dir, f.foto_ruta))).toBe(true);
  expect(http.post).toHaveBeenCalledWith('https://n8n.prueba/hook',
    expect.objectContaining({ companeros: nombres }), expect.any(Object));
});

test('rama No: se inscribe sin fotos', async () => {
  const r = await inscribir({ cedula: '1090000002', honra_companero: 'no' });
  expect(r.status).toBe(201);
  const [[fila]] = await conn.query("SELECT honra_companero FROM duelo_inscripciones WHERE cedula = '1090000002'");
  expect(fila.honra_companero).toBe(0);
});

test('cédula repetida: 409 amable y no duplica ni deja fotos', async () => {
  await inscribir({ cedula: '1090000003', honra_companero: 'no' });
  const antes = fs.readdirSync(dir).length;
  const r = await inscribir(
    { cedula: '1090000003', honra_companero: 'si', companeros: JSON.stringify([{ nombre: 'Luna' }]) },
    { foto_1: await jpg() },
  );
  expect(r.status).toBe(409);
  expect(r.body.message).toContain('Ya tenemos tu inscripción');
  expect(r.body.message).toContain('300 000 0000');
  const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM duelo_inscripciones WHERE cedula = '1090000003'");
  expect(n).toBe(1);
  expect(fs.readdirSync(dir)).toHaveLength(antes);
});

test('sin aceptar la política: 422', async () => {
  const r = await inscribir({ cedula: '1090000004', honra_companero: 'no', acepta_politica: 'false' });
  expect(r.status).toBe(422);
  expect(r.body.errores.acepta_politica).toBeTruthy();
});

test('un archivo que no es imagen: 422 en su campo, nada guardado y una línea de log sin contenido', async () => {
  const registro = jest.spyOn(logger, 'error').mockImplementation(() => {});
  const antes = fs.readdirSync(dir).length;
  const r = await inscribir(
    { cedula: '1090000005', honra_companero: 'si', companeros: JSON.stringify([{ nombre: 'Luna' }]) },
    { foto_1: Buffer.from('%PDF-1.7 documento') },
  );
  expect(r.status).toBe(422);
  expect(r.body.errores.companero_1_foto).toBeTruthy();
  expect(fs.readdirSync(dir)).toHaveLength(antes);
  const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM duelo_inscripciones WHERE cedula = '1090000005'");
  expect(n).toBe(0);
  expect(registro).toHaveBeenCalledWith('duelo: no se pudo procesar una foto', expect.objectContaining({ heic: false }));
  expect(JSON.stringify(registro.mock.calls)).not.toMatch(/PDF|documento|1090000005/);
  registro.mockRestore();
});

describe('cupo del evento (HTTP + MySQL real)', () => {
  const MENSAJE = 'Se completaron los cupos para este encuentro. Gracias por tu interés 🐾';
  let appCupo;
  beforeAll(() => {
    const config = { ...leerEntorno().config, fotosPath: dir, contacto: '300 000 0000', correo: { canal: 'ninguno' }, cupoMaximo: 2 };
    appCupo = express();
    appCupo.set('trust proxy', 1);
    appCupo.use(express.json());
    // Reloj que avanza 10 s por consulta: la caché de 5 s nunca sirve un conteo viejo en esta prueba.
    let reloj = 0;
    const repo = crearRepositorioInscripciones(bd);
    const disponibilidad = crearDisponibilidad({ repo, obtenerConfig: () => config, ahora: () => { reloj += 10000; return reloj; } });
    appCupo.use(BASE, crearRouterDuelo({ bd, obtenerConfig: () => config, http, repo, disponibilidad }));
  });
  const enviar = async (n) => request(await servir(appCupo)).post(`${BASE}/inscripciones`).set('Origin', ORIGEN)
    .field('nombre_completo', 'Ana Pérez').field('celular', '3001234567').field('correo', 'ana@correo.com')
    .field('acepta_politica', 'true').field('version_politica', 'borrador')
    .field('cedula', String(1090000000 + n)).field('honra_companero', 'no');
  const filas = async () => (await conn.query('SELECT COUNT(*) AS n FROM duelo_inscripciones'))[0][0].n;

  test('dos inscripciones entran, la tercera recibe 403 y no deja fila; /estado pasa a cerrado', async () => {
    expect((await enviar(1)).status).toBe(201);
    expect((await enviar(2)).status).toBe(201);
    const tercera = await enviar(3);
    expect(tercera.status).toBe(403);
    expect(tercera.body).toEqual({ success: false, motivo: 'CERRADAS', message: MENSAJE });
    expect(await filas()).toBe(2);
    const estado = await request(await servir(appCupo)).get(`${BASE}/estado`);
    expect(estado.body.data.abiertas).toBe(false);
  });

  test('concurrencia: 6 inscripciones distintas a la vez con cupo 2 → 2 con 201, 4 con 403, 2 filas', async () => {
    const respuestas = await Promise.all([1, 2, 3, 4, 5, 6].map(enviar));
    const estados = respuestas.map((r) => r.status).sort();
    expect(estados).toEqual([201, 201, 403, 403, 403, 403]);
    expect(await filas()).toBe(2);
  });
});
