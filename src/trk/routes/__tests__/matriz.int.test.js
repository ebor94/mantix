const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const db = require('../../../models');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, categoria, criteriosDe, calificar, borrador } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
afterAll(cerrar);

let jurado; let otro;
beforeEach(async () => {
  await limpiar();
  jurado = await crearOperativo('TRK_JURADO', { nombre: 'J1' });
  otro = await crearOperativo('TRK_JURADO', { nombre: 'J2' });
});

const conToken = (r, quien) => r.set('Authorization', `Bearer ${quien.token}`);
const matriz = (quien = jurado, query = '') => conToken(request(servidor).get(`/api/trk/v1/jurado/matriz${query}`), quien);
const guardar = (p, puntajes, quien = jurado) => conToken(request(servidor).put(`/api/trk/v1/borradores/${p.id}`).send({ puntajes }), quien);
async function enPasarela(p) {
  await p.update({ estado: 'EN_PASARELA' });
  await db.TrkEventoEstado.update({ participante_en_pasarela_id: p.id }, { where: { id: 1 } });
}
const puntos = (c, b, pa) => ({ CREATIVIDAD: c, BIENESTAR: b, PASARELA: pa });
const DATOS_RESPONSABLE = ['responsable_nombre', 'responsable_documento', 'responsable_telefono', 'responsable_correo', 'responsable_primer_nombre'];

test('TRK-CAL-004 por defecto muestra la categoría de quien está en pasarela: EN_PASARELA primero y luego PRESENTADO (CA1, CA2)', async () => {
  const kira = await crearParticipante({ mascota_nombre: 'Kira', estado: 'PRESENTADO', orden_pasarela: 1 });
  const toby = await crearParticipante({ mascota_nombre: 'Toby', orden_pasarela: 2 });
  await enPasarela(toby);
  await crearParticipante({ mascota_nombre: 'Rocky', estado: 'PRESENTE' });
  await crearParticipante({ mascota_nombre: 'Canela', estado: 'INSCRITO' });
  await crearParticipante({ mascota_nombre: 'Nube', estado: 'AUSENTE' });
  await crearParticipante({ mascota_nombre: 'Copia', estado: 'PRESENTADO', fusionado_en_id: kira.id });
  await crearParticipante({ mascota_nombre: 'Misu', estado: 'PRESENTADO', categoriaCodigo: 'FELINOS', especie: 'GATO' });

  const r = await matriz();
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-CAL-004');
  const cat = await categoria('PEQUENOS');
  expect(r.body.data.categoria).toEqual({ id: cat.id, codigo: 'PEQUENOS', nombre: 'Caninos raza pequeña', color: '#FD7218', abierta: true });
  expect(r.body.data.categorias.map((c) => c.codigo)).toEqual(['MEDIANOS', 'PEQUENOS', 'FELINOS', 'GRANDES', 'FAMILIAR']);
  expect(r.body.data.categorias.map((c) => c.color)).toEqual(['#4C9F43', '#FD7218', '#186EDD', '#FED104', '#DA1F12']);
  for (const f of r.body.data.filas) expect(f.participante.categoria).toMatchObject({ codigo: 'PEQUENOS', color: '#FD7218' });
  expect(r.body.data.filas.map((f) => f.participante.mascota_nombre)).toEqual(['Toby', 'Kira']);
  for (const f of r.body.data.filas) for (const campo of DATOS_RESPONSABLE) expect(f.participante).not.toHaveProperty(campo);
});

test('criterios y máximos salen de la rúbrica sembrada; fila nueva con borrador vacío y sin final (CA3)', async () => {
  const toby = await crearParticipante({ mascota_nombre: 'Toby' });
  await enPasarela(toby);
  const criterios = await criteriosDe(toby);
  const { data } = (await matriz()).body;
  expect(data.criterios.map((c) => [c.id, c.codigo, c.puntaje_max])).toEqual(criterios.map((c) => [c.id, c.codigo, c.puntaje_max]));
  expect(data.puntaje_total_max).toBe(criterios.reduce((s, c) => s + c.puntaje_max, 0));
  expect(data.filas[0].borrador).toEqual(Object.fromEntries(criterios.map((c) => [String(c.id), null])));
  expect(data.filas[0].final).toEqual({ estado: null, total: null, puntajes: null });
});

