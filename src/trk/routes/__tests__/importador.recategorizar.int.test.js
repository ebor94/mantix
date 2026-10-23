// Categorías v2: reimportar el CSV mueve de categoría a las mascotas sin calificar y deja como propuesta
// (TRK-PAR-007) el cambio de las que ya tienen calificaciones o están en pasarela/presentadas.
const request = require('supertest');
const { servir, cerrarServidores } = require('../../../testing/servidorPrueba');
const db = require('../../../models');
const { crearAppTrk } = require('../../testing/app');
const { limpiar, cerrar } = require('../../testing/db');
const { crearAdmin, crearOperativo, crearParticipante, categoria, calificar } = require('../../testing/fabricas');

const app = crearAppTrk();
let servidor;
let admin;
beforeAll(async () => { servidor = await servir(app); });
afterAll(cerrarServidores);
beforeEach(async () => {
  await limpiar();
  admin = await crearAdmin();
});
afterAll(cerrar);

const ENCABEZADO = 'Nombre del responsable,Documento de identidad,Nombre de la mascota,especie,raza,Cateogoría de participación';
const csv = (...filas) => Buffer.from([ENCABEZADO, ...filas].join('\n') + '\n');
const preview = (buffer) => request(servidor).post('/api/trk/v1/import/preview')
  .set('Authorization', `Bearer ${admin.token}`)
  .attach('archivo', buffer, 'inscripciones.csv');
const confirmar = (token, decisiones = {}) => request(servidor).post('/api/trk/v1/import/confirm')
  .set('Authorization', `Bearer ${admin.token}`)
  .send({ preview_token: token, decisiones });
const importar = async (buffer, decisiones) => confirmar((await preview(buffer)).body.data.preview_token, decisiones);
const idDe = async (codigo) => (await categoria(codigo)).id;
const auditorias = (accion, id) => db.TrkAuditoria.findAll({ where: { accion, entidad: 'participante', entidad_id: id } });

test('mascota sin calificaciones cambia de categoría directamente (orden al final, auditado con TRK-IMP-002)', async () => {
  const otra = await crearParticipante({ categoriaCodigo: 'MEDIANOS', orden_pasarela: 7 });
  const rex = await crearParticipante({
    mascota_nombre: 'Rex', responsable_documento: '1111111111', estado: 'PRESENTE', orden_pasarela: 2,
    foto_oficial_path: 'rex.jpg', desempate_manual: 1
  });
  const r = await importar(csv('Ana,1111111111,Rex,Perro,Criollo,Perros medianos.'));
  expect(r.status).toBe(200);
  expect(r.body.data).toEqual({ creados: 0, actualizados: 1, omitidos: 0, recategorizados: 1, propuestas: 0 });

  await rex.reload();
  expect(rex.categoria_id).toBe(await idDe('MEDIANOS'));
  expect(rex.categoria_propuesta_id).toBeNull();
  expect(rex.orden_pasarela).toBe(otra.orden_pasarela + 1);
  expect(rex.desempate_manual).toBeNull();
  expect(rex.estado).toBe('PRESENTE');
  expect(rex.foto_oficial_path).toBe('rex.jpg');
  const [audit] = await auditorias('CAMBIAR_CATEGORIA', rex.id);
  expect(audit).toMatchObject({
    api_codigo: 'TRK-IMP-002',
    antes: { categoria_id: await idDe('PEQUENOS') },
    despues: { categoria_id: await idDe('MEDIANOS') }
  });
});

test('sin orden de pasarela, al moverla sigue sin orden', async () => {
  const rex = await crearParticipante({ mascota_nombre: 'Rex', responsable_documento: '1111111111', estado: 'INSCRITO', orden_pasarela: null });
  await importar(csv('Ana,1111111111,Rex,Perro,Criollo,Perros medianos.'));
  await rex.reload();
  expect(rex.categoria_id).toBe(await idDe('MEDIANOS'));
  expect(rex.orden_pasarela).toBeNull();
});

