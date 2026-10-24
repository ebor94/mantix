// Reinicio del evento: borra mascotas, fotos y calificaciones; conserva configuración, usuarios e historial.
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');
const db = require('../../../models');
const { limpiar, cerrar } = require('../../testing/db');
const { crearOperativo, crearParticipante, calificar, borrador, categoria } = require('../../testing/fabricas');
const { reiniciarEvento } = require('../reiniciar-evento');

const q = async (sql) => (await db.sequelize.query(sql))[0];
const n = async (sql) => Number((await q(sql))[0].n);
let conn;
let dir;

beforeAll(async () => {
  conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, multipleStatements: true, charset: 'utf8mb4'
  });
});
beforeEach(async () => {
  await limpiar();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trk-reinicio-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
afterAll(async () => { await conn.end(); await cerrar(); });

async function sembrar() {
  const jurado = await crearOperativo('TRK_JURADO');
  const cabina = await crearOperativo('TRK_CABINA');
  const peq = await categoria('PEQUENOS');
  const kira = await crearParticipante({ mascota_nombre: 'Kira', estado: 'PRESENTADO', foto_oficial_path: 'kira.jpg' });
  const toby = await crearParticipante({ mascota_nombre: 'Toby', estado: 'EN_PASARELA' });
  await crearParticipante({ mascota_nombre: 'Kira bis', estado: 'INSCRITO', fusionado_en_id: kira.id });
  await calificar(kira, jurado.usuario, { CREATIVIDAD: 40, BIENESTAR: 25, PASARELA: 15 });
  await borrador(toby, jurado.usuario, { CREATIVIDAD: 30 });
  await db.TrkRankingSnapshot.create({ categoria_id: peq.id, publicado_por: null, datos: { filas: [] } });
  await db.TrkCategoria.update({ ranking_publicado: true, abierta: false }, { where: { id: peq.id } });
  await db.TrkEventoEstado.update({ participante_en_pasarela_id: toby.id, modo_pantalla: 'RANKING', categoria_pantalla_id: peq.id }, { where: { id: 1 } });
  await db.TrkAuditoria.create({ api_codigo: 'TRK-TEST', entidad: 'participante', entidad_id: kira.id, accion: 'CREAR' });
  await db.TrkImportacion.create({ archivo_nombre: 'a.csv', archivo_sha256: 'a'.repeat(64), filas_total: 3, filas_ok: 3, filas_advertencia: 0 });
  fs.writeFileSync(path.join(dir, 'kira.jpg'), 'x');
  fs.writeFileSync(path.join(dir, 'otra.jpg'), 'y');
  fs.mkdirSync(path.join(dir, 'subcarpeta'));
  fs.writeFileSync(path.join(dir, 'subcarpeta', 'intacta.jpg'), 'z');
  return { jurado, cabina };
}

async function fotografia() {
  return {
    categorias: await q('SELECT id, codigo, nombre, color, orden, rubrica_id, puestos_premiados FROM trk_categorias ORDER BY id'),
    rubricas: await q('SELECT * FROM trk_rubricas ORDER BY id'),
    criterios: await q('SELECT * FROM trk_criterios ORDER BY id'),
    accesos: await q('SELECT usuario_id, pin_hash, token_version FROM trk_accesos ORDER BY usuario_id'),
    usuarios: await q('SELECT id, email, rol_id, activo FROM usuarios ORDER BY id'),
    roles: await q('SELECT * FROM roles ORDER BY id'),
    migraciones: await q('SELECT nombre FROM trk_migraciones ORDER BY nombre'),
    auditoria: await n('SELECT COUNT(*) AS n FROM trk_auditoria'),
    importaciones: await n('SELECT COUNT(*) AS n FROM trk_importaciones')
  };
}

test('sin --confirmar: solo cuenta, no borra nada', async () => {
  await sembrar();
  const antes = await fotografia();
  const r = await reiniciarEvento(conn, { dirFotos: dir });
  expect(r.confirmado).toBe(false);
  expect(r.conteos).toMatchObject({
    trk_participantes: 3, 'trk_participantes (fusionados)': 1, trk_calificaciones: 1, trk_borradores: 1,
    trk_ranking_snapshots: 1, 'trk_categorias con ranking publicado': 1, 'trk_categorias cerradas': 1
  });
  expect(r.conteos.trk_calificacion_detalle).toBeGreaterThan(0);
  expect(r.fotos).toBe(2);
  expect(await n('SELECT COUNT(*) AS n FROM trk_participantes')).toBe(3);
  expect(fs.readdirSync(dir).sort()).toEqual(['kira.jpg', 'otra.jpg', 'subcarpeta']);
  expect(await fotografia()).toEqual(antes);
});

test('con confirmar: borra mascotas, calificaciones y fotos; reinicia estado; conserva lo demás', async () => {
  await sembrar();
  const antes = await fotografia();
  const r = await reiniciarEvento(conn, { confirmar: true, dirFotos: dir });
  expect(r).toMatchObject({ confirmado: true, fotos: 2, fotosBorradas: 2, erroresFotos: [] });

  for (const t of ['trk_participantes', 'trk_calificaciones', 'trk_calificacion_detalle', 'trk_borradores', 'trk_ranking_snapshots']) {
    expect(await n(`SELECT COUNT(*) AS n FROM ${t}`)).toBe(0);
  }
  expect(await q('SELECT participante_en_pasarela_id, modo_pantalla, categoria_pantalla_id FROM trk_evento_estado')).toEqual([
    { participante_en_pasarela_id: null, modo_pantalla: 'PASARELA', categoria_pantalla_id: null }
  ]);
  expect(await n('SELECT COUNT(*) AS n FROM trk_categorias WHERE ranking_publicado = 1 OR abierta = 0')).toBe(0);
  expect(await fotografia()).toEqual(antes);
  expect(antes.categorias).toHaveLength(5);
  expect(antes.accesos.length).toBeGreaterThanOrEqual(2);

  // Solo archivos directos del directorio; el directorio y las subcarpetas quedan.
  expect(fs.existsSync(dir)).toBe(true);
  expect(fs.readdirSync(dir)).toEqual(['subcarpeta']);
  expect(fs.existsSync(path.join(dir, 'subcarpeta', 'intacta.jpg'))).toBe(true);
});

test('con BD vacía y sin directorio de fotos no falla', async () => {
  const r = await reiniciarEvento(conn, { confirmar: true, dirFotos: path.join(dir, 'no-existe') });
  expect(r).toMatchObject({ confirmado: true, fotos: 0, fotosBorradas: 0 });
});