test('?categoria= muestra otra categoría; inexistente → 404; sin nadie en pasarela ni parámetro → categoria null', async () => {
  await crearParticipante({ mascota_nombre: 'Misu', estado: 'PRESENTADO', categoriaCodigo: 'FELINOS', especie: 'GATO' });
  const felinos = await categoria('FELINOS');
  const vacia = (await matriz()).body.data;
  expect(vacia).toMatchObject({ categoria: null, criterios: [], filas: [], puntaje_total_max: 0 });
  expect(vacia.categorias).toHaveLength(5);
  const r = await matriz(jurado, `?categoria=${felinos.id}`);
  expect(r.body.data.filas.map((f) => f.participante.mascota_nombre)).toEqual(['Misu']);
  const no = await matriz(jurado, '?categoria=9999');
  expect([no.status, no.body.motivo, no.body.error]).toEqual([404, 'NO_ENCONTRADO', 'TRK-CAL-004']);
});

test('TRK-CAL-005 guarda parcial, la última escritura gana, null vacía la casilla y es privado del jurado (CA5, CA9)', async () => {
  const toby = await crearParticipante({ mascota_nombre: 'Toby' });
  await enPasarela(toby);
  const [c1, c2] = await criteriosDe(toby);

  let r = await guardar(toby, [{ criterio_id: c1.id, puntaje: 10 }]);
  expect(r.status).toBe(200);
  expect(r.headers['x-trk-api']).toBe('TRK-CAL-005');
  expect(r.body.data.participante_id).toBe(toby.id);
  expect(r.body.data.borrador[c1.id]).toBe(10);
  expect(r.body.data.borrador[c2.id]).toBeNull();

  r = await guardar(toby, [{ criterio_id: c1.id, puntaje: 12 }, { criterio_id: c2.id, puntaje: 3 }]);
  expect(r.body.data.borrador).toMatchObject({ [c1.id]: 12, [c2.id]: 3 });
  r = await guardar(toby, [{ criterio_id: c2.id, puntaje: null }]);
  expect(r.body.data.borrador).toMatchObject({ [c1.id]: 12, [c2.id]: null });
  expect(await db.TrkBorrador.count()).toBe(2);

  expect((await matriz()).body.data.filas[0].borrador[c1.id]).toBe(12);
  expect((await matriz(otro)).body.data.filas[0].borrador[c1.id]).toBeNull();
  expect(await db.TrkCalificacion.count()).toBe(0);
  expect(await db.TrkAuditoria.count({ where: { api_codigo: 'TRK-CAL-005' } })).toBe(0);
});

test('TRK-CAL-005: puntaje fuera de 0..máx o decimal → 422; criterio ajeno o repetido → 400; nada se guarda', async () => {
  const toby = await crearParticipante({ mascota_nombre: 'Toby' });
  await enPasarela(toby);
  const [c1] = await criteriosDe(toby);
  const familiar = await crearParticipante({ estado: 'PRESENTADO', categoriaCodigo: 'FAMILIAR' });
  const [ajeno] = await criteriosDe(familiar); // misma codificación, otra rúbrica

  const alto = await guardar(toby, [{ criterio_id: c1.id, puntaje: c1.puntaje_max + 1 }]);
  expect([alto.status, alto.body.motivo, alto.body.error]).toEqual([422, 'PUNTAJE_FUERA_DE_RANGO', 'TRK-CAL-005']);
  expect((await guardar(toby, [{ criterio_id: c1.id, puntaje: 1.5 }])).status).toBe(422);
  expect((await guardar(toby, [{ criterio_id: c1.id, puntaje: -1 }])).status).toBe(422);
  const ajenoR = await guardar(toby, [{ criterio_id: ajeno.id, puntaje: 1 }]);
  expect([ajenoR.status, ajenoR.body.motivo]).toEqual([400, 'VALIDACION']);
  expect((await guardar(toby, [{ criterio_id: c1.id, puntaje: 1 }, { criterio_id: c1.id, puntaje: 2 }])).status).toBe(400);
  expect((await guardar(toby, [])).status).toBe(400);
  expect(await db.TrkBorrador.count()).toBe(0);
});