test('la categoría decidida en la vista previa manda sobre la del CSV', async () => {
  const rex = await crearParticipante({ mascota_nombre: 'Rex', responsable_documento: '1111111111' });
  const r = await importar(csv('Ana,1111111111,Rex,Perro,Criollo,Perros pequeños y medianos.'), { categoria: { 0: 'MEDIANOS' } });
  expect(r.body.data).toMatchObject({ recategorizados: 1, propuestas: 0 });
  await rex.reload();
  expect(rex.categoria_id).toBe(await idDe('MEDIANOS'));
});

test('mascota con calificaciones: queda como propuesta (no se mueve ni se borran calificaciones)', async () => {
  const jurado = await crearOperativo('TRK_JURADO');
  const kira = await crearParticipante({ mascota_nombre: 'Kira', responsable_documento: '2222222222', estado: 'PRESENTADO', orden_pasarela: 1 });
  await calificar(kira, jurado.usuario, { CREATIVIDAD: 40, BIENESTAR: 20, PASARELA: 10 });
  const r = await importar(csv('Ana,2222222222,Kira,Perro,Criollo,Perros medianos.'));
  expect(r.body.data).toEqual({ creados: 0, actualizados: 1, omitidos: 0, recategorizados: 0, propuestas: 1 });

  await kira.reload();
  expect(kira.categoria_id).toBe(await idDe('PEQUENOS'));
  expect(kira.categoria_propuesta_id).toBe(await idDe('MEDIANOS'));
  expect(kira.orden_pasarela).toBe(1);
  expect(await db.TrkCalificacion.count({ where: { participante_id: kira.id } })).toBe(1);
  const [audit] = await auditorias('PROPONER_CATEGORIA', kira.id);
  expect(audit).toMatchObject({
    api_codigo: 'TRK-IMP-002',
    antes: { categoria_id: await idDe('PEQUENOS') },
    despues: { categoria_propuesta_id: await idDe('MEDIANOS') }
  });

  // Reimportar otra vez no duplica la propuesta ni la auditoría.
  const otra = await importar(csv('Ana,2222222222,Kira,Perro,Criollo,Perros medianos.'));
  expect(otra.body.data).toMatchObject({ recategorizados: 0, propuestas: 0 });
  expect(await auditorias('PROPONER_CATEGORIA', kira.id)).toHaveLength(1);
});

test('mascota en pasarela o presentada sin calificaciones: también queda como propuesta', async () => {
  const enPasarela = await crearParticipante({ mascota_nombre: 'Toby', responsable_documento: '3333333333', estado: 'EN_PASARELA' });
  const presentada = await crearParticipante({ mascota_nombre: 'Lola', responsable_documento: '4444444444', estado: 'PRESENTADO' });
  const r = await importar(csv(
    'Ana,3333333333,Toby,Perro,Criollo,Perros medianos.',
    'Ana,4444444444,Lola,Perro,Criollo,Perros grandes.'
  ));
  expect(r.body.data).toMatchObject({ actualizados: 2, recategorizados: 0, propuestas: 2 });
  await enPasarela.reload();
  await presentada.reload();
  expect([enPasarela.categoria_id, enPasarela.categoria_propuesta_id]).toEqual([await idDe('PEQUENOS'), await idDe('MEDIANOS')]);
  expect([presentada.categoria_id, presentada.categoria_propuesta_id]).toEqual([await idDe('PEQUENOS'), await idDe('GRANDES')]);
  expect(enPasarela.estado).toBe('EN_PASARELA');
});

