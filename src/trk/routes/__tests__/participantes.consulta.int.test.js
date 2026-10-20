const request = require('supertest');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, categoria } = require('../../testing/fabricas');

const app = crearAppTrk();
const base = '/api/trk/v1/participantes';
const SENSIBLES = ['responsable_documento', 'responsable_telefono', 'responsable_correo', 'responsable_nombre'];

let admin; let jurado; let comentarista; let cabina;
beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
  jurado = await crearOperativo('TRK_JURADO');
  comentarista = await crearOperativo('TRK_COMENTARISTA');
  cabina = await crearOperativo('TRK_CABINA');
});
afterAll(cerrar);

const get = (url, quien) => request(app).get(url).set('Authorization', `Bearer ${quien.token}`);

test('§13.8 jurado y comentarista: detalle sin documento, teléfono ni correo', async () => {
  const p = await crearParticipante({ mascota_nombre: 'Canela', estado: 'EN_PASARELA' });
  for (const quien of [jurado, comentarista]) {
    const r = await get(`${base}/${p.id}`, quien);
    expect(r.status).toBe(200);
    expect(r.headers['x-trk-api']).toBe('TRK-PAR-002');
    for (const campo of SENSIBLES) expect(r.body.data).not.toHaveProperty(campo);
    expect(r.body.data.responsable_primer_nombre).toBe('Ana');
  }
});

test('admin y cabina sí ven datos de contacto', async () => {
  const p = await crearParticipante();
  for (const quien of [admin, cabina]) {
    const r = await get(`${base}/${p.id}`, quien);
    expect(r.body.data.responsable_telefono).toBe('3001234567');
  }
});

test('TRK-PAR-001 jurado solo ve PRESENTE o posteriores; cabina ve todos', async () => {
  await crearParticipante({ mascota_nombre: 'Inscrita', estado: 'INSCRITO' });
  await crearParticipante({ mascota_nombre: 'Ausente', estado: 'AUSENTE' });
  await crearParticipante({ mascota_nombre: 'Presente', estado: 'PRESENTE' });
  await crearParticipante({ mascota_nombre: 'Presentada', estado: 'PRESENTADO' });
  const rJ = await get(base, jurado);
  expect(rJ.headers['x-trk-api']).toBe('TRK-PAR-001');
  expect(rJ.body.data.map((x) => x.mascota_nombre).sort()).toEqual(['Presentada', 'Presente']);
  for (const x of rJ.body.data) for (const campo of SENSIBLES) expect(x).not.toHaveProperty(campo);
  const rC = await get(base, cabina);
  expect(rC.body.data).toHaveLength(4);
});

test('participante no visible para el rol → 404', async () => {
  const p = await crearParticipante({ estado: 'INSCRITO' });
  expect((await get(`${base}/${p.id}`, jurado)).status).toBe(404);
});

test('HU-5 CA1 búsqueda tolerante a tildes y mayúsculas por mascota, responsable o últimos dígitos del documento', async () => {
  await crearParticipante({ mascota_nombre: 'Misifú', responsable_nombre: 'Sofía Márquez', responsable_documento: '20304050' });
  await crearParticipante({ mascota_nombre: 'Rocky', responsable_nombre: 'Pedro Alba', responsable_documento: '10203040' });
  const nombres = async (q) => (await get(`${base}?q=${encodeURIComponent(q)}`, cabina)).body.data.map((x) => x.mascota_nombre);
  expect(await nombres('MISIFU')).toEqual(['Misifú']);
  expect(await nombres('marquez')).toEqual(['Misifú']);
  expect(await nombres('3040')).toEqual(['Rocky']);
});

test('RNF-5 búsqueda pública solo por nombre de mascota (no es oráculo de documento ni responsable)', async () => {
  await crearParticipante({ mascota_nombre: 'Misifú', responsable_nombre: 'Sofía Márquez', responsable_documento: '20304050', estado: 'PRESENTE' });
  await crearParticipante({ mascota_nombre: 'Rocky', responsable_nombre: 'Pedro Alba', responsable_documento: '10203040', estado: 'PRESENTE' });
  const nombres = async (q, quien) => (await get(`${base}?q=${encodeURIComponent(q)}`, quien)).body.data.map((x) => x.mascota_nombre);
  for (const quien of [jurado, comentarista]) {
    expect(await nombres('3040', quien)).toEqual([]);
    expect(await nombres('marquez', quien)).toEqual([]);
    expect(await nombres('misifu', quien)).toEqual(['Misifú']);
  }
  expect(await nombres('3040', cabina)).toEqual(['Rocky']);
});

test('jurado con estado no visible (INSCRITO) → lista vacía', async () => {
  await crearParticipante({ mascota_nombre: 'Inscrita', estado: 'INSCRITO' });
  await crearParticipante({ mascota_nombre: 'Presente', estado: 'PRESENTE' });
  const r = await get(`${base}?estado=INSCRITO`, jurado);
  expect(r.status).toBe(200);
  expect(r.body.data).toEqual([]);
});

test('los comodines LIKE (% _ \\) se buscan literalmente', async () => {
  await crearParticipante({ mascota_nombre: 'Rocky' });
  await crearParticipante({ mascota_nombre: 'Misifú' });
  for (const q of ['_', '%', '\\']) {
    const r = await get(`${base}?q=${encodeURIComponent(q)}`, cabina);
    expect(r.body.data).toEqual([]);
  }
});

test('comentarista: lista sin datos sensibles y categoría reducida', async () => {
  await crearParticipante({ mascota_nombre: 'Canela', estado: 'PRESENTE' });
  const r = await get(base, comentarista);
  expect(r.body.data).toHaveLength(1);
  for (const x of r.body.data) {
    for (const campo of SENSIBLES) expect(x).not.toHaveProperty(campo);
    expect(Object.keys(x.categoria).sort()).toEqual(['codigo', 'id', 'nombre']);
  }
});

test('filtros por categoría y estado; orden por orden de pasarela', async () => {
  const grandes = await categoria('GRANDES');
  await crearParticipante({ mascota_nombre: 'B', categoriaCodigo: 'GRANDES', orden_pasarela: 2 });
  await crearParticipante({ mascota_nombre: 'A', categoriaCodigo: 'GRANDES', orden_pasarela: 1 });
  await crearParticipante({ mascota_nombre: 'C', categoriaCodigo: 'PEQ_MED' });
  const r = await get(`${base}?categoria=${grandes.id}&estado=PRESENTE`, cabina);
  expect(r.body.data.map((x) => x.mascota_nombre)).toEqual(['A', 'B']);
});

test('fusionados no aparecen', async () => {
  const destino = await crearParticipante({ mascota_nombre: 'Destino' });
  await crearParticipante({ mascota_nombre: 'Origen', fusionado_en_id: destino.id });
  const r = await get(base, cabina);
  expect(r.body.data.map((x) => x.mascota_nombre)).toEqual(['Destino']);
});

test('sin sesión → 401 (la pantalla pública no usa este endpoint)', async () => {
  expect((await request(app).get(base)).status).toBe(401);
});