test('TRK-CAL-005: no ha desfilado → 409 ESTADO_INVALIDO; final bloqueada → 409 CALIFICACION_BLOQUEADA; categoría cerrada → 409 CATEGORIA_CERRADA', async () => {
  const rocky = await crearParticipante({ estado: 'PRESENTE' });
  const [c] = await criteriosDe(rocky);
  const r1 = await guardar(rocky, [{ criterio_id: c.id, puntaje: 1 }]);
  expect([r1.status, r1.body.motivo]).toEqual([409, 'ESTADO_INVALIDO']);

  const kira = await crearParticipante({ estado: 'PRESENTADO' });
  await calificar(kira, jurado.usuario, puntos(40, 25, 15));
  const r2 = await guardar(kira, [{ criterio_id: c.id, puntaje: 1 }]);
  expect([r2.status, r2.body.motivo]).toEqual([409, 'CALIFICACION_BLOQUEADA']);
  expect((await guardar(kira, [{ criterio_id: c.id, puntaje: 1 }], otro)).status).toBe(200);

  const luna = await crearParticipante({ estado: 'PRESENTADO' });
  await db.TrkCategoria.update({ abierta: false }, { where: { id: luna.categoria_id } });
  const r3 = await guardar(luna, [{ criterio_id: c.id, puntaje: 1 }]);
  expect([r3.status, r3.body.motivo]).toEqual([409, 'CATEGORIA_CERRADA']);
});

test('la matriz muestra FINAL / DESBLOQUEADA; desbloqueada sin borrador parte de la calificación final y vuelve a ser editable (CA7)', async () => {
  const kira = await crearParticipante({ mascota_nombre: 'Kira', estado: 'PRESENTADO' });
  const cat = await categoria('PEQUENOS');
  const valores = puntos(40, 25, 15);
  const cal = await calificar(kira, jurado.usuario, valores);
  const criterios = await criteriosDe(kira);
  const esperado = Object.fromEntries(criterios.map((c) => [String(c.id), valores[c.codigo]]));

  let fila = (await matriz(jurado, `?categoria=${cat.id}`)).body.data.filas[0];
  expect(fila.final).toEqual({ estado: 'FINAL', total: 80, puntajes: esperado });

  await cal.update({ bloqueada: false });
  fila = (await matriz(jurado, `?categoria=${cat.id}`)).body.data.filas[0];
  expect(fila.final.estado).toBe('DESBLOQUEADA');
  expect(fila.borrador).toEqual(esperado);
  expect((await guardar(kira, [{ criterio_id: criterios[0].id, puntaje: 1 }])).status).toBe(200);
  fila = (await matriz(jurado, `?categoria=${cat.id}`)).body.data.filas[0];
  expect(fila.borrador[criterios[0].id]).toBe(1);
  expect(fila.borrador[criterios[1].id]).toBe(valores[criterios[1].codigo]);
});

test('sin permiso calificar → 403 en ambos endpoints', async () => {
  const cabina = await crearOperativo('TRK_CABINA');
  const toby = await crearParticipante({ estado: 'PRESENTADO' });
  const [c] = await criteriosDe(toby);
  expect((await matriz(cabina)).status).toBe(403);
  expect((await guardar(toby, [{ criterio_id: c.id, puntaje: 1 }], cabina)).status).toBe(403);
});

test('CA9 (regresión): los borradores no cuentan en el ranking en vivo ni en el tablero de progreso', async () => {
  const admin = await crearAdmin();
  const toby = await crearParticipante({ mascota_nombre: 'Toby', estado: 'PRESENTADO' });
  await borrador(toby, jurado.usuario, puntos(43, 28, 18));
  const cat = await categoria('PEQUENOS');

  const rk = await conToken(request(servidor).get(`/api/trk/v1/ranking/${cat.id}`), admin);
  expect(rk.status).toBe(200);
  const fila = rk.body.data.filas.find((f) => f.participante_id === toby.id);
  expect(fila).toMatchObject({ completa: false, puesto: null });
  expect(fila.calificaciones).toEqual([]);

  const tb = await conToken(request(servidor).get('/api/trk/v1/evento/tablero'), admin);
  expect(tb.body.data.jurados.find((j) => j.id === jurado.usuario.id)).toMatchObject({ calificadas: 0, pendientes: 1 });
});