test('misma categoría: no cambia nada ni cuenta', async () => {
  const rex = await crearParticipante({ mascota_nombre: 'Rex', responsable_documento: '1111111111', orden_pasarela: 3 });
  const r = await importar(csv('Ana,1111111111,Rex,Perro,Criollo,Perros pequeños.'));
  expect(r.body.data).toEqual({ creados: 0, actualizados: 1, omitidos: 0, recategorizados: 0, propuestas: 0 });
  await rex.reload();
  expect(rex.orden_pasarela).toBe(3);
  expect(await db.TrkAuditoria.count({ where: { accion: ['CAMBIAR_CATEGORIA', 'PROPONER_CATEGORIA'] } })).toBe(0);
});

test('el resumen de la importación auditado incluye los contadores nuevos', async () => {
  await crearParticipante({ mascota_nombre: 'Rex', responsable_documento: '1111111111' });
  await importar(csv('Ana,1111111111,Rex,Perro,Criollo,Perros medianos.', 'Bea,5555555555,Nina,Perro,Criollo,Perros pequeños.'));
  const audit = await db.TrkAuditoria.findOne({ where: { accion: 'IMPORTAR' } });
  expect(audit.despues).toMatchObject({ creados: 1, actualizados: 1, recategorizados: 1, propuestas: 0 });
});

test('vista previa: el texto antiguo "pequeños y medianos" trae la advertencia CATEGORIA_COMBINADA con sugerencia MEDIANOS', async () => {
  const r = await preview(csv('Ana,1111111111,Rex,Perro,Criollo,Perros pequeños y medianos.'));
  expect(r.status).toBe(200);
  const [fila] = r.body.data.filas;
  expect(fila.datos.categoria_codigo).toBe('PEQUENOS');
  expect(fila.advertencias).toContainEqual({
    codigo: 'CATEGORIA_COMBINADA', mensaje: "Categoría antigua 'pequeños y medianos': revisa si es mediano", sugerencia: 'MEDIANOS'
  });
});

test('registro fusionado: la reimportación no le cambia ni le propone categoría', async () => {
  const destino = await crearParticipante({ mascota_nombre: 'Rex', responsable_documento: '9999999999' });
  const fusionado = await crearParticipante({ mascota_nombre: 'Rex', responsable_documento: '1111111111', fusionado_en_id: destino.id });
  const r = await importar(csv('Ana,1111111111,Rex,Perro,Criollo,Perros medianos.'));
  expect(r.body.data).toMatchObject({ recategorizados: 0, propuestas: 0 });
  await fusionado.reload();
  expect([fusionado.categoria_id, fusionado.categoria_propuesta_id]).toEqual([await idDe('PEQUENOS'), null]);
});

// ---- Revisión: no deshacer arreglos manuales, no mover a categorías cerradas/publicadas ----
const editar = (id, cambios) => request(servidor).patch(`/api/trk/v1/participantes/${id}`)
  .set('Authorization', `Bearer ${admin.token}`).send(cambios);
const confirmarCategoria = (id) => request(servidor).post(`/api/trk/v1/participantes/${id}/categoria/confirmar`)
  .set('Authorization', `Bearer ${admin.token}`).send({ confirmar: true });

test('texto combinado "pequeños y medianos" sin decisión en la vista previa: nunca mueve ni propone', async () => {
  const rex = await crearParticipante({ mascota_nombre: 'Rex', responsable_documento: '1111111111', categoriaCodigo: 'MEDIANOS' });
  const r = await importar(csv('Ana,1111111111,Rex,Perro,Criollo,Perros pequeños y medianos.'));
  expect(r.body.data).toMatchObject({ actualizados: 1, recategorizados: 0, propuestas: 0 });
  await rex.reload();
  expect([rex.categoria_id, rex.categoria_propuesta_id]).toEqual([await idDe('MEDIANOS'), null]);
});

test('categoría cambiada a mano por el admin: la reimportación la propone en vez de moverla', async () => {
  const rex = await crearParticipante({ mascota_nombre: 'Rex', responsable_documento: '1111111111' });
  expect((await editar(rex.id, { categoria_id: await idDe('GRANDES') })).status).toBe(200);
  const r = await importar(csv('Ana,1111111111,Rex,Perro,Criollo,Perros medianos.'));
  expect(r.body.data).toMatchObject({ recategorizados: 0, propuestas: 1 });
  await rex.reload();
  expect([rex.categoria_id, rex.categoria_propuesta_id]).toEqual([await idDe('GRANDES'), await idDe('MEDIANOS')]);
});

