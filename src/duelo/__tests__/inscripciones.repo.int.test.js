const { crearBdDePrueba, abrirConexion } = require('../testing/bd');
const { crearRepositorioInscripciones } = require('../repositorios/inscripciones');

const bd = crearBdDePrueba();
const repo = crearRepositorioInscripciones(bd);
let conn;

beforeAll(async () => { conn = await abrirConexion(); });
beforeEach(async () => { await conn.query('DELETE FROM duelo_inscripciones'); });
afterAll(async () => { await conn.end(); await bd.cerrar(); });

const UTM_VACIO = { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, fbclid: null };
const persona = (extra = {}) => ({
  nombre_completo: 'Ana Pérez', cedula: '1090000001', celular: '3001234567', correo: 'ana@correo.com',
  honra_companero: false, version_politica: 'borrador', ip: '10.0.0.1', user_agent: 'jest', utm: UTM_VACIO, ...extra,
});
const companero = (orden, nombre) => ({
  orden, nombre, foto_ruta: `0000000${orden}-0000-0000-0000-000000000000.jpg`, foto_mime: 'image/jpeg', foto_bytes: 1234,
});

test('crea una inscripción sin compañeros y registra la autorización', async () => {
  const id = await repo.crear(persona({ utm: { ...UTM_VACIO, utm_source: 'facebook' } }), []);
  const [[fila]] = await conn.query('SELECT * FROM duelo_inscripciones WHERE id = ?', [id]);
  expect(fila).toMatchObject({
    cedula: '1090000001', honra_companero: 0, acepta_politica: 1, version_politica: 'borrador',
    utm_source: 'facebook', correo_enviado: 0, ip: '10.0.0.1',
  });
  expect(fila.fecha_aceptacion).toBeInstanceOf(Date);
  expect(await repo.existeCedula('1090000001')).toBe(true);
  expect(await repo.existeCedula('999')).toBe(false);
});

test('crea compañeros en la misma transacción', async () => {
  const id = await repo.crear(persona({ honra_companero: true }), [companero(1, 'Luna'), companero(2, 'Max')]);
  const [filas] = await conn.query('SELECT orden, nombre FROM duelo_companeros WHERE inscripcion_id = ? ORDER BY orden', [id]);
  expect(filas).toEqual([{ orden: 1, nombre: 'Luna' }, { orden: 2, nombre: 'Max' }]);
});

test('cédula repetida lanza CEDULA_DUPLICADA y no deja compañeros huérfanos', async () => {
  await repo.crear(persona(), []);
  await expect(repo.crear(persona({ honra_companero: true }), [companero(1, 'Luna')]))
    .rejects.toMatchObject({ statusCode: 409, motivo: 'CEDULA_DUPLICADA' });
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM duelo_companeros');
  expect(n).toBe(0);
});

test('marcarCorreo guarda el resultado', async () => {
  const id = await repo.crear(persona(), []);
  await repo.marcarCorreo(id, false, 'timeout');
  const [[fila]] = await conn.query('SELECT correo_enviado, correo_error FROM duelo_inscripciones WHERE id = ?', [id]);
  expect(fila).toEqual({ correo_enviado: 0, correo_error: 'timeout' });
});

test('listar devuelve todas las inscripciones (id DESC) con sus compañeros y los totales', async () => {
  await repo.crear(persona(), []);
  await repo.crear(
    persona({ nombre_completo: 'Luis Gómez', cedula: '1090000002', correo: 'luis@correo.com', honra_companero: true }),
    [companero(1, 'Luna')],
  );
  const todo = await repo.listar();
  expect(todo.inscripciones.map((i) => i.cedula)).toEqual(['1090000002', '1090000001']);
  expect(todo.totales).toEqual({ inscritos: 2, honran: 1, fotos: 1 });
  expect(todo.inscripciones[0].companeros).toEqual([{ id: expect.any(Number), orden: 1, nombre: 'Luna' }]);
  // La búsqueda la hace el panel en el navegador: el repositorio ya no recibe término.
  expect((await repo.listar('gómez')).inscripciones).toHaveLength(2);
});

test('companeroPorId y fotosParaZip', async () => {
  await repo.crear(persona({ honra_companero: true }), [companero(1, 'Luna')]);
  const { inscripciones } = await repo.listar();
  const idCompanero = inscripciones[0].companeros[0].id;
  expect(await repo.companeroPorId(idCompanero)).toEqual({ id: idCompanero, foto_ruta: companero(1).foto_ruta });
  expect(await repo.companeroPorId(999999)).toBeNull();
  expect(await repo.fotosParaZip()).toEqual([
    { cedula: '1090000001', orden: 1, nombre: 'Luna', foto_ruta: companero(1).foto_ruta },
  ]);
});
