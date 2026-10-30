// src/porteria/__tests__/flujo.int.test.js
// Flujo HTTP completo con servicios reales sobre la base de pruebas. Placas F8…, ids 2801-2899.
const request = require('supertest');
const { servir, cerrarServidores } = require('../../testing/servidorPrueba');
const { abrirConexion, crearBdDePrueba } = require('../testing/bd');
const { crearAppPrueba, tokenDe } = require('../testing/appPrueba');
const { crearH360Lectura } = require('../services/h360Lectura.service');
const { crearRepositorioMotivos } = require('../repositorios/motivos');
const { crearRepositorioVehiculosExternos } = require('../repositorios/vehiculosExternos');
const { crearServicioEventos } = require('../services/eventos.service');
const { crearServicioEstado } = require('../services/estado.service');

let conn;
let bd;
let app;
let entrega;

beforeAll(async () => {
  conn = await abrirConexion();
  bd = crearBdDePrueba();
  for (const t of ['por_eventos', 'por_estado_vehiculo', 'por_vehiculos_externos']) await conn.query(`DELETE FROM ${t} WHERE placa LIKE 'F8%'`);
  await conn.query('DELETE FROM sedes WHERE id BETWEEN 2800 AND 2899');
  await conn.query("INSERT INTO sedes (id, codigo, nombre, ciudad, activo) VALUES (2801, 'F8', 'F8', 'Cúcuta', 1)");
  [[{ id: entrega }]] = await conn.query("SELECT id FROM por_motivos WHERE codigo = 'ENTREGA_MERCANCIA'");
  const h360 = crearH360Lectura(bd);
  const motivos = crearRepositorioMotivos(bd);
  const vehiculosExternos = crearRepositorioVehiculosExternos(bd);
  const conductores = { listar: async () => [], buscar: async () => ({ conductor: null, listaCompleta: true }) };
  ({ app } = crearAppPrueba({
    bd, h360, motivos, vehiculosExternos, conductores,
    eventos: crearServicioEventos({ bd, h360, conductores, motivos, vehiculosExternos }),
    estado: crearServicioEstado({ bd, h360, vehiculosExternos }),
  }));
});
afterEach(cerrarServidores);
afterAll(async () => {
  await bd.cerrar();
  await conn.end();
});

test('ingreso y salida de un proveedor por HTTP', async () => {
  const guarda = tokenDe({ sede: { id: 2801, nombre: 'F8' } });
  const servidor = await servir(app);
  const conSesion = (r) => r.set('Authorization', `Bearer ${guarda}`);
  const proveedor = { placa: 'F8V-001', tipo_vehiculo: 'PROVEEDOR', motivo_id: entrega, empresa: 'Cofres SA', conductor_nombre: 'Ana', conductor_documento: '9' };

  const ingreso = await conSesion(request(servidor).post('/api/porteria/v1/eventos')).send({ ...proveedor, sentido: 'INGRESO' });
  expect(ingreso.status).toBe(201);
  expect(ingreso.body.data).toMatchObject({ placa: 'F8V001', sede_id: 2801, registrado_por: 'guarda1' });

  const dentro = await conSesion(request(servidor).get('/api/porteria/v1/estado/dentro'));
  expect(dentro.body.data.map((e) => e.placa)).toContain('F8V001');

  const sugerencia = await conSesion(request(servidor).get('/api/porteria/v1/estado/placa/f8v-001'));
  expect(sugerencia.body.data.sentido_sugerido).toBe('SALIDA');

  const repetido = await conSesion(request(servidor).post('/api/porteria/v1/eventos')).send({ ...proveedor, sentido: 'INGRESO' });
  expect(repetido.status).toBe(409);
  expect(repetido.body).toMatchObject({ error: 'POR-EVT-001', motivo: 'SENTIDO_INCOHERENTE' });

  const salida = await conSesion(request(servidor).post('/api/porteria/v1/eventos')).send({ ...proveedor, sentido: 'SALIDA' });
  expect(salida.status).toBe(201);

  const lista = await conSesion(request(servidor).get('/api/porteria/v1/eventos?placa=F8V001'));
  expect(lista.body.data).toMatchObject({ total: 2, pagina: 1, por_pagina: 50 });
  expect(lista.body.data.items.map((e) => e.sentido)).toEqual(['SALIDA', 'INGRESO']);
});