test('destino cerrado o con ranking publicado: queda como propuesta', async () => {
  const rex = await crearParticipante({ mascota_nombre: 'Rex', responsable_documento: '1111111111' });
  const lola = await crearParticipante({ mascota_nombre: 'Lola', responsable_documento: '4444444444' });
  await (await categoria('MEDIANOS')).update({ abierta: false });
  await (await categoria('GRANDES')).update({ ranking_publicado: true });
  const r = await importar(csv('Ana,1111111111,Rex,Perro,Criollo,Perros medianos.', 'Ana,4444444444,Lola,Perro,Criollo,Perros grandes.'));
  expect(r.body.data).toMatchObject({ recategorizados: 0, propuestas: 2 });
  await rex.reload();
  await lola.reload();
  expect([rex.categoria_id, rex.categoria_propuesta_id]).toEqual([await idDe('PEQUENOS'), await idDe('MEDIANOS')]);
  expect([lola.categoria_id, lola.categoria_propuesta_id]).toEqual([await idDe('PEQUENOS'), await idDe('GRANDES')]);
});

test('TRK-PAR-007 no confirma hacia una categoría cerrada (409 CATEGORIA_CERRADA)', async () => {
  const rex = await crearParticipante({ mascota_nombre: 'Rex', categoria_propuesta_id: await idDe('MEDIANOS') });
  await (await categoria('MEDIANOS')).update({ abierta: false });
  const r = await confirmarCategoria(rex.id);
  expect(r.status).toBe(409);
  expect(r.body).toMatchObject({ motivo: 'CATEGORIA_CERRADA' });
  await rex.reload();
  expect([rex.categoria_id, rex.categoria_propuesta_id]).toEqual([await idDe('PEQUENOS'), await idDe('MEDIANOS')]);
});

test('la hoja coincide con la categoría actual y había propuesta pendiente: se descarta (auditado)', async () => {
  const kira = await crearParticipante({ mascota_nombre: 'Kira', responsable_documento: '2222222222', categoria_propuesta_id: await idDe('MEDIANOS') });
  const r = await importar(csv('Ana,2222222222,Kira,Perro,Criollo,Perros pequeños.'));
  expect(r.body.data).toMatchObject({ recategorizados: 0, propuestas: 0 });
  await kira.reload();
  expect(kira.categoria_propuesta_id).toBeNull();
  const [audit] = await auditorias('DESCARTAR_PROPUESTA_CATEGORIA', kira.id);
  expect(audit).toMatchObject({ api_codigo: 'TRK-IMP-002', antes: { categoria_propuesta_id: await idDe('MEDIANOS') }, despues: { categoria_propuesta_id: null } });
});

test('dos mascotas que pasan a la misma categoría reciben órdenes de pasarela distintos y crecientes', async () => {
  await crearParticipante({ categoriaCodigo: 'MEDIANOS', orden_pasarela: 5 });
  const a = await crearParticipante({ mascota_nombre: 'Rex', responsable_documento: '1111111111', orden_pasarela: 1 });
  const b = await crearParticipante({ mascota_nombre: 'Lola', responsable_documento: '4444444444', orden_pasarela: 2 });
  const r = await importar(csv('Ana,1111111111,Rex,Perro,Criollo,Perros medianos.', 'Ana,4444444444,Lola,Perro,Criollo,Perros medianos.'));
  expect(r.body.data).toMatchObject({ recategorizados: 2 });
  await a.reload();
  await b.reload();
  expect([a.orden_pasarela, b.orden_pasarela]).toEqual([6, 7]);
});
